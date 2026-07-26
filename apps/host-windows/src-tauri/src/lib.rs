use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

mod onboarding;
mod runtime;

use onboarding::{OnboardingStore, OnboardingView, SignInResult};
use runtime::RuntimeStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetupStep {
    id: String,
    label: String,
    status: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadinessCheck {
    id: String,
    label: String,
    status: String,
    measured: String,
    requirement: String,
    recovery: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedArtifact {
    id: String,
    label: String,
    status: String,
    version: String,
    checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticEvent {
    id: String,
    timestamp: String,
    level: String,
    code: String,
    message: String,
    correlation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerState {
    lifecycle: String,
    active_camp: bool,
    sleep_inhibition: String,
    last_exit: String,
    recovery_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupState {
    status: String,
    last_verified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateState {
    status: String,
    channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostSnapshot {
    schema_version: u8,
    mode: String,
    installation_id: String,
    location_name: String,
    setup_steps: Vec<SetupStep>,
    readiness: Vec<ReadinessCheck>,
    artifacts: Vec<ManagedArtifact>,
    server: ServerState,
    backup: BackupState,
    update: UpdateState,
    pending_outbound_messages: u32,
    diagnostics: Vec<DiagnosticEvent>,
}

struct HostStore {
    path: PathBuf,
    snapshot: Mutex<HostSnapshot>,
}

impl HostStore {
    fn load(path: PathBuf) -> Self {
        let snapshot = fs::read_to_string(&path)
            .ok()
            .and_then(|contents| serde_json::from_str(&contents).ok())
            .filter(|snapshot: &HostSnapshot| snapshot.schema_version == 1)
            .unwrap_or_else(initial_snapshot);
        Self {
            path,
            snapshot: Mutex::new(snapshot),
        }
    }

    fn persist(&self, snapshot: &HostSnapshot) -> Result<(), String> {
        persist_atomic(&self.path, snapshot)
    }
}

#[tauri::command]
fn host_snapshot(store: tauri::State<'_, HostStore>) -> Result<HostSnapshot, String> {
    store
        .snapshot
        .lock()
        .map(|snapshot| snapshot.clone())
        .map_err(|_| "Host state is temporarily unavailable.".to_string())
}

#[tauri::command]
fn complete_setup_step(
    step_id: String,
    detail: String,
    store: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    let mut snapshot = store
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    let expected = snapshot
        .setup_steps
        .iter()
        .position(|step| step.status != "complete")
        .ok_or_else(|| "First-run setup is already complete.".to_string())?;
    if snapshot.setup_steps[expected].id != step_id {
        return Err(format!(
            "Complete {} first.",
            snapshot.setup_steps[expected].label
        ));
    }
    snapshot.setup_steps[expected].status = "complete".to_string();
    snapshot.setup_steps[expected].detail = sanitize(&detail);
    push_diagnostic(
        &mut snapshot,
        "SETUP_STEP_COMPLETED",
        "Setup step completed without storing credentials.",
        "info",
    );
    store.persist(&snapshot)?;
    Ok(snapshot.clone())
}

#[tauri::command]
fn host_onboarding_status(
    onboarding: tauri::State<'_, OnboardingStore>,
) -> Result<OnboardingView, String> {
    onboarding.view()
}

#[tauri::command]
fn configure_classroom_service(
    service_url: String,
    publishable_key: String,
    onboarding: tauri::State<'_, OnboardingStore>,
) -> Result<OnboardingView, String> {
    onboarding.configure(service_url, publishable_key)
}

#[tauri::command]
async fn sign_in_instructor(
    email: String,
    password: String,
    onboarding: tauri::State<'_, OnboardingStore>,
    host: tauri::State<'_, HostStore>,
) -> Result<SignInResult, String> {
    let result = onboarding.sign_in(email, password).await?;
    mark_setup_step(
        &host,
        "instructor_sign_in",
        "Instructor identity verified by the classroom service.",
    )?;
    Ok(result)
}

#[tauri::command]
async fn pair_classroom_host(
    organization_id: String,
    location_id: String,
    display_name: String,
    onboarding: tauri::State<'_, OnboardingStore>,
    host: tauri::State<'_, HostStore>,
) -> Result<OnboardingView, String> {
    let view = onboarding
        .pair(organization_id, location_id, display_name)
        .await?;
    let detail = view
        .location_name
        .as_deref()
        .unwrap_or("Configured location");
    mark_setup_step(&host, "location", detail)?;
    Ok(view)
}

#[tauri::command]
fn sign_out_instructor(
    onboarding: tauri::State<'_, OnboardingStore>,
) -> Result<OnboardingView, String> {
    onboarding.sign_out()
}

#[tauri::command]
fn probe_host_hardware(store: tauri::State<'_, HostStore>) -> Result<HostSnapshot, String> {
    let mut snapshot = store
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    let supported_platform = cfg!(all(windows, target_arch = "x86_64"));
    upsert_readiness(
        &mut snapshot,
        ReadinessCheck {
            id: "platform".to_string(),
            label: "Supported Windows platform".to_string(),
            status: if supported_platform {
                "ready"
            } else {
                "blocked"
            }
            .to_string(),
            measured: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            requirement: "Windows 10/11 x64".to_string(),
            recovery: (!supported_platform).then(|| {
                "Install BadgerBots Host on a supported Windows 10/11 x64 laptop.".to_string()
            }),
        },
    );
    let memory_gib = total_memory_bytes().map(|bytes| bytes as f64 / 1_073_741_824.0);
    let memory_status = match memory_gib {
        Some(value) if value >= 16.0 => "ready",
        Some(value) if value >= 12.0 => "warning",
        _ => "blocked",
    };
    upsert_readiness(
        &mut snapshot,
        ReadinessCheck {
            id: "memory".to_string(),
            label: "System memory".to_string(),
            status: memory_status.to_string(),
            measured: memory_gib
                .map(|value| format!("{value:.1} GiB installed"))
                .unwrap_or_else(|| "Could not measure installed memory".to_string()),
            requirement: "16 GiB recommended for a 25-student camp".to_string(),
            recovery: (memory_status == "blocked").then(|| {
                "Use a teacher laptop with at least 12 GiB RAM; 16 GiB remains the target."
                    .to_string()
            }),
        },
    );
    if supported_platform
        && memory_status != "blocked"
        && let Some(step) = snapshot
            .setup_steps
            .iter_mut()
            .find(|step| step.id == "hardware_readiness")
    {
        step.status = "complete".to_string();
        step.detail = "Native platform and memory probes completed.".to_string();
    }
    push_diagnostic(
        &mut snapshot,
        "HOST_HARDWARE_PROBED",
        "Native platform and memory readiness checks completed.",
        if supported_platform && memory_status != "blocked" {
            "info"
        } else {
            "warning"
        },
    );
    store.persist(&snapshot)?;
    Ok(snapshot.clone())
}

#[tauri::command]
fn configure_minecraft_server(
    teacher_username: String,
    server_port: u16,
    max_heap_gib: u8,
    eula_accepted: bool,
    runtime: tauri::State<'_, RuntimeStore>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    {
        let snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        let next_step = snapshot
            .setup_steps
            .iter()
            .find(|step| step.status != "complete")
            .map(|step| step.id.as_str());
        if next_step != Some("server_configuration") {
            return Err("Complete pairing and the laptop readiness check first.".to_string());
        }
    }
    let configuration = runtime.configure(
        teacher_username.clone(),
        server_port,
        max_heap_gib,
        eula_accepted,
    )?;
    mark_setup_step(
        &host,
        "server_configuration",
        &format!(
            "Private Paper configuration saved on port {} with a {} GiB limit; {} detected.",
            configuration.server_port, configuration.max_heap_gib, configuration.java_version
        ),
    )?;
    mark_setup_step(
        &host,
        "teacher_minecraft_mapping",
        &format!("Teacher Minecraft username: {teacher_username}"),
    )?;
    host_snapshot(host)
}

fn upsert_readiness(snapshot: &mut HostSnapshot, check: ReadinessCheck) {
    if let Some(existing) = snapshot
        .readiness
        .iter_mut()
        .find(|existing| existing.id == check.id)
    {
        *existing = check;
    } else {
        snapshot.readiness.push(check);
    }
}

#[cfg(windows)]
fn total_memory_bytes() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    (unsafe { GlobalMemoryStatusEx(&mut status) } != 0).then_some(status.ullTotalPhys)
}

#[cfg(not(windows))]
fn total_memory_bytes() -> Option<u64> {
    None
}

fn mark_setup_step(store: &HostStore, step_id: &str, detail: &str) -> Result<(), String> {
    let mut snapshot = store
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    if let Some(step) = snapshot
        .setup_steps
        .iter_mut()
        .find(|step| step.id == step_id)
    {
        step.status = "complete".to_string();
        step.detail = sanitize(detail);
    }
    push_diagnostic(
        &mut snapshot,
        "HOST_ONBOARDING_PROGRESS",
        "A protected Host onboarding step completed.",
        "info",
    );
    store.persist(&snapshot)
}

#[tauri::command]
fn transition_server(
    action: String,
    store: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    let mut snapshot = store
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    let message = format!(
        "The {action} request is locked until checksummed Java, Paper, plugin, backup, and readiness evidence exist."
    );
    push_diagnostic(&mut snapshot, "SERVER_CONTROL_LOCKED", &message, "warning");
    store.persist(&snapshot)?;
    Ok(snapshot.clone())
}

fn initial_snapshot() -> HostSnapshot {
    let steps = [
        ("instructor_sign_in", "Instructor sign-in"),
        ("location", "Camp location"),
        ("hardware_readiness", "Hardware readiness"),
        ("server_configuration", "Server configuration"),
        ("teacher_minecraft_mapping", "Teacher Minecraft mapping"),
        ("firewall_approval", "Scoped firewall approval"),
        ("test_server", "Test server"),
    ];
    HostSnapshot {
        schema_version: 1,
        mode: "native".to_string(),
        installation_id: "local-native-prototype".to_string(),
        location_name: "Not configured".to_string(),
        setup_steps: steps
            .into_iter()
            .map(|(id, label)| SetupStep {
                id: id.to_string(),
                label: label.to_string(),
                status: "pending".to_string(),
                detail: "Waiting".to_string(),
            })
            .collect(),
        readiness: vec![
            ReadinessCheck {
                id: "platform".to_string(),
                label: "Supported Windows platform".to_string(),
                status: if cfg!(windows) { "pending" } else { "blocked" }.to_string(),
                measured: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
                requirement: "Windows 10/11 x64".to_string(),
                recovery: Some("Run this build on the teacher Windows PC.".to_string()),
            },
            ReadinessCheck {
                id: "memory".to_string(),
                label: "System memory".to_string(),
                status: "pending".to_string(),
                measured: "Not measured".to_string(),
                requirement: "16 GiB recommended for a 25-student camp".to_string(),
                recovery: None,
            },
            ReadinessCheck {
                id: "network".to_string(),
                label: "Local network".to_string(),
                status: "pending".to_string(),
                measured: "Test server has not run".to_string(),
                requirement: "Private Wi-Fi and scoped Minecraft port".to_string(),
                recovery: None,
            },
        ],
        artifacts: [
            ("java", "Managed Java 21"),
            ("paper", "Paper 1.21.11"),
            ("plugin", "BadgerBots Paper plugin"),
        ]
        .into_iter()
        .map(|(id, label)| ManagedArtifact {
            id: id.to_string(),
            label: label.to_string(),
            status: "missing".to_string(),
            version: "pending".to_string(),
            checksum: "pending".to_string(),
        })
        .collect(),
        server: ServerState {
            lifecycle: "stopped".to_string(),
            active_camp: false,
            sleep_inhibition: "inactive".to_string(),
            last_exit: "unknown".to_string(),
            recovery_required: false,
        },
        backup: BackupState {
            status: "never".to_string(),
            last_verified_at: None,
        },
        update: UpdateState {
            status: "not_checked".to_string(),
            channel: "internal".to_string(),
        },
        pending_outbound_messages: 0,
        diagnostics: vec![DiagnosticEvent {
            id: "event-native-ready".to_string(),
            timestamp: "not-recorded".to_string(),
            level: "info".to_string(),
            code: "HOST_NATIVE_READY".to_string(),
            message: "Native Host state loaded; infrastructure controls remain locked.".to_string(),
            correlation_id: "host-native-ready".to_string(),
        }],
    }
}

fn persist_atomic(path: &Path, snapshot: &HostSnapshot) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Host state path is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Host state directory could not be created.".to_string())?;
    let temporary = path.with_extension("json.new");
    let bytes = serde_json::to_vec_pretty(snapshot)
        .map_err(|_| "Host state could not be serialized.".to_string())?;
    fs::write(&temporary, bytes).map_err(|_| "Host state could not be staged.".to_string())?;
    fs::rename(&temporary, path)
        .map_err(|_| "Host state could not be replaced atomically.".to_string())
}

fn push_diagnostic(snapshot: &mut HostSnapshot, code: &str, message: &str, level: &str) {
    snapshot.diagnostics.push(DiagnosticEvent {
        id: format!("event-{}", snapshot.diagnostics.len() + 1),
        timestamp: "recorded-locally".to_string(),
        level: level.to_string(),
        code: code.to_string(),
        message: sanitize(message),
        correlation_id: format!("host-local-{}", snapshot.diagnostics.len() + 1),
    });
    if snapshot.diagnostics.len() > 100 {
        snapshot.diagnostics.remove(0);
    }
}

fn sanitize(value: &str) -> String {
    let lowered = value.to_ascii_lowercase();
    if ["password=", "token=", "secret=", "authorization:"]
        .iter()
        .any(|needle| lowered.contains(needle))
    {
        return "[redacted-secret]".to_string();
    }
    value.chars().take(500).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_directory = app.path().app_local_data_dir()?;
            let state_path = data_directory.join("host-state.json");
            app.manage(HostStore::load(state_path));
            app.manage(OnboardingStore::load(&data_directory).map_err(std::io::Error::other)?);
            app.manage(RuntimeStore::new(data_directory.join("minecraft-runtime")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            host_snapshot,
            complete_setup_step,
            host_onboarding_status,
            configure_classroom_service,
            sign_in_instructor,
            pair_classroom_host,
            sign_out_instructor,
            probe_host_hardware,
            configure_minecraft_server,
            transition_server
        ])
        .run(tauri::generate_context!())
        .expect("BadgerBots Host failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_snapshot_starts_locked() {
        let snapshot = initial_snapshot();
        assert!(
            snapshot
                .setup_steps
                .iter()
                .all(|step| step.status == "pending")
        );
        assert!(
            snapshot
                .artifacts
                .iter()
                .all(|artifact| artifact.status == "missing")
        );
        assert_eq!(snapshot.server.lifecycle, "stopped");
    }

    #[test]
    fn sensitive_native_diagnostic_is_redacted() {
        assert_eq!(sanitize("token=do-not-log-this"), "[redacted-secret]");
    }
}
