use crate::{
    managed_java::{self, InstallProgress},
    world_backup::{self, WorldBackupReport},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

const PAPER_URL: &str = "https://fill-data.papermc.io/v1/objects/5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba/paper-1.21.11-132.jar";
pub const PAPER_SHA256: &str = "5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba";
const PAPER_VERSION: &str = "Paper 1.21.11 build 132";
const PLUGIN_VERSION: &str = "BadgerBots Paper plugin 0.6.1-prototype";
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactPreparation {
    pub java_version: String,
    pub java_sha256: String,
    #[serde(default = "default_java_source")]
    pub java_source: String,
    pub java_repaired: bool,
    pub paper_version: String,
    pub paper_sha256: String,
    pub plugin_version: String,
    pub plugin_sha256: String,
}

fn default_java_source() -> String {
    "private-pinned".to_string()
}

#[derive(Debug, Clone)]
pub struct ServerLaunch {
    pub runtime_directory: PathBuf,
    pub java_path: PathBuf,
    pub paper_path: PathBuf,
    pub bridge_directory: PathBuf,
    pub configuration: RuntimeConfiguration,
}

#[derive(Clone)]
pub struct RuntimeStore {
    directory: PathBuf,
    world_operations: Arc<Mutex<()>>,
}

impl RuntimeStore {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            world_operations: Arc::new(Mutex::new(())),
        }
    }

    pub fn configure(
        &self,
        teacher_username: String,
        server_port: u16,
        max_heap_gib: u8,
        eula_accepted: bool,
    ) -> Result<RuntimeConfiguration, String> {
        validate_configuration(&teacher_username, server_port, max_heap_gib, eula_accepted)?;
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
            java_version: "Java 21 (detection pending)".to_string(),
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

    pub async fn prepare_artifacts_with_progress(
        &self,
        progress: &(dyn Fn(InstallProgress) + Send + Sync),
    ) -> Result<ArtifactPreparation, String> {
        if !self.directory.join("badgerbots-runtime.json").is_file() {
            return Err(
                "Complete server configuration before installing server files.".to_string(),
            );
        }
        let java = managed_java::ensure(&self.directory, progress).await?;
        validate_jar(EMBEDDED_PLUGIN, "BadgerBots plugin")?;

        let paper_path = self.directory.join("paper-1.21.11-132.jar");
        let paper_bytes = if checksum_file(&paper_path).as_deref() == Some(PAPER_SHA256) {
            None
        } else {
            let client = reqwest::Client::builder()
                .user_agent(
                    "BadgerBots-Code-Studio/0.9.0 (https://github.com/HenryRiley/badgerbots-code-studio)",
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
            java_version: java.version,
            java_sha256: java.fingerprint,
            java_source: java.source.as_str().to_string(),
            java_repaired: java.repaired,
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
        progress(InstallProgress {
            phase: "complete".to_string(),
            message: if manifest.java_source == "existing-system" {
                "Existing Java 21, Paper, and the BadgerBots plugin are verified; no duplicate Java runtime was installed."
                    .to_string()
            } else if manifest.java_repaired {
                "Private Java 21 was repaired; Java, Paper, and the BadgerBots plugin are verified."
                    .to_string()
            } else {
                "Private Java 21, Paper, and the BadgerBots plugin are verified.".to_string()
            },
            downloaded_bytes: 0,
            total_bytes: None,
            percent: Some(100),
            repair: manifest.java_repaired,
        });
        Ok(manifest)
    }

    pub fn configuration(&self) -> Result<RuntimeConfiguration, String> {
        let contents = fs::read_to_string(self.directory.join("badgerbots-runtime.json"))
            .map_err(|_| "The managed server configuration could not be loaded.".to_string())?;
        let configuration: RuntimeConfiguration =
            serde_json::from_str(&contents).map_err(|_| {
                "The managed server configuration is invalid. Prepare it again.".to_string()
            })?;
        validate_configuration(
            &configuration.teacher_username,
            configuration.server_port,
            configuration.max_heap_gib,
            configuration.eula_accepted,
        )?;
        Ok(configuration)
    }

    pub fn verified_server_launch(&self) -> Result<ServerLaunch, String> {
        let configuration = self.configuration()?;
        persist_text_atomic(&self.directory.join("eula.txt"), "eula=true\n")?;
        persist_text_atomic(
            &self.directory.join("server.properties"),
            &server_properties(&configuration),
        )?;
        let artifact_contents =
            fs::read_to_string(self.directory.join("badgerbots-artifacts.json")).map_err(|_| {
                "Install and verify the server files before testing Paper.".to_string()
            })?;
        let artifacts: ArtifactPreparation =
            serde_json::from_str(&artifact_contents).map_err(|_| {
                "The installed server artifact record is invalid. Reinstall the server files."
                    .to_string()
            })?;
        let paper_path = self.directory.join("paper-1.21.11-132.jar");
        if checksum_file(&paper_path).as_deref() != Some(PAPER_SHA256) {
            return Err(
                "Paper no longer matches its approved checksum. Reinstall the server files."
                    .to_string(),
            );
        }
        let plugin_path = self
            .directory
            .join("plugins")
            .join("badgerbots-paper-plugin.jar");
        if checksum_file(&plugin_path).as_deref() != Some(artifacts.plugin_sha256.as_str()) {
            return Err(
                "The BadgerBots plugin no longer matches its installed checksum. Reinstall the server files."
                    .to_string(),
            );
        }
        let java = managed_java::verify(&self.directory, &artifacts.java_source).map_err(|_| {
            "The selected Java 21 runtime is missing, damaged, or changed. Select Verify & repair Java."
                .to_string()
        })?;
        if java.fingerprint != artifacts.java_sha256 {
            return Err(
                "The selected Java 21 runtime does not match the approved artifact record. Select Verify & repair Java."
                    .to_string(),
            );
        }
        self.verify_configuration_backup()?;
        Ok(ServerLaunch {
            runtime_directory: self.directory.clone(),
            java_path: java.executable_path,
            paper_path,
            bridge_directory: self.directory.join("bridge"),
            configuration,
        })
    }

    pub fn create_world_backup(&self, reason: &str) -> Result<WorldBackupReport, String> {
        let _operation = self
            .world_operations
            .lock()
            .map_err(|_| "World backup controls are temporarily unavailable.".to_string())?;
        world_backup::create(&self.directory, reason)
    }

    pub fn verify_latest_world_backup(&self) -> Result<WorldBackupReport, String> {
        let _operation = self
            .world_operations
            .lock()
            .map_err(|_| "World backup controls are temporarily unavailable.".to_string())?;
        world_backup::verify_latest(&self.directory)
    }

    pub fn world_backups(&self) -> Result<Vec<WorldBackupReport>, String> {
        let _operation = self
            .world_operations
            .lock()
            .map_err(|_| "World backup controls are temporarily unavailable.".to_string())?;
        world_backup::inventory(&self.directory)
    }

    pub fn restore_world_backup(&self, backup_id: &str) -> Result<WorldBackupReport, String> {
        let _operation = self
            .world_operations
            .lock()
            .map_err(|_| "World backup controls are temporarily unavailable.".to_string())?;
        world_backup::restore(&self.directory, backup_id)
    }

    pub fn restore_latest_world_backup(&self) -> Result<WorldBackupReport, String> {
        let _operation = self
            .world_operations
            .lock()
            .map_err(|_| "World backup controls are temporarily unavailable.".to_string())?;
        let latest = world_backup::inventory(&self.directory)?
            .into_iter()
            .next()
            .ok_or_else(|| "No verified world backup exists yet.".to_string())?;
        world_backup::restore(&self.directory, &latest.backup_id)
    }

    pub fn backup_and_reset_sheep_city(&self) -> Result<WorldBackupReport, String> {
        let _operation = self
            .world_operations
            .lock()
            .map_err(|_| "World backup controls are temporarily unavailable.".to_string())?;
        let report = world_backup::create(&self.directory, "before-sheep-city-reset")?;
        world_backup::reset_sheep_city(&self.directory).map(|()| report)
    }

    fn verify_configuration_backup(&self) -> Result<(), String> {
        let backup_directory = self.directory.join("backups").join("initial-configuration");
        let evidence_contents = fs::read_to_string(backup_directory.join("verification.json"))
            .map_err(|_| {
                "The initial configuration recovery evidence is missing. Reinstall the server files before testing Paper."
                    .to_string()
            })?;
        let evidence: serde_json::Value = serde_json::from_str(&evidence_contents).map_err(|_| {
            "The initial configuration recovery evidence is invalid. Reinstall the server files before testing Paper."
                .to_string()
        })?;
        let files = evidence
            .get("files")
            .and_then(serde_json::Value::as_object)
            .ok_or_else(|| {
                "The initial configuration recovery evidence is incomplete. Reinstall the server files before testing Paper."
                    .to_string()
            })?;
        for name in [
            "eula.txt",
            "server.properties",
            "badgerbots-runtime.json",
            "badgerbots-artifacts.json",
        ] {
            let expected = files.get(name).and_then(serde_json::Value::as_str);
            if expected.is_none()
                || checksum_file(&backup_directory.join(name)).as_deref() != expected
            {
                return Err(
                    "The initial configuration recovery copy could not be verified. Reinstall the server files before testing Paper."
                        .to_string(),
                );
            }
        }
        Ok(())
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
            "schemaVersion": 2,
            "kind": "configuration-only",
            "paperSha256": artifacts.paper_sha256,
            "pluginSha256": artifacts.plugin_sha256,
            "files": {
                "eula.txt": checksum_file(&backup_directory.join("eula.txt")),
                "server.properties": checksum_file(&backup_directory.join("server.properties")),
                "badgerbots-runtime.json": checksum_file(&backup_directory.join("badgerbots-runtime.json")),
                "badgerbots-artifacts.json": checksum_file(&backup_directory.join("badgerbots-artifacts.json")),
            },
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

    #[test]
    fn rejects_a_changed_configuration_recovery_copy() {
        let directory = std::env::temp_dir().join(format!(
            "badgerbots-runtime-backup-test-{}",
            std::process::id()
        ));
        let backup = directory.join("backups").join("initial-configuration");
        fs::create_dir_all(&backup).expect("test backup directory should be created");
        for name in [
            "eula.txt",
            "server.properties",
            "badgerbots-runtime.json",
            "badgerbots-artifacts.json",
        ] {
            fs::write(directory.join(name), b"verified")
                .expect("current test file should be written");
            fs::write(backup.join(name), b"verified").expect("backup test file should be written");
        }
        let evidence = serde_json::json!({
            "files": {
                "eula.txt": checksum_file(&backup.join("eula.txt")),
                "server.properties": checksum_file(&backup.join("server.properties")),
                "badgerbots-runtime.json": checksum_file(&backup.join("badgerbots-runtime.json")),
                "badgerbots-artifacts.json": checksum_file(&backup.join("badgerbots-artifacts.json")),
            }
        });
        fs::write(
            backup.join("verification.json"),
            serde_json::to_vec(&evidence).expect("test evidence should serialize"),
        )
        .expect("backup evidence should be written");
        let store = RuntimeStore::new(directory.clone());
        assert!(store.verify_configuration_backup().is_ok());
        fs::write(backup.join("server.properties"), b"changed")
            .expect("backup mismatch should be written");
        assert!(store.verify_configuration_backup().is_err());
        fs::remove_dir_all(directory).expect("test directory should be removed");
    }
}
