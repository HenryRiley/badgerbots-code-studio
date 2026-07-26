use crate::{
    handle_supervisor_event,
    power::set_active_camp_power,
    runtime::ServerLaunch,
    server_test::{
        ReadinessSignals, START_TIMEOUT, STOP_TIMEOUT, loopback_connects, redact_line,
        spawn_server, stop_or_kill,
    },
};
use std::{
    io::Write,
    sync::{Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

enum ServerControl {
    Stop,
    StopAndExit,
}

pub(crate) enum SupervisorEvent {
    Log(String),
    Ready,
    Exited {
        clean: bool,
        expected: bool,
        message: String,
    },
}

pub(crate) struct ServerManager {
    control: Mutex<Option<mpsc::Sender<ServerControl>>>,
}

impl ServerManager {
    pub(crate) fn new() -> Self {
        Self {
            control: Mutex::new(None),
        }
    }

    pub(crate) fn is_active(&self) -> bool {
        self.control
            .lock()
            .map(|control| control.is_some())
            .unwrap_or(true)
    }

    pub(crate) fn start(&self, launch: ServerLaunch, app: AppHandle) -> Result<(), String> {
        let mut control = self
            .control
            .lock()
            .map_err(|_| "Server controls are temporarily unavailable.".to_string())?;
        if control.is_some() {
            return Err("The managed Minecraft server is already active.".to_string());
        }
        let (child, output) = spawn_server(&launch).map_err(|failure| failure.message)?;
        let (sender, receiver) = mpsc::channel();
        *control = Some(sender);
        thread::spawn(move || supervise(app, launch, child, output, receiver));
        Ok(())
    }

    pub(crate) fn request_stop(&self, exit_after: bool) -> Result<(), String> {
        let control = self
            .control
            .lock()
            .map_err(|_| "Server controls are temporarily unavailable.".to_string())?;
        let sender = control
            .as_ref()
            .ok_or_else(|| "The managed Minecraft server is not running.".to_string())?;
        sender
            .send(if exit_after {
                ServerControl::StopAndExit
            } else {
                ServerControl::Stop
            })
            .map_err(|_| "The managed Minecraft server is already stopping.".to_string())
    }

    fn clear(&self) {
        if let Ok(mut control) = self.control.lock() {
            *control = None;
        }
    }
}

fn supervise(
    app: AppHandle,
    launch: ServerLaunch,
    mut child: std::process::Child,
    output: mpsc::Receiver<String>,
    control: mpsc::Receiver<ServerControl>,
) {
    let started = Instant::now();
    let mut signals = ReadinessSignals::default();
    let mut ready = false;
    let mut expected_stop = false;
    let mut exit_after = false;
    let mut stop_deadline = None;
    let mut failure_message = None;

    loop {
        while let Ok(line) = output.try_recv() {
            let line = redact_line(&line, &launch.runtime_directory);
            signals.observe(&line);
            handle_supervisor_event(&app, SupervisorEvent::Log(line));
        }

        if !ready
            && !expected_stop
            && failure_message.is_none()
            && signals.complete()
            && loopback_connects(launch.configuration.server_port)
        {
            ready = true;
            let power_active = set_active_camp_power(true);
            handle_supervisor_event(&app, SupervisorEvent::Ready);
            if !power_active {
                handle_supervisor_event(
                    &app,
                    SupervisorEvent::Log(
                        "[Host] Windows sleep prevention could not be activated.".to_string(),
                    ),
                );
            }
        }

        if !ready && failure_message.is_none() && started.elapsed() >= START_TIMEOUT {
            failure_message = Some(
                "Paper did not reach server, plugin, bridge, and port readiness within three minutes."
                    .to_string(),
            );
            request_stop(&mut child);
            stop_deadline = Some(Instant::now() + STOP_TIMEOUT);
        }

        match control.try_recv() {
            Ok(ServerControl::Stop) => {
                expected_stop = true;
                request_stop(&mut child);
                stop_deadline = Some(Instant::now() + STOP_TIMEOUT);
            }
            Ok(ServerControl::StopAndExit) => {
                expected_stop = true;
                exit_after = true;
                request_stop(&mut child);
                stop_deadline = Some(Instant::now() + STOP_TIMEOUT);
            }
            Err(mpsc::TryRecvError::Disconnected) => {
                expected_stop = true;
                request_stop(&mut child);
                stop_deadline.get_or_insert(Instant::now() + STOP_TIMEOUT);
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }

        if stop_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            failure_message =
                Some("Paper did not stop within one minute and was terminated.".to_string());
            stop_or_kill(&mut child);
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                while let Ok(line) = output.try_recv() {
                    handle_supervisor_event(
                        &app,
                        SupervisorEvent::Log(redact_line(&line, &launch.runtime_directory)),
                    );
                }
                let clean = status.success() && failure_message.is_none();
                let expected = expected_stop && failure_message.is_none();
                let message = failure_message.unwrap_or_else(|| {
                    if expected {
                        "Paper stopped cleanly.".to_string()
                    } else {
                        format!(
                            "Paper exited unexpectedly with status {}.",
                            status
                                .code()
                                .map_or_else(|| "unknown".to_string(), |code| code.to_string())
                        )
                    }
                });
                set_active_camp_power(false);
                app.state::<ServerManager>().clear();
                handle_supervisor_event(
                    &app,
                    SupervisorEvent::Exited {
                        clean,
                        expected,
                        message,
                    },
                );
                if exit_after {
                    app.exit(0);
                }
                return;
            }
            Ok(None) => {}
            Err(_) => {
                stop_or_kill(&mut child);
                set_active_camp_power(false);
                app.state::<ServerManager>().clear();
                handle_supervisor_event(
                    &app,
                    SupervisorEvent::Exited {
                        clean: false,
                        expected: false,
                        message: "Paper process status could not be inspected.".to_string(),
                    },
                );
                if exit_after {
                    app.exit(1);
                }
                return;
            }
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn request_stop(child: &mut std::process::Child) {
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"stop\n");
        let _ = stdin.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_without_an_active_control_channel() {
        let manager = ServerManager::new();
        assert!(!manager.is_active());
        assert!(manager.request_stop(false).is_err());
    }
}
