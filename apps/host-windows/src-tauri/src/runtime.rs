use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

const PAPER_URL: &str = "https://fill-data.papermc.io/v1/objects/5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba/paper-1.21.11-132.jar";
pub const PAPER_SHA256: &str = "5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba";
const PAPER_VERSION: &str = "Paper 1.21.11 build 132";
const PLUGIN_VERSION: &str = "BadgerBots Paper plugin 0.4.0-prototype";
const MAX_PAPER_BYTES: u64 = 80 * 1024 * 1024;
const EMBEDDED_PLUGIN: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/badgerbots-paper-plugin.jar"));

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactPreparation {
    pub java_version: String,
    pub paper_version: String,
    pub paper_sha256: String,
    pub plugin_version: String,
    pub plugin_sha256: String,
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

    pub async fn prepare_artifacts(&self) -> Result<ArtifactPreparation, String> {
        if !self.directory.join("badgerbots-runtime.json").is_file() {
            return Err(
                "Complete server configuration before installing server files.".to_string(),
            );
        }
        let java_version = detect_java_21()?;
        validate_jar(EMBEDDED_PLUGIN, "BadgerBots plugin")?;

        let paper_path = self.directory.join("paper-1.21.11-132.jar");
        let paper_bytes = if checksum_file(&paper_path).as_deref() == Some(PAPER_SHA256) {
            None
        } else {
            let client = reqwest::Client::builder()
                .user_agent(
                    "BadgerBots-Code-Studio/0.4.0 (https://github.com/HenryRiley/badgerbots-code-studio)",
                )
                .connect_timeout(Duration::from_secs(20))
                .timeout(Duration::from_secs(180))
                .build()
                .map_err(|_| "The secure Paper downloader could not be prepared.".to_string())?;
            let response = client.get(PAPER_URL).send().await.map_err(|_| {
                "Paper could not be downloaded. Check the internet connection and try again."
                    .to_string()
            })?;
            if !response.status().is_success() {
                return Err(format!(
                    "Paper download failed with HTTP status {}. Try again later.",
                    response.status()
                ));
            }
            if response
                .content_length()
                .is_some_and(|length| length > MAX_PAPER_BYTES)
            {
                return Err("The Paper download exceeded the expected size limit.".to_string());
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|_| "The Paper download ended unexpectedly. Try again.".to_string())?;
            if bytes.len() as u64 > MAX_PAPER_BYTES {
                return Err("The Paper download exceeded the expected size limit.".to_string());
            }
            verify_checksum(&bytes, PAPER_SHA256, "Paper")?;
            validate_jar(&bytes, "Paper")?;
            Some(bytes)
        };

        if let Some(bytes) = paper_bytes {
            persist_bytes_atomic(&paper_path, &bytes)?;
        }
        let plugin_path = self
            .directory
            .join("plugins")
            .join("badgerbots-paper-plugin.jar");
        let plugin_sha256 = checksum_bytes(EMBEDDED_PLUGIN);
        if checksum_file(&plugin_path).as_deref() != Some(plugin_sha256.as_str()) {
            persist_bytes_atomic(&plugin_path, EMBEDDED_PLUGIN)?;
        }
        let manifest = ArtifactPreparation {
            java_version,
            paper_version: PAPER_VERSION.to_string(),
            paper_sha256: PAPER_SHA256.to_string(),
            plugin_version: PLUGIN_VERSION.to_string(),
            plugin_sha256,
        };
        let serialized = serde_json::to_string_pretty(&manifest)
            .map_err(|_| "The artifact manifest could not be serialized.".to_string())?;
        persist_text_atomic(
            &self.directory.join("badgerbots-artifacts.json"),
            &serialized,
        )?;
        self.create_configuration_backup(&manifest)?;
        Ok(manifest)
    }

    pub fn configuration(&self) -> Result<RuntimeConfiguration, String> {
        let contents = fs::read_to_string(self.directory.join("badgerbots-runtime.json"))
            .map_err(|_| "The managed server configuration could not be loaded.".to_string())?;
        serde_json::from_str(&contents).map_err(|_| {
            "The managed server configuration is invalid. Prepare it again.".to_string()
        })
    }

    fn create_configuration_backup(&self, artifacts: &ArtifactPreparation) -> Result<(), String> {
        let backup_directory = self.directory.join("backups").join("initial-configuration");
        fs::create_dir_all(&backup_directory)
            .map_err(|_| "The initial recovery directory could not be created.".to_string())?;
        for name in [
            "eula.txt",
            "server.properties",
            "badgerbots-runtime.json",
            "badgerbots-artifacts.json",
        ] {
            let source = self.directory.join(name);
            let bytes = fs::read(&source)
                .map_err(|_| "The initial recovery snapshot could not be read.".to_string())?;
            persist_bytes_atomic(&backup_directory.join(name), &bytes)?;
        }
        let evidence = serde_json::json!({
            "schemaVersion": 1,
            "kind": "configuration-only",
            "paperSha256": artifacts.paper_sha256,
            "pluginSha256": artifacts.plugin_sha256,
        });
        persist_text_atomic(
            &backup_directory.join("verification.json"),
            &serde_json::to_string_pretty(&evidence)
                .map_err(|_| "Recovery evidence could not be serialized.".to_string())?,
        )
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

pub fn detect_java_21() -> Result<String, String> {
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
    persist_bytes_atomic(path, contents.as_bytes())
}

fn persist_bytes_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("new");
    fs::write(&temporary, contents)
        .map_err(|_| "Managed server configuration could not be staged.".to_string())?;
    replace_file_atomic(&temporary, path)
        .map_err(|_| "Managed server configuration could not be saved atomically.".to_string())
}

fn checksum_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn checksum_file(path: &Path) -> Option<String> {
    fs::read(path).ok().map(|bytes| checksum_bytes(&bytes))
}

fn verify_checksum(bytes: &[u8], expected: &str, label: &str) -> Result<(), String> {
    if checksum_bytes(bytes) == expected {
        Ok(())
    } else {
        Err(format!(
            "{label} failed checksum verification. No server file was installed."
        ))
    }
}

fn validate_jar(bytes: &[u8], label: &str) -> Result<(), String> {
    if bytes.len() >= 4 && bytes.starts_with(b"PK\x03\x04") {
        Ok(())
    } else {
        Err(format!(
            "This Host installer does not contain a valid {label} JAR. Download a newly built installer."
        ))
    }
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

    #[test]
    fn verifies_artifact_checksums_and_jar_shape() {
        let jar = b"PK\x03\x04badgerbots-test";
        let checksum = checksum_bytes(jar);
        assert!(verify_checksum(jar, &checksum, "Test artifact").is_ok());
        assert!(verify_checksum(jar, &"0".repeat(64), "Test artifact").is_err());
        assert!(validate_jar(jar, "test plugin").is_ok());
        assert!(validate_jar(b"not a jar", "test plugin").is_err());
    }

    #[test]
    fn validates_the_embedded_plugin_in_packaged_builds() {
        if option_env!("BADGERBOTS_EMBEDDED_PLUGIN_PRESENT") == Some("true") {
            validate_jar(EMBEDDED_PLUGIN, "BadgerBots plugin")
                .expect("the packaged plugin must be a valid JAR");
        }
    }
}
