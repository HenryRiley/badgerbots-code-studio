use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    id: String,
    persisted: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mapping {
    minecraft_username: Option<String>,
    authorized_by_instructor: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherCandidate {
    kind: String,
    label: String,
    root: String,
    detected: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticEvent {
    id: String,
    level: String,
    code: String,
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectSnapshot {
    schema_version: u8,
    mode: String,
    device: Device,
    mapping: Mapping,
    launchers: Vec<LauncherCandidate>,
    selected_launcher_root: Option<String>,
    profile: String,
    client_mod: String,
    server_entry: String,
    artifact_manifest_verified: bool,
    diagnostics: Vec<DiagnosticEvent>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedIdentity {
    schema_version: u8,
    device_id: String,
    minecraft_username: Option<String>,
}

#[tauri::command]
fn connect_snapshot(app: tauri::AppHandle) -> Result<ConnectSnapshot, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Connect data directory is unavailable: {error}"))?;
    let identity = load_or_create_identity(&data_dir.join("device-identity.json"))?;
    let launchers = detect_launchers();
    let selected = launchers
        .iter()
        .find(|candidate| candidate.detected)
        .map(|candidate| candidate.root.clone());

    Ok(ConnectSnapshot {
        schema_version: 1,
        mode: "native".into(),
        device: Device {
            id: identity.device_id,
            persisted: true,
        },
        mapping: Mapping {
            minecraft_username: identity.minecraft_username.clone(),
            authorized_by_instructor: identity.minecraft_username.is_some(),
        },
        launchers,
        selected_launcher_root: selected,
        profile: "blocked".into(),
        client_mod: "blocked".into(),
        server_entry: "blocked".into(),
        artifact_manifest_verified: false,
        diagnostics: vec![DiagnosticEvent {
            id: "native-state-loaded".into(),
            level: "info".into(),
            code: "DEVICE_IDENTITY_READY".into(),
            message: "Stable device identity loaded. Managed profile writes remain locked.".into(),
        }],
    })
}

fn load_or_create_identity(path: &Path) -> Result<PersistedIdentity, String> {
    if path.exists() {
        let content = fs::read_to_string(path)
            .map_err(|error| format!("Device identity read failed: {error}"))?;
        let identity: PersistedIdentity = serde_json::from_str(&content)
            .map_err(|error| format!("Device identity is invalid: {error}"))?;
        if identity.schema_version != 1 || identity.device_id.is_empty() {
            return Err("Device identity uses an unsupported schema.".into());
        }
        return Ok(identity);
    }

    let identity = PersistedIdentity {
        schema_version: 1,
        device_id: Uuid::new_v4().to_string(),
        minecraft_username: None,
    };
    persist_identity(path, &identity)?;
    Ok(identity)
}

fn persist_identity(path: &Path, identity: &PersistedIdentity) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Device identity path has no parent.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Device identity directory could not be created: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let encoded = serde_json::to_vec_pretty(identity)
        .map_err(|error| format!("Device identity encoding failed: {error}"))?;
    fs::write(&temporary, encoded)
        .map_err(|error| format!("Device identity temporary write failed: {error}"))?;
    replace_file(&temporary, path)?;
    Ok(())
}

fn replace_file(temporary: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        fs::remove_file(destination)
            .map_err(|error| format!("Old device identity could not be replaced: {error}"))?;
    }
    fs::rename(temporary, destination)
        .map_err(|error| format!("Device identity replacement failed: {error}"))
}

fn detect_launchers() -> Vec<LauncherCandidate> {
    let mut candidates = Vec::new();
    if let Some(app_data) = std::env::var_os("APPDATA") {
        candidates.push(candidate(
            "prism",
            "Prism Launcher",
            PathBuf::from(&app_data).join("PrismLauncher"),
        ));
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.push(candidate(
            "prism",
            "Prism Launcher",
            home.join("Library/Application Support/PrismLauncher"),
        ));
        candidates.push(candidate(
            "prism",
            "Prism Launcher",
            home.join(".local/share/PrismLauncher"),
        ));
    }
    candidates
}

fn candidate(kind: &str, label: &str, root: PathBuf) -> LauncherCandidate {
    LauncherCandidate {
        kind: kind.into(),
        label: label.into(),
        detected: root.join("instances").is_dir(),
        root: root.to_string_lossy().into_owned(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![connect_snapshot])
        .run(tauri::generate_context!())
        .expect("BadgerBots Connect failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory() -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("badgerbots-connect-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("temporary directory");
        directory
    }

    #[test]
    fn identity_is_stable_across_reloads() {
        let directory = test_directory();
        let path = directory.join("identity.json");
        let first = load_or_create_identity(&path).expect("first identity");
        let second = load_or_create_identity(&path).expect("second identity");
        assert_eq!(first.device_id, second.device_id);
        assert!(path.exists());
        fs::remove_dir_all(directory).expect("temporary directory cleanup");
    }

    #[test]
    fn invalid_identity_fails_closed() {
        let directory = test_directory();
        let path = directory.join("identity.json");
        fs::write(&path, "{\"schemaVersion\":99,\"deviceId\":\"bad\"}").expect("invalid fixture");
        assert!(load_or_create_identity(&path).is_err());
        fs::remove_dir_all(directory).expect("temporary directory cleanup");
    }

    #[test]
    fn launcher_detection_requires_an_instances_directory() {
        let directory = test_directory();
        let missing = candidate("prism", "Prism Launcher", directory.clone());
        assert!(!missing.detected);
        fs::create_dir(directory.join("instances")).expect("instances directory");
        let detected = candidate("prism", "Prism Launcher", directory.clone());
        assert!(detected.detected);
        fs::remove_dir_all(directory).expect("temporary directory cleanup");
    }
}
