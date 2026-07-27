use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

mod firewall;
mod onboarding;
mod power;
mod runtime;
mod server_manager;
mod server_test;
mod world_backup;

use firewall::approve_private_minecraft_port;
use onboarding::{OnboardingStore, OnboardingView, SignInResult};
use runtime::RuntimeStore;
use server_manager::{ServerManager, SupervisorEvent};
use server_test::run as run_server_test;

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
    #[serde(default)]
    latest_id: Option<String>,
    #[serde(default)]
    backup_count: usize,
    #[serde(default)]
    total_bytes: u64,
    #[serde(default)]
    last_action: Option<String>,
    #[serde(default)]
    operation: Option<String>,
    #[serde(default)]
    snapshots: Vec<world_backup::WorldBackupReport>,
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
    #[serde(default)]
    server_logs: Vec<String>,
}

struct HostStore {
    path: PathBuf,
    snapshot: Mutex<HostSnapshot>,
}

impl HostStore {
    fn load(
        path: PathBuf,
        discovered_backups: Option<Vec<world_backup::WorldBackupReport>>,
    ) -> Self {
        let mut snapshot = fs::read_to_string(&path)
            .ok()
            .and_then(|contents| serde_json::from_str(&contents).ok())
            .filter(|snapshot: &HostSnapshot| snapshot.schema_version == 1)
            .unwrap_or_else(initial_snapshot);
        if matches!(
            snapshot.server.lifecycle.as_str(),
            "starting" | "running" | "stopping" | "maintenance"
        ) {
            snapshot.server.lifecycle = "failed".to_string();
            snapshot.server.active_camp = false;
            snapshot.server.sleep_inhibition = "inactive".to_string();
            snapshot.server.last_exit = "unclean".to_string();
            snapshot.server.recovery_required = true;
            push_diagnostic(
                &mut snapshot,
                "SERVER_RECOVERY_REQUIRED",
                "Host reopened after an incomplete server lifecycle. Review recovery before restarting.",
                "warning",
            );
        }
        if let Some(backups) = discovered_backups {
            snapshot.backup.snapshots = backups;
            refresh_backup_summary(&mut snapshot.backup);
        } else if snapshot.backup.latest_id.is_none() {
            snapshot.backup.status = "never".to_string();
            snapshot.backup.last_verified_at = None;
            snapshot.backup.backup_count = 0;
            snapshot.backup.total_bytes = 0;
            snapshot.backup.last_action = None;
            snapshot.backup.operation = None;
            snapshot.backup.snapshots.clear();
        }
        Self {
            path,
            snapshot: Mutex::new(snapshot),
        }
    }

    fn persist(&self, snapshot: &HostSnapshot) -> Result<(), String> {
        persist_atomic(&self.path, snapshot)
    }
}

pub(crate) fn handle_supervisor_event(app: &tauri::AppHandle, event: SupervisorEvent) {
    let store = app.state::<HostStore>();
    if let Ok(mut snapshot) = store.snapshot.lock() {
        let persist = apply_supervisor_event(&mut snapshot, event);
        if persist {
            let _ = store.persist(&snapshot);
        }
    }
    let _ = app.emit("host-server-update", ());
}

fn apply_supervisor_event(snapshot: &mut HostSnapshot, event: SupervisorEvent) -> bool {
    match event {
        SupervisorEvent::Log(line) => {
            snapshot.server_logs.push(line);
            if snapshot.server_logs.len() > 80 {
                snapshot.server_logs.remove(0);
            }
            false
        }
        SupervisorEvent::Ready => {
            snapshot.server.lifecycle = "running".to_string();
            snapshot.server.active_camp = true;
            snapshot.server.sleep_inhibition = "active".to_string();
            push_diagnostic(
                snapshot,
                "SERVER_RUNNING",
                "Paper, Sheep City, the authenticated bridge, and the Minecraft listener are ready.",
                "info",
            );
            true
        }
        SupervisorEvent::Exited {
            clean,
            expected,
            message,
        } => {
            snapshot.server.active_camp = false;
            snapshot.server.sleep_inhibition = "inactive".to_string();
            if clean && expected {
                snapshot.server.lifecycle = "stopped".to_string();
                snapshot.server.last_exit = "clean".to_string();
                snapshot.server.recovery_required = false;
                push_diagnostic(snapshot, "SERVER_STOPPED", &message, "info");
            } else {
                snapshot.server.lifecycle = "failed".to_string();
                snapshot.server.last_exit = "unclean".to_string();
                snapshot.server.recovery_required = true;
                push_diagnostic(snapshot, "SERVER_UNCLEAN_EXIT", &message, "error");
            }
            true
        }
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

#[tauri::command]
async fn prepare_runtime_artifacts(
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
        if next_step != Some("firewall_approval") {
            return Err("Complete the earlier Host setup steps first.".to_string());
        }
    }
    let prepared = runtime.prepare_artifacts().await?;
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    for artifact in &mut snapshot.artifacts {
        match artifact.id.as_str() {
            "java" => {
                artifact.status = "verified".to_string();
                artifact.version = prepared.java_version.clone();
                artifact.checksum = "system-version-probe".to_string();
            }
            "paper" => {
                artifact.status = "verified".to_string();
                artifact.version = prepared.paper_version.clone();
                artifact.checksum = prepared.paper_sha256.clone();
            }
            "plugin" => {
                artifact.status = "verified".to_string();
                artifact.version = prepared.plugin_version.clone();
                artifact.checksum = prepared.plugin_sha256.clone();
            }
            _ => {}
        }
    }
    push_diagnostic(
        &mut snapshot,
        "HOST_ARTIFACTS_VERIFIED",
        "Pinned Paper and the bundled BadgerBots plugin passed verification; Java 21 passed a system version probe.",
        "info",
    );
    host.persist(&snapshot)?;
    Ok(snapshot.clone())
}

#[tauri::command]
fn approve_minecraft_firewall(
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
        if next_step != Some("firewall_approval")
            || snapshot
                .artifacts
                .iter()
                .any(|artifact| artifact.status != "verified")
        {
            return Err(
                "Install and verify the server files before firewall approval.".to_string(),
            );
        }
    }
    let configuration = runtime.configuration()?;
    approve_private_minecraft_port(configuration.server_port)?;
    mark_setup_step(
        &host,
        "firewall_approval",
        &format!(
            "Windows Private-network TCP access approved for port {}.",
            configuration.server_port
        ),
    )?;
    host_snapshot(host)
}

#[tauri::command]
async fn test_minecraft_server(
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
        if next_step != Some("test_server")
            || snapshot
                .artifacts
                .iter()
                .any(|artifact| artifact.status != "verified")
        {
            return Err(
                "Complete artifact installation and firewall approval before testing Paper."
                    .to_string(),
            );
        }
    }
    let prepared = runtime.prepare_artifacts().await?;
    let launch = runtime.verified_server_launch()?;
    {
        let mut snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        for artifact in &mut snapshot.artifacts {
            match artifact.id.as_str() {
                "java" => {
                    artifact.status = "verified".to_string();
                    artifact.version = prepared.java_version.clone();
                    artifact.checksum = "system-version-probe".to_string();
                }
                "paper" => {
                    artifact.status = "verified".to_string();
                    artifact.version = prepared.paper_version.clone();
                    artifact.checksum = prepared.paper_sha256.clone();
                }
                "plugin" => {
                    artifact.status = "verified".to_string();
                    artifact.version = prepared.plugin_version.clone();
                    artifact.checksum = prepared.plugin_sha256.clone();
                }
                _ => {}
            }
        }
        snapshot.server.lifecycle = "starting".to_string();
        snapshot.server.last_exit = "unknown".to_string();
        snapshot.server.recovery_required = false;
        snapshot.server_logs = vec!["Starting the managed Paper readiness test…".to_string()];
        push_diagnostic(
            &mut snapshot,
            "SERVER_TEST_STARTED",
            "The managed Paper readiness test started without opening a command window.",
            "info",
        );
        host.persist(&snapshot)?;
    }

    let result = match tauri::async_runtime::spawn_blocking(move || run_server_test(launch)).await {
        Ok(result) => result,
        Err(_) => {
            let mut snapshot = host
                .snapshot
                .lock()
                .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
            snapshot.server.lifecycle = "failed".to_string();
            snapshot.server.last_exit = "unclean".to_string();
            snapshot.server.recovery_required = false;
            push_diagnostic(
                &mut snapshot,
                "SERVER_TEST_WORKER_FAILED",
                "The Paper readiness worker stopped unexpectedly.",
                "error",
            );
            host.persist(&snapshot)?;
            return Err("The Paper readiness worker stopped unexpectedly.".to_string());
        }
    };
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    match result {
        Ok(report) => {
            snapshot.server.lifecycle = "stopped".to_string();
            snapshot.server.active_camp = false;
            snapshot.server.sleep_inhibition = "inactive".to_string();
            snapshot.server.last_exit = "clean".to_string();
            snapshot.server.recovery_required = false;
            snapshot.server_logs = report.logs;
            if let Some(step) = snapshot
                .setup_steps
                .iter_mut()
                .find(|step| step.id == "test_server")
            {
                step.status = "complete".to_string();
                step.detail =
                    "Paper, the Sheep City plugin, authenticated bridge, local port, and clean shutdown passed."
                        .to_string();
            }
            upsert_readiness(
                &mut snapshot,
                ReadinessCheck {
                    id: "network".to_string(),
                    label: "Local Minecraft listener".to_string(),
                    status: "warning".to_string(),
                    measured:
                        "Loopback server test passed; verify one student device on camp Wi-Fi."
                            .to_string(),
                    requirement: "Private Wi-Fi and scoped Minecraft port".to_string(),
                    recovery: Some(
                        "Run the student-device LAN check before the first camp day.".to_string(),
                    ),
                },
            );
            push_diagnostic(
                &mut snapshot,
                "SERVER_TEST_PASSED",
                "Paper, the BadgerBots plugin, authenticated bridge, local listener, and clean shutdown passed.",
                "info",
            );
            host.persist(&snapshot)?;
            Ok(snapshot.clone())
        }
        Err(failure) => {
            snapshot.server.lifecycle = "failed".to_string();
            snapshot.server.active_camp = false;
            snapshot.server.sleep_inhibition = "inactive".to_string();
            snapshot.server.last_exit = "unclean".to_string();
            snapshot.server.recovery_required = false;
            snapshot.server_logs = failure.logs;
            push_diagnostic(
                &mut snapshot,
                "SERVER_TEST_FAILED",
                &failure.message,
                "error",
            );
            host.persist(&snapshot)?;
            Err(failure.message)
        }
    }
}

#[tauri::command]
async fn start_minecraft_server(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, RuntimeStore>,
    manager: tauri::State<'_, ServerManager>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    if manager.is_active() {
        return Err("The managed Minecraft server is already active.".to_string());
    }
    let sheep_city_reset_pending = {
        let mut snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        let mut blockers = Vec::new();
        if snapshot
            .setup_steps
            .iter()
            .any(|step| step.status != "complete")
        {
            blockers.push("Complete all seven setup gates.");
        }
        if snapshot
            .readiness
            .iter()
            .any(|check| check.status == "pending" || check.status == "blocked")
        {
            blockers.push("Resolve blocked or pending readiness checks.");
        }
        if snapshot
            .artifacts
            .iter()
            .any(|artifact| artifact.status != "verified")
        {
            blockers.push("Verify all managed server artifacts.");
        }
        if snapshot.server.recovery_required {
            blockers.push("Complete crash recovery.");
        }
        if snapshot.server.lifecycle != "stopped" {
            blockers.push("Wait for the current server lifecycle to finish.");
        }
        if !blockers.is_empty() {
            return Err(blockers.join(" "));
        }
        let reset_pending =
            snapshot.backup.last_action.as_deref() == Some("sheep-city-reset-pending");
        snapshot.server.lifecycle = "starting".to_string();
        snapshot.server.active_camp = false;
        snapshot.server.sleep_inhibition = "requested".to_string();
        snapshot.server.last_exit = "unknown".to_string();
        snapshot.server_logs =
            vec!["[Host] Verifying an automatic world backup before startup…".to_string()];
        push_diagnostic(
            &mut snapshot,
            "SERVER_START_REQUESTED",
            "The instructor requested a managed classroom server start.",
            "info",
        );
        host.persist(&snapshot)?;
        reset_pending
    };
    let _ = app.emit("host-server-update", ());

    let prepared = runtime.prepare_artifacts().await.inspect_err(|message| {
        record_start_preflight_failure(&host, message, false);
    })?;
    let backup = (if sheep_city_reset_pending {
        runtime.verify_latest_world_backup()
    } else {
        runtime.create_world_backup("automatic-before-start")
    })
    .inspect_err(|message| {
        record_start_preflight_failure(&host, message, true);
    })?;
    let launch = runtime.verified_server_launch().inspect_err(|message| {
        record_start_preflight_failure(&host, message, false);
    })?;
    {
        let mut snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        apply_prepared_artifacts(&mut snapshot, &prepared);
        apply_backup_report(
            &mut snapshot,
            &backup,
            if sheep_city_reset_pending {
                "verified-before-sheep-city-regeneration"
            } else {
                "automatic-before-start"
            },
            !sheep_city_reset_pending,
        );
        snapshot
            .server_logs
            .push("[Host] Backup verified. Starting Paper…".to_string());
        host.persist(&snapshot)?;
    }
    if let Err(message) = manager.start(launch, app) {
        let mut snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        snapshot.server.lifecycle = "failed".to_string();
        snapshot.server.sleep_inhibition = "inactive".to_string();
        snapshot.server.last_exit = "unclean".to_string();
        snapshot.server.recovery_required = true;
        push_diagnostic(&mut snapshot, "SERVER_START_FAILED", &message, "error");
        host.persist(&snapshot)?;
        return Err(message);
    }
    host_snapshot(host)
}

fn record_start_preflight_failure(host: &HostStore, message: &str, backup_failed: bool) {
    if let Ok(mut snapshot) = host.snapshot.lock() {
        snapshot.server.lifecycle = "stopped".to_string();
        snapshot.server.active_camp = false;
        snapshot.server.sleep_inhibition = "inactive".to_string();
        if backup_failed {
            snapshot.backup.status = "failed".to_string();
        }
        push_diagnostic(
            &mut snapshot,
            "SERVER_START_PREFLIGHT_FAILED",
            message,
            "error",
        );
        let _ = host.persist(&snapshot);
    }
}

#[tauri::command]
fn stop_minecraft_server(
    manager: tauri::State<'_, ServerManager>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    {
        let mut snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        if !matches!(snapshot.server.lifecycle.as_str(), "starting" | "running") {
            return Err("The managed Minecraft server is not running.".to_string());
        }
        snapshot.server.lifecycle = "stopping".to_string();
        push_diagnostic(
            &mut snapshot,
            "SERVER_STOP_REQUESTED",
            "The instructor requested a clean Paper shutdown.",
            "info",
        );
        host.persist(&snapshot)?;
    }
    manager.request_stop(false)?;
    host_snapshot(host)
}

#[tauri::command]
async fn recover_minecraft_server(
    runtime: tauri::State<'_, RuntimeStore>,
    manager: tauri::State<'_, ServerManager>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    if manager.is_active() {
        return Err("Wait for the existing Paper process to exit before recovery.".to_string());
    }
    {
        let snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        if !snapshot.server.recovery_required || snapshot.server.lifecycle != "failed" {
            return Err("Server recovery is not currently required.".to_string());
        }
    }
    let interrupted_operation = {
        let snapshot = host
            .snapshot
            .lock()
            .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
        snapshot.backup.operation.clone()
    };
    let prepared = runtime.prepare_artifacts().await?;
    let backup = match interrupted_operation.as_deref() {
        Some(operation) if operation.starts_with("restore-in-progress:") => runtime
            .restore_world_backup(
                operation
                    .strip_prefix("restore-in-progress:")
                    .unwrap_or_default(),
            )?,
        Some("reset-in-progress") => runtime.restore_latest_world_backup()?,
        Some("backup-in-progress") => runtime.create_world_backup("recovery-after-interruption")?,
        _ => runtime.verify_latest_world_backup()?,
    };
    runtime.verified_server_launch()?;
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    apply_prepared_artifacts(&mut snapshot, &prepared);
    apply_backup_report(
        &mut snapshot,
        &backup,
        if interrupted_operation
            .as_deref()
            .is_some_and(|operation| operation.starts_with("restore-in-progress:"))
            || interrupted_operation.as_deref() == Some("reset-in-progress")
        {
            "restored-after-interrupted-maintenance"
        } else {
            "verified-after-crash"
        },
        interrupted_operation.as_deref() == Some("backup-in-progress"),
    );
    snapshot.server.lifecycle = "stopped".to_string();
    snapshot.server.active_camp = false;
    snapshot.server.sleep_inhibition = "inactive".to_string();
    snapshot.server.recovery_required = false;
    push_diagnostic(
        &mut snapshot,
        "SERVER_RECOVERY_COMPLETED",
        "Artifacts, safe configuration, and recovery evidence were re-verified.",
        "info",
    );
    host.persist(&snapshot)?;
    Ok(snapshot.clone())
}

#[tauri::command]
fn create_world_backup(
    runtime: tauri::State<'_, RuntimeStore>,
    manager: tauri::State<'_, ServerManager>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    begin_world_maintenance(&manager, &host, false, "backup-in-progress")?;
    let report = runtime
        .create_world_backup("manual")
        .inspect_err(|message| {
            end_failed_world_maintenance(&host, message, true);
        })?;
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    snapshot.server.lifecycle = "stopped".to_string();
    apply_backup_report(&mut snapshot, &report, "manual-backup", true);
    push_diagnostic(
        &mut snapshot,
        "WORLD_BACKUP_VERIFIED",
        "A checksummed managed-world backup was created and verified.",
        "info",
    );
    host.persist(&snapshot)?;
    Ok(snapshot.clone())
}

#[tauri::command]
fn restore_world_backup(
    backup_id: String,
    runtime: tauri::State<'_, RuntimeStore>,
    manager: tauri::State<'_, ServerManager>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    if backup_id.len() > 80
        || !backup_id.starts_with("world-")
        || !backup_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("The selected backup identity is invalid.".to_string());
    }
    begin_world_maintenance(
        &manager,
        &host,
        true,
        &format!("restore-in-progress:{backup_id}"),
    )?;
    let report = runtime
        .restore_world_backup(&backup_id)
        .inspect_err(|message| {
            end_failed_world_maintenance(&host, message, false);
        })?;
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    snapshot.server.lifecycle = "stopped".to_string();
    apply_backup_report(&mut snapshot, &report, "restored-selected", false);
    snapshot.server.last_exit = "clean".to_string();
    snapshot.server.recovery_required = false;
    push_diagnostic(
        &mut snapshot,
        "WORLD_BACKUP_RESTORED",
        "The selected verified managed-world backup was restored atomically.",
        "warning",
    );
    host.persist(&snapshot)?;
    Ok(snapshot.clone())
}

#[tauri::command]
fn reset_sheep_city_world(
    runtime: tauri::State<'_, RuntimeStore>,
    manager: tauri::State<'_, ServerManager>,
    host: tauri::State<'_, HostStore>,
) -> Result<HostSnapshot, String> {
    begin_world_maintenance(&manager, &host, false, "reset-in-progress")?;
    let report = runtime
        .backup_and_reset_sheep_city()
        .inspect_err(|message| {
            end_failed_world_maintenance(&host, message, true);
        })?;
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    snapshot.server.lifecycle = "stopped".to_string();
    apply_backup_report(&mut snapshot, &report, "sheep-city-reset-pending", true);
    push_diagnostic(
        &mut snapshot,
        "SHEEP_CITY_RESET",
        "Sheep City was reset after a verified recovery backup. Paper will regenerate it on next start.",
        "warning",
    );
    host.persist(&snapshot)?;
    Ok(snapshot.clone())
}

fn begin_world_maintenance(
    manager: &ServerManager,
    host: &HostStore,
    allow_pending_reset: bool,
    action: &str,
) -> Result<(), String> {
    if manager.is_active() {
        return Err("Stop Paper before changing managed world files.".to_string());
    }
    let mut snapshot = host
        .snapshot
        .lock()
        .map_err(|_| "Host state is temporarily unavailable.".to_string())?;
    if snapshot.server.lifecycle != "stopped" {
        return Err(
            "World backup, restore, and reset require a cleanly stopped server.".to_string(),
        );
    }
    if snapshot
        .setup_steps
        .iter()
        .any(|step| step.status != "complete")
    {
        return Err("Complete the graphical server test before managing worlds.".to_string());
    }
    if !allow_pending_reset
        && snapshot.backup.last_action.as_deref() == Some("sheep-city-reset-pending")
    {
        return Err(
            "Start and stop the server to regenerate Sheep City before creating another backup or reset."
                .to_string(),
        );
    }
    snapshot.server.lifecycle = "maintenance".to_string();
    snapshot.backup.operation = Some(action.to_string());
    host.persist(&snapshot)
}

fn end_failed_world_maintenance(host: &HostStore, message: &str, backup_failed: bool) {
    if let Ok(mut snapshot) = host.snapshot.lock() {
        snapshot.server.lifecycle = "stopped".to_string();
        if backup_failed {
            snapshot.backup.status = "failed".to_string();
        }
        snapshot.backup.operation = None;
        push_diagnostic(&mut snapshot, "WORLD_MAINTENANCE_FAILED", message, "error");
        let _ = host.persist(&snapshot);
    }
}

fn apply_backup_report(
    snapshot: &mut HostSnapshot,
    report: &world_backup::WorldBackupReport,
    action: &str,
    created: bool,
) {
    snapshot.backup.status = "verified".to_string();
    snapshot.backup.last_verified_at = Some(report.created_at.clone());
    if created {
        snapshot
            .backup
            .snapshots
            .retain(|backup| backup.backup_id != report.backup_id);
        snapshot.backup.snapshots.push(report.clone());
    }
    refresh_backup_summary(&mut snapshot.backup);
    snapshot.backup.last_action = Some(action.to_string());
    snapshot.backup.operation = None;
}

fn refresh_backup_summary(backup: &mut BackupState) {
    backup
        .snapshots
        .sort_by(|left, right| right.backup_id.cmp(&left.backup_id));
    backup.snapshots.truncate(5);
    backup.backup_count = backup.snapshots.len();
    backup.latest_id = backup
        .snapshots
        .first()
        .map(|snapshot| snapshot.backup_id.clone());
    backup.total_bytes = backup
        .snapshots
        .first()
        .map_or(0, |snapshot| snapshot.total_bytes);
    if backup.snapshots.is_empty() {
        backup.status = "never".to_string();
        backup.last_verified_at = None;
    } else {
        backup.status = "verified".to_string();
        backup.last_verified_at = backup
            .snapshots
            .first()
            .map(|snapshot| snapshot.created_at.clone());
    }
}

fn apply_prepared_artifacts(snapshot: &mut HostSnapshot, prepared: &runtime::ArtifactPreparation) {
    for artifact in &mut snapshot.artifacts {
        match artifact.id.as_str() {
            "java" => {
                artifact.status = "verified".to_string();
                artifact.version = prepared.java_version.clone();
                artifact.checksum = "system-version-probe".to_string();
            }
            "paper" => {
                artifact.status = "verified".to_string();
                artifact.version = prepared.paper_version.clone();
                artifact.checksum = prepared.paper_sha256.clone();
            }
            "plugin" => {
                artifact.status = "verified".to_string();
                artifact.version = prepared.plugin_version.clone();
                artifact.checksum = prepared.plugin_sha256.clone();
            }
            _ => {}
        }
    }
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
            latest_id: None,
            backup_count: 0,
            total_bytes: 0,
            last_action: None,
            operation: None,
            snapshots: Vec::new(),
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
        server_logs: Vec::new(),
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
            let runtime = RuntimeStore::new(data_directory.join("minecraft-runtime"));
            let discovered_backups = runtime.world_backups().ok();
            app.manage(HostStore::load(state_path, discovered_backups));
            app.manage(OnboardingStore::load(&data_directory).map_err(std::io::Error::other)?);
            app.manage(runtime);
            app.manage(ServerManager::new());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let manager = window.state::<ServerManager>();
                if manager.is_active() {
                    api.prevent_close();
                    let store = window.state::<HostStore>();
                    if let Ok(mut snapshot) = store.snapshot.lock() {
                        snapshot.server.lifecycle = "stopping".to_string();
                        push_diagnostic(
                            &mut snapshot,
                            "SERVER_APP_CLOSE_STOP",
                            "Host is stopping Paper before the application closes.",
                            "info",
                        );
                        let _ = store.persist(&snapshot);
                    }
                    let _ = manager.request_stop(true);
                    let _ = window.app_handle().emit("host-server-update", ());
                }
            }
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
            prepare_runtime_artifacts,
            approve_minecraft_firewall,
            test_minecraft_server,
            start_minecraft_server,
            stop_minecraft_server,
            recover_minecraft_server,
            create_world_backup,
            restore_world_backup,
            reset_sheep_city_world
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

    #[test]
    fn supervisor_updates_live_state_and_requires_recovery_after_a_crash() {
        let mut snapshot = initial_snapshot();
        assert!(apply_supervisor_event(
            &mut snapshot,
            SupervisorEvent::Ready
        ));
        assert_eq!(snapshot.server.lifecycle, "running");
        assert!(snapshot.server.active_camp);
        assert_eq!(snapshot.server.sleep_inhibition, "active");
        assert!(apply_supervisor_event(
            &mut snapshot,
            SupervisorEvent::Exited {
                clean: false,
                expected: false,
                message: "Injected crash.".to_string(),
            }
        ));
        assert_eq!(snapshot.server.lifecycle, "failed");
        assert!(snapshot.server.recovery_required);
        assert_eq!(snapshot.server.sleep_inhibition, "inactive");
    }

    #[test]
    fn live_console_retains_only_the_newest_eighty_lines() {
        let mut snapshot = initial_snapshot();
        for index in 0..100 {
            assert!(!apply_supervisor_event(
                &mut snapshot,
                SupervisorEvent::Log(format!("line-{index}")),
            ));
        }
        assert_eq!(snapshot.server_logs.len(), 80);
        assert_eq!(
            snapshot.server_logs.first().map(String::as_str),
            Some("line-20")
        );
        assert_eq!(
            snapshot.server_logs.last().map(String::as_str),
            Some("line-99")
        );
    }
}
