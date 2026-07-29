use crate::runtime::ServerLaunch;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

pub(crate) const START_TIMEOUT: Duration = Duration::from_secs(180);
pub(crate) const STOP_TIMEOUT: Duration = Duration::from_secs(60);
pub(crate) const MAX_LOG_LINES: usize = 80;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerTestReport {
    pub logs: Vec<String>,
    pub paper_ready: bool,
    pub plugin_ready: bool,
    pub bridge_ready: bool,
    pub port_ready: bool,
    pub clean_exit: bool,
}

#[derive(Debug)]
pub struct ServerTestFailure {
    pub message: String,
    pub logs: Vec<String>,
}

#[derive(Default)]
pub(crate) struct ReadinessSignals {
    paper: bool,
    plugin: bool,
    bridge: bool,
}

pub(crate) struct SpawnedServer {
    pub child: Child,
    pub output: mpsc::Receiver<String>,
    pub bridge_secret: Vec<u8>,
}

pub fn run(launch: ServerLaunch) -> Result<ServerTestReport, ServerTestFailure> {
    let SpawnedServer {
        mut child,
        output: receiver,
        ..
    } = spawn_server(&launch)?;
    let mut logs = Vec::new();
    let mut signals = ReadinessSignals::default();
    let started = Instant::now();

    while started.elapsed() < START_TIMEOUT {
        if let Ok(line) = receiver.recv_timeout(Duration::from_millis(250)) {
            inspect_line(
                &redact_line(&line, &launch.runtime_directory),
                &mut logs,
                &mut signals,
            );
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|_| failure("Paper process status could not be inspected.", logs.clone()))?
        {
            drain_output(
                &receiver,
                &launch.runtime_directory,
                &mut logs,
                &mut signals,
            );
            return Err(failure(
                &format!(
                    "Paper stopped before the readiness test completed (exit {}). Review the in-app server log.",
                    status
                        .code()
                        .map_or_else(|| "unknown".to_string(), |code| code.to_string())
                ),
                logs,
            ));
        }
        if signals.complete() {
            break;
        }
    }

    if !signals.complete() {
        stop_or_kill(&mut child);
        drain_output(
            &receiver,
            &launch.runtime_directory,
            &mut logs,
            &mut signals,
        );
        return Err(failure(
            "Paper did not report server, plugin, and authenticated bridge readiness within three minutes.",
            logs,
        ));
    }

    let port_ready = loopback_connects(launch.configuration.server_port);
    if !port_ready {
        stop_or_kill(&mut child);
        drain_output(
            &receiver,
            &launch.runtime_directory,
            &mut logs,
            &mut signals,
        );
        return Err(failure(
            "Paper reported Ready, but its local Minecraft port could not be reached.",
            logs,
        ));
    }

    let clean_exit = request_clean_stop(&mut child);
    drain_output(
        &receiver,
        &launch.runtime_directory,
        &mut logs,
        &mut signals,
    );
    if !clean_exit {
        return Err(failure(
            "Paper did not stop cleanly after the readiness test and was terminated.",
            logs,
        ));
    }

    Ok(ServerTestReport {
        logs,
        paper_ready: signals.paper,
        plugin_ready: signals.plugin,
        bridge_ready: signals.bridge,
        port_ready,
        clean_exit,
    })
}

pub(crate) fn spawn_server(launch: &ServerLaunch) -> Result<SpawnedServer, ServerTestFailure> {
    ensure_port_available(launch.configuration.server_port)?;
    std::fs::create_dir_all(launch.bridge_directory.join("inbox")).map_err(|_| {
        failure(
            "The authenticated Paper bridge directory could not be prepared.",
            Vec::new(),
        )
    })?;
    std::fs::create_dir_all(launch.bridge_directory.join("outbox")).map_err(|_| {
        failure(
            "The authenticated Paper bridge directory could not be prepared.",
            Vec::new(),
        )
    })?;

    let mut secret = [0_u8; 32];
    getrandom::fill(&mut secret).map_err(|_| {
        failure(
            "A secure one-time Paper bridge credential could not be created.",
            Vec::new(),
        )
    })?;
    let encoded_secret = URL_SAFE_NO_PAD.encode(secret);

    let mut command = Command::new(&launch.java_path);
    command
        .arg("-Xms1G")
        .arg(format!("-Xmx{}G", launch.configuration.max_heap_gib))
        .arg(format!(
            "-Dbadgerbots.bridge.dir={}",
            launch.bridge_directory.display()
        ))
        .arg(format!(
            "-Dbadgerbots.teacherUsername={}",
            launch.configuration.teacher_username
        ))
        .arg(format!("-Dbadgerbots.paperSha256={}", launch.paper_sha256))
        .arg(format!(
            "-Dbadgerbots.pluginSha256={}",
            launch.plugin_sha256
        ))
        .arg(format!("-Dbadgerbots.gitCommit={}", launch.git_commit))
        .arg("-jar")
        .arg(&launch.paper_path)
        .arg("--nogui")
        .current_dir(&launch.runtime_directory)
        .env_remove("JAVA_HOME")
        .env_remove("JAVA_TOOL_OPTIONS")
        .env_remove("JDK_JAVA_OPTIONS")
        .env_remove("_JAVA_OPTIONS")
        .env_remove("CLASSPATH")
        .env("BADGERBOTS_PAPER_BRIDGE_SECRET", encoded_secret)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|_| {
        failure(
            "Paper could not start with the private BadgerBots Java runtime. Select Verify & repair Java, then retry.",
            Vec::new(),
        )
    })?;
    let receiver = capture_output(&mut child);
    Ok(SpawnedServer {
        child,
        output: receiver,
        bridge_secret: secret.to_vec(),
    })
}

fn capture_output(child: &mut Child) -> mpsc::Receiver<String> {
    let (sender, receiver) = mpsc::channel();
    if let Some(stdout) = child.stdout.take() {
        spawn_reader(stdout, sender.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_reader(stderr, sender);
    }
    receiver
}

fn spawn_reader(stream: impl Read + Send + 'static, sender: mpsc::Sender<String>) {
    thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
}

fn inspect_line(line: &str, logs: &mut Vec<String>, signals: &mut ReadinessSignals) {
    signals.observe(line);
    logs.push(line.chars().take(500).collect());
    if logs.len() > MAX_LOG_LINES {
        logs.remove(0);
    }
}

fn drain_output(
    receiver: &mpsc::Receiver<String>,
    runtime_directory: &std::path::Path,
    logs: &mut Vec<String>,
    signals: &mut ReadinessSignals,
) {
    while let Ok(line) = receiver.try_recv() {
        inspect_line(&redact_line(&line, runtime_directory), logs, signals);
    }
}

fn request_clean_stop(child: &mut Child) -> bool {
    if let Some(mut stdin) = child.stdin.take()
        && (stdin.write_all(b"stop\n").is_err() || stdin.flush().is_err())
    {
        stop_or_kill(child);
        return false;
    }
    let started = Instant::now();
    while started.elapsed() < STOP_TIMEOUT {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) => thread::sleep(Duration::from_millis(250)),
            Err(_) => break,
        }
    }
    stop_or_kill(child);
    false
}

pub(crate) fn stop_or_kill(child: &mut Child) {
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"stop\n");
        let _ = stdin.flush();
    }
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(10) {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn ensure_port_available(port: u16) -> Result<(), ServerTestFailure> {
    TcpListener::bind((Ipv4Addr::LOCALHOST, port))
        .map(drop)
        .map_err(|_| {
            failure(
                &format!(
                    "Minecraft port {port} is already in use. Stop the other server or choose another port."
                ),
                Vec::new(),
            )
        })
}

pub(crate) fn loopback_connects(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        Duration::from_secs(3),
    )
    .is_ok()
}

pub(crate) fn redact_line(line: &str, runtime_directory: &std::path::Path) -> String {
    let redacted = line.replace(
        runtime_directory.to_string_lossy().as_ref(),
        "[managed-runtime]",
    );
    if ["password=", "token=", "secret=", "authorization:"]
        .iter()
        .any(|needle| redacted.to_ascii_lowercase().contains(needle))
    {
        "[redacted server log line]".to_string()
    } else {
        redacted.chars().take(500).collect()
    }
}

impl ReadinessSignals {
    pub(crate) fn observe(&mut self, line: &str) {
        self.paper |= line.contains("Done (") && line.contains("For help, type \"help\"");
        self.plugin |= line.contains("BadgerBots Sheep City runtime loaded");
        self.bridge |= line.contains("Authenticated BadgerBots Host bridge is ready");
    }

    pub(crate) fn complete(&self) -> bool {
        self.paper && self.plugin && self.bridge
    }
}

fn failure(message: &str, logs: Vec<String>) -> ServerTestFailure {
    ServerTestFailure {
        message: message.to_string(),
        logs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn recognizes_all_required_readiness_signals() {
        let mut signals = ReadinessSignals::default();
        let mut logs = Vec::new();
        for line in [
            "BadgerBots Sheep City runtime loaded; waiting for deployment.",
            "Authenticated BadgerBots Host bridge is ready.",
            "Done (9.346s)! For help, type \"help\"",
        ] {
            inspect_line(line, &mut logs, &mut signals);
        }
        assert!(signals.paper && signals.plugin && signals.bridge);
        assert_eq!(logs.len(), 3);
    }

    #[test]
    fn redacts_runtime_paths_and_secret_shaped_lines() {
        assert_eq!(
            redact_line("Loaded C:\\runtime\\paper.jar", Path::new("C:\\runtime")),
            "Loaded [managed-runtime]\\paper.jar"
        );
        assert_eq!(
            redact_line("token=do-not-log", Path::new("C:\\runtime")),
            "[redacted server log line]"
        );
    }
}
