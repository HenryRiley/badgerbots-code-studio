use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfiguration {
    pub schema_version: u8,
    pub teacher_username: String,
    pub server_port: u16,
    pub max_heap_gib: u8,
    pub java_version: String,
    pub eula_accepted: bool,
}

pub struct RuntimeStore {
    directory: PathBuf,
}

impl RuntimeStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn configure(
        &self,
        teacher_username: String,
        server_port: u16,
        max_heap_gib: u8,
        eula_accepted: bool,
    ) -> Result<RuntimeConfiguration, String> {
        validate_configuration(&teacher_username, server_port, max_heap_gib, eula_accepted)?;
        let java_version = detect_java_21()?;
        for child in ["plugins", "bridge/inbox", "bridge/outbox", "backups"] {
            fs::create_dir_all(self.directory.join(child)).map_err(|_| {
                "The managed Minecraft directory could not be prepared.".to_string()
            })?;
        }
        let configuration = RuntimeConfiguration {
            schema_version: 1,
            teacher_username,
            server_port,
            max_heap_gib,
            java_version,
            eula_accepted,
        };
        persist_text_atomic(&self.directory.join("eula.txt"), "eula=true\n")?;
        persist_text_atomic(
            &self.directory.join("server.properties"),
            &server_properties(&configuration),
        )?;
        let serialized = serde_json::to_string_pretty(&configuration)
            .map_err(|_| "Server configuration could not be serialized.".to_string())?;
        persist_text_atomic(&self.directory.join("badgerbots-runtime.json"), &serialized)?;
        Ok(configuration)
    }
}

fn validate_configuration(
    teacher_username: &str,
    server_port: u16,
    max_heap_gib: u8,
    eula_accepted: bool,
) -> Result<(), String> {
    if !(3..=16).contains(&teacher_username.len())
        || !teacher_username
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err(
            "Enter the teacher’s exact 3–16 character Minecraft Java username.".to_string(),
        );
    }
    if server_port < 1024 {
        return Err("Choose a Minecraft port between 1024 and 65535.".to_string());
    }
    if !(2..=8).contains(&max_heap_gib) {
        return Err("Choose a server memory limit between 2 and 8 GiB.".to_string());
    }
    if !eula_accepted {
        return Err("Read and accept the Minecraft EULA before preparing the server.".to_string());
    }
    Ok(())
}

fn detect_java_21() -> Result<String, String> {
    let mut command = Command::new("java");
    command.arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().map_err(|_| {
        "Java 21 was not found. Install a Java 21 runtime, then try Prepare server again."
            .to_string()
    })?;
    if !output.status.success() {
        return Err(
            "Java could not start successfully. Repair Java 21, then try again.".to_string(),
        );
    }
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let first_line = combined.lines().next().unwrap_or_default().trim();
    if !first_line.contains("\"21") && !first_line.contains(" 21.") {
        return Err(format!(
            "Java 21 is required, but the detected runtime reported: {}",
            first_line.chars().take(120).collect::<String>()
        ));
    }
    Ok(first_line.chars().take(120).collect())
}

fn server_properties(configuration: &RuntimeConfiguration) -> String {
    [
        "motd=BadgerBots Code Studio",
        "online-mode=true",
        "server-ip=",
        &format!("server-port={}", configuration.server_port),
        "max-players=25",
        "view-distance=6",
        "simulation-distance=4",
        "spawn-protection=0",
        "allow-flight=false",
        "enable-rcon=false",
        "enable-query=false",
        "white-list=false",
        "level-name=teacher_world",
        "difficulty=normal",
        "",
    ]
    .join("\n")
}

fn persist_text_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let temporary = path.with_extension("new");
    fs::write(&temporary, contents)
        .map_err(|_| "Managed server configuration could not be staged.".to_string())?;
    replace_file_atomic(&temporary, path)
        .map_err(|_| "Managed server configuration could not be saved atomically.".to_string())
}

#[cfg(windows)]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::{io, os::windows::ffi::OsStrExt};
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let succeeded = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if succeeded == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_safe_server_configuration() {
        assert!(validate_configuration("Teacher_01", 25565, 4, true).is_ok());
        assert!(validate_configuration("../teacher", 25565, 4, true).is_err());
        assert!(validate_configuration("Teacher_01", 80, 4, true).is_err());
        assert!(validate_configuration("Teacher_01", 25565, 16, true).is_err());
        assert!(validate_configuration("Teacher_01", 25565, 4, false).is_err());
    }

    #[test]
    fn writes_restricted_server_properties() {
        let configuration = RuntimeConfiguration {
            schema_version: 1,
            teacher_username: "Teacher_01".to_string(),
            server_port: 25565,
            max_heap_gib: 4,
            java_version: "openjdk version \"21\"".to_string(),
            eula_accepted: true,
        };
        let properties = server_properties(&configuration);
        assert!(properties.contains("online-mode=true"));
        assert!(properties.contains("enable-rcon=false"));
        assert!(properties.contains("server-port=25565"));
        assert!(!properties.contains("Teacher_01"));
    }
}
