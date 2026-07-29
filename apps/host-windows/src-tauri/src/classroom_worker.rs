use crate::onboarding::ClassroomWorkerConfig;
use chrono::DateTime;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json, value::RawValue};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tokio::sync::watch;

const POLL_INTERVAL: Duration = Duration::from_secs(5);
const BUSY_POLL_INTERVAL: Duration = Duration::from_secs(1);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const BRIDGE_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
const MAX_BRIDGE_BYTES: u64 = 512 * 1024;
const MAX_ACKNOWLEDGEMENTS: usize = 512;

#[derive(Debug, Clone)]
pub(crate) enum ClassroomWorkerEvent {
    Started,
    Online,
    Offline(String),
    Command {
        command_id: String,
        status: String,
        code: Option<String>,
    },
    Stopped,
}

pub(crate) struct ClassroomWorkerManager {
    cancellation: Mutex<Option<watch::Sender<bool>>>,
}

impl ClassroomWorkerManager {
    pub(crate) fn new() -> Self {
        Self {
            cancellation: Mutex::new(None),
        }
    }

    pub(crate) fn start(
        &self,
        app: AppHandle,
        config: ClassroomWorkerConfig,
        bridge_directory: PathBuf,
        bridge_secret: Vec<u8>,
    ) -> Result<(), String> {
        if bridge_secret.len() < 32 {
            return Err("The local Paper bridge credential is invalid.".to_string());
        }
        let mut current = self
            .cancellation
            .lock()
            .map_err(|_| "Cloud synchronization controls are unavailable.".to_string())?;
        if current.is_some() {
            return Err("Cloud synchronization is already active.".to_string());
        }
        let (sender, receiver) = watch::channel(false);
        *current = Some(sender);
        drop(current);
        let state_path = bridge_directory
            .parent()
            .unwrap_or(&bridge_directory)
            .join("classroom-worker-state.json");
        tauri::async_runtime::spawn(run_worker(
            app,
            config,
            bridge_directory,
            bridge_secret,
            state_path,
            receiver,
        ));
        Ok(())
    }

    pub(crate) fn stop(&self) {
        if let Ok(mut current) = self.cancellation.lock()
            && let Some(sender) = current.take()
        {
            let _ = sender.send(true);
        }
    }
}

#[derive(Debug, Deserialize)]
struct PollResponse {
    command: Option<Box<RawValue>>,
    signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCommand {
    id: String,
    organization_id: String,
    location_id: String,
    session_id: String,
    workspace_id: String,
    sequence: i64,
    kind: CommandKind,
    payload: Value,
    issued_at: String,
    expires_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum CommandKind {
    DeployProgram,
    StopProgram,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostAcknowledgement {
    command_id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_runtime_version_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DurableWorkerState {
    schema_version: u8,
    highest_sequence: i64,
    acknowledgements: VecDeque<HostAcknowledgement>,
}

impl Default for DurableWorkerState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            highest_sequence: -1,
            acknowledgements: VecDeque::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Program {
    schema_version: u8,
    program_id: String,
    project_id: String,
    scripts: Vec<Script>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Script {
    id: String,
    node_type: String,
    script_kind: String,
    display_name: String,
    body: Vec<Event>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "nodeType", deny_unknown_fields)]
enum Event {
    #[serde(rename = "projectile_hit_event")]
    ProjectileHit { id: String, body: Vec<Statement> },
    #[serde(rename = "player_move_event")]
    PlayerMove { id: String, body: Vec<Statement> },
    #[serde(rename = "sheep_spawn_event")]
    SheepSpawn { id: String, body: Vec<Statement> },
    #[serde(rename = "sheep_death_event")]
    SheepDeath { id: String, body: Vec<Statement> },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "nodeType", rename_all = "snake_case", deny_unknown_fields)]
enum Statement {
    ExplodeAtHit {
        id: String,
        power: f64,
    },
    IfThen {
        id: String,
        condition: EqualityCondition,
        then: Vec<Statement>,
    },
    BouncePlayer {
        id: String,
        #[serde(rename = "verticalVelocity")]
        vertical_velocity: f64,
    },
    SetSheepColor {
        id: String,
        color: String,
    },
    SetSheepSpeed {
        id: String,
        multiplier: f64,
    },
    DropItem {
        id: String,
        item: String,
        quantity: i64,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EqualityCondition {
    id: String,
    node_type: String,
    left: MaterialExpression,
    right: MaterialExpression,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "nodeType", rename_all = "snake_case", deny_unknown_fields)]
enum MaterialExpression {
    GetMaterialUnderPlayer { id: String },
    MaterialLiteral { id: String, material: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeResponse {
    command_id: String,
    status: String,
    code: Option<String>,
    active_program_version_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SignedBridgeResponse {
    payload: String,
    signature: String,
}

async fn run_worker(
    app: AppHandle,
    config: ClassroomWorkerConfig,
    bridge_directory: PathBuf,
    bridge_secret: Vec<u8>,
    state_path: PathBuf,
    cancellation: watch::Receiver<bool>,
) {
    crate::handle_classroom_worker_event(&app, ClassroomWorkerEvent::Started);
    let client = match Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(REQUEST_TIMEOUT)
        .https_only(true)
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            crate::handle_classroom_worker_event(
                &app,
                ClassroomWorkerEvent::Offline(
                    "Secure classroom networking could not be initialized.".to_string(),
                ),
            );
            return;
        }
    };
    let mut state = load_state(&state_path);
    while !*cancellation.borrow() {
        let delay = match poll_once(
            &client,
            &config,
            &bridge_directory,
            &bridge_secret,
            &state_path,
            &mut state,
        )
        .await
        {
            Ok(event) => {
                let busy = matches!(event, Some(ClassroomWorkerEvent::Command { .. }));
                crate::handle_classroom_worker_event(
                    &app,
                    event.unwrap_or(ClassroomWorkerEvent::Online),
                );
                if busy {
                    BUSY_POLL_INTERVAL
                } else {
                    POLL_INTERVAL
                }
            }
            Err(message) => {
                crate::handle_classroom_worker_event(&app, ClassroomWorkerEvent::Offline(message));
                POLL_INTERVAL
            }
        };
        tokio::time::sleep(delay).await;
    }
    crate::handle_classroom_worker_event(&app, ClassroomWorkerEvent::Stopped);
}

async fn poll_once(
    client: &Client,
    config: &ClassroomWorkerConfig,
    bridge_directory: &Path,
    bridge_secret: &[u8],
    state_path: &Path,
    state: &mut DurableWorkerState,
) -> Result<Option<ClassroomWorkerEvent>, String> {
    let response = host_request(client, config, &json!({ "action": "host_poll" })).await?;
    let poll = serde_json::from_slice::<PollResponse>(&response)
        .map_err(|_| "The classroom poll response was invalid.".to_string())?;
    let Some(raw_command) = poll.command else {
        return Ok(None);
    };
    let signature = poll
        .signature
        .ok_or_else(|| "The classroom command signature was missing.".to_string())?;
    if !verify_hmac_hex(
        config.pairing_token.as_bytes(),
        raw_command.get().as_bytes(),
        &signature,
    ) {
        return Err("A classroom command failed authentication and was ignored.".to_string());
    }
    let command = serde_json::from_str::<CloudCommand>(raw_command.get())
        .map_err(|_| "The authenticated classroom command was malformed.".to_string())?;
    validate_cloud_command(&command)?;

    if let Some(previous) = state
        .acknowledgements
        .iter()
        .find(|acknowledgement| acknowledgement.command_id == command.id)
        .cloned()
    {
        acknowledge(client, config, &previous).await?;
        remove_bridge_response(bridge_directory, &command.id);
        return Ok(Some(command_event(&previous)));
    }

    let acknowledgement = if command.sequence <= state.highest_sequence || command_expired(&command)
    {
        HostAcknowledgement {
            command_id: command.id.clone(),
            status: "rejected".to_string(),
            code: Some("stale_or_expired_command".to_string()),
            active_runtime_version_id: None,
        }
    } else {
        handle_command(&command, bridge_directory, bridge_secret).await
    };
    state.highest_sequence = state.highest_sequence.max(command.sequence);
    remember_acknowledgement(state, acknowledgement.clone());
    persist_state(state_path, state)?;
    acknowledge(client, config, &acknowledgement).await?;
    remove_bridge_response(bridge_directory, &command.id);
    Ok(Some(command_event(&acknowledgement)))
}

async fn handle_command(
    command: &CloudCommand,
    bridge_directory: &Path,
    bridge_secret: &[u8],
) -> HostAcknowledgement {
    let payload = match compile_bridge_command(command) {
        Ok(payload) => payload,
        Err(code) => return rejected(&command.id, &code),
    };
    match deliver_to_paper(bridge_directory, bridge_secret, &command.id, payload).await {
        Ok(response) => HostAcknowledgement {
            command_id: command.id.clone(),
            status: response.status,
            code: response.code,
            active_runtime_version_id: response.active_program_version_id,
        },
        Err(code) => rejected(&command.id, &code),
    }
}

fn rejected(command_id: &str, code: &str) -> HostAcknowledgement {
    HostAcknowledgement {
        command_id: command_id.to_string(),
        status: "rejected".to_string(),
        code: Some(code.to_string()),
        active_runtime_version_id: None,
    }
}

fn compile_bridge_command(command: &CloudCommand) -> Result<String, String> {
    let camper_id = payload_identifier(&command.payload, "camperId")?;
    let project_id = payload_identifier(&command.payload, "projectId")?;
    if project_id != "sheep-city" {
        return Err("program_validation_failed".to_string());
    }
    let scope = json!({
        "organizationId": command.organization_id,
        "locationId": command.location_id,
        "sessionId": command.session_id,
        "projectId": project_id,
        "studentId": camper_id,
        "worldId": format!("classroom-world-{camper_id}"),
    });
    let payload = match command.kind {
        CommandKind::StopProgram => json!({
            "commandId": command.id,
            "kind": "stop_program",
            "scope": scope,
        }),
        CommandKind::DeployProgram => {
            let version_id = payload_identifier(&command.payload, "programVersionId")?;
            let program_value = command
                .payload
                .get("program")
                .cloned()
                .ok_or_else(|| "program_validation_failed".to_string())?;
            let program = serde_json::from_value::<Program>(program_value)
                .map_err(|_| "program_validation_failed".to_string())?;
            validate_program(&program)?;
            let mut deployment = json!({
                "commandId": command.id,
                "kind": "deploy_program",
                "scope": scope,
                "programVersionId": version_id,
                "graph": compile_program(&program),
            });
            if let Some(expected) = command
                .payload
                .get("expectedActiveVersionId")
                .and_then(Value::as_str)
            {
                if !safe_identifier(expected) {
                    return Err("program_validation_failed".to_string());
                }
                deployment
                    .as_object_mut()
                    .expect("deployment is an object")
                    .insert(
                        "expectedActiveVersionId".to_string(),
                        Value::String(expected.to_string()),
                    );
            }
            deployment
        }
    };
    serde_json::to_string(&payload).map_err(|_| "host_delivery_failed".to_string())
}

fn payload_identifier<'a>(payload: &'a Value, field: &str) -> Result<&'a str, String> {
    let value = payload
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| "program_validation_failed".to_string())?;
    if safe_identifier(value) {
        Ok(value)
    } else {
        Err("program_validation_failed".to_string())
    }
}

fn validate_program(program: &Program) -> Result<(), String> {
    if program.schema_version != 2
        || program.project_id != "sheep-city"
        || !valid_node_id(&program.program_id)
        || program.scripts.len() != 3
    {
        return Err("program_validation_failed".to_string());
    }
    let mut ids = BTreeSet::from([program.program_id.as_str()]);
    let mut kinds = BTreeSet::new();
    let mut node_count = 1_usize;
    for script in &program.scripts {
        if script.node_type != "script"
            || !valid_node_id(&script.id)
            || !ids.insert(&script.id)
            || !matches!(script.script_kind.as_str(), "player" | "game" | "sheep")
            || !matches!(script.display_name.as_str(), "Player" | "Game" | "Sheep")
            || !kinds.insert(script.script_kind.as_str())
            || !script_name_matches_kind(script)
        {
            return Err("program_validation_failed".to_string());
        }
        node_count += 1;
        let mut events = BTreeSet::new();
        for event in &script.body {
            if !event_allowed(script.script_kind.as_str(), event)
                || !events.insert(event.kind())
                || !valid_node_id(event.id())
                || !ids.insert(event.id())
                || event.body().len() > 32
            {
                return Err("program_validation_failed".to_string());
            }
            node_count += 1;
            for statement in event.body() {
                validate_statement(statement, event.kind(), 1, &mut ids, &mut node_count)?;
            }
        }
    }
    if kinds != BTreeSet::from(["game", "player", "sheep"]) || node_count > 128 {
        return Err("program_validation_failed".to_string());
    }
    Ok(())
}

fn validate_statement<'a>(
    statement: &'a Statement,
    event: &str,
    depth: usize,
    ids: &mut BTreeSet<&'a str>,
    node_count: &mut usize,
) -> Result<(), String> {
    if depth > 8 || !valid_node_id(statement.id()) || !ids.insert(statement.id()) {
        return Err("program_validation_failed".to_string());
    }
    *node_count += 1;
    match statement {
        Statement::ExplodeAtHit { power, .. }
            if event == "projectile_hit_event" && bounded(*power, 0.5, 4.0) => {}
        Statement::BouncePlayer {
            vertical_velocity, ..
        } if event == "player_move_event" && bounded(*vertical_velocity, 0.1, 3.0) => {}
        Statement::SetSheepColor { color, .. }
            if event == "sheep_spawn_event" && color == "RED" => {}
        Statement::SetSheepSpeed { multiplier, .. }
            if event == "sheep_spawn_event" && bounded(*multiplier, 0.1, 4.0) => {}
        Statement::DropItem { item, quantity, .. }
            if event == "sheep_death_event"
                && item == "GOLD_INGOT"
                && (1..=16).contains(quantity) => {}
        Statement::IfThen {
            condition, then, ..
        } if event == "player_move_event" => {
            validate_condition(condition, ids, node_count)?;
            for child in then {
                validate_statement(child, event, depth + 1, ids, node_count)?;
            }
        }
        _ => return Err("program_validation_failed".to_string()),
    }
    Ok(())
}

fn validate_condition<'a>(
    condition: &'a EqualityCondition,
    ids: &mut BTreeSet<&'a str>,
    node_count: &mut usize,
) -> Result<(), String> {
    if condition.node_type != "equals"
        || !valid_node_id(&condition.id)
        || !ids.insert(&condition.id)
    {
        return Err("program_validation_failed".to_string());
    }
    *node_count += 1;
    for expression in [&condition.left, &condition.right] {
        if !valid_node_id(expression.id())
            || !ids.insert(expression.id())
            || !expression.supported()
        {
            return Err("program_validation_failed".to_string());
        }
        *node_count += 1;
    }
    Ok(())
}

fn compile_program(program: &Program) -> Value {
    let mut scripts = program.scripts.iter().collect::<Vec<_>>();
    scripts.sort_by_key(|script| script_rank(&script.script_kind));
    let handlers = scripts
        .into_iter()
        .flat_map(|script| {
            let mut events = script.body.iter().collect::<Vec<_>>();
            events.sort_by_key(|event| event_rank(event.kind()));
            events
        })
        .map(|event| {
            json!({
                "sourceNodeId": event.id(),
                "event": event.runtime_kind(),
                "instructions": event.body().iter().map(compile_statement).collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();
    json!({
        "graphVersion": 2,
        "programSchemaVersion": 2,
        "programId": program.program_id,
        "projectId": "sheep-city",
        "handlers": handlers,
    })
}

fn compile_statement(statement: &Statement) -> Value {
    match statement {
        Statement::ExplodeAtHit { id, power } => json!({
            "sourceNodeId": id,
            "opcode": "explode_at_event_location",
            "power": power,
        }),
        Statement::IfThen {
            id,
            condition,
            then,
        } => json!({
            "sourceNodeId": id,
            "opcode": "if",
            "condition": compile_condition(condition),
            "then": then.iter().map(compile_statement).collect::<Vec<_>>(),
        }),
        Statement::BouncePlayer {
            id,
            vertical_velocity,
        } => json!({
            "sourceNodeId": id,
            "opcode": "set_vertical_velocity",
            "value": vertical_velocity,
        }),
        Statement::SetSheepColor { id, color } => json!({
            "sourceNodeId": id,
            "opcode": "set_sheep_color",
            "color": color,
        }),
        Statement::SetSheepSpeed { id, multiplier } => json!({
            "sourceNodeId": id,
            "opcode": "set_sheep_speed_multiplier",
            "multiplier": multiplier,
        }),
        Statement::DropItem { id, item, quantity } => json!({
            "sourceNodeId": id,
            "opcode": "drop_item",
            "item": item,
            "quantity": quantity,
        }),
    }
}

fn compile_condition(condition: &EqualityCondition) -> Value {
    json!({
        "sourceNodeId": condition.id,
        "opcode": "equals",
        "left": compile_material(&condition.left),
        "right": compile_material(&condition.right),
    })
}

fn compile_material(expression: &MaterialExpression) -> Value {
    match expression {
        MaterialExpression::GetMaterialUnderPlayer { id } => json!({
            "sourceNodeId": id,
            "opcode": "read_material_under_player",
        }),
        MaterialExpression::MaterialLiteral { id, material } => json!({
            "sourceNodeId": id,
            "opcode": "material_constant",
            "material": material,
        }),
    }
}

impl Event {
    fn id(&self) -> &str {
        match self {
            Self::ProjectileHit { id, .. }
            | Self::PlayerMove { id, .. }
            | Self::SheepSpawn { id, .. }
            | Self::SheepDeath { id, .. } => id,
        }
    }

    fn body(&self) -> &[Statement] {
        match self {
            Self::ProjectileHit { body, .. }
            | Self::PlayerMove { body, .. }
            | Self::SheepSpawn { body, .. }
            | Self::SheepDeath { body, .. } => body,
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::ProjectileHit { .. } => "projectile_hit_event",
            Self::PlayerMove { .. } => "player_move_event",
            Self::SheepSpawn { .. } => "sheep_spawn_event",
            Self::SheepDeath { .. } => "sheep_death_event",
        }
    }

    fn runtime_kind(&self) -> &'static str {
        match self {
            Self::ProjectileHit { .. } => "projectile_hit",
            Self::PlayerMove { .. } => "player_move",
            Self::SheepSpawn { .. } => "sheep_spawn",
            Self::SheepDeath { .. } => "sheep_death",
        }
    }
}

impl Statement {
    fn id(&self) -> &str {
        match self {
            Self::ExplodeAtHit { id, .. }
            | Self::IfThen { id, .. }
            | Self::BouncePlayer { id, .. }
            | Self::SetSheepColor { id, .. }
            | Self::SetSheepSpeed { id, .. }
            | Self::DropItem { id, .. } => id,
        }
    }
}

impl MaterialExpression {
    fn id(&self) -> &str {
        match self {
            Self::GetMaterialUnderPlayer { id } | Self::MaterialLiteral { id, .. } => id,
        }
    }

    fn supported(&self) -> bool {
        match self {
            Self::GetMaterialUnderPlayer { .. } => true,
            Self::MaterialLiteral { material, .. } => material == "GOLD_BLOCK",
        }
    }
}

fn script_name_matches_kind(script: &Script) -> bool {
    matches!(
        (script.script_kind.as_str(), script.display_name.as_str()),
        ("player", "Player") | ("game", "Game") | ("sheep", "Sheep")
    )
}

fn event_allowed(script_kind: &str, event: &Event) -> bool {
    matches!(
        (script_kind, event),
        ("player", Event::ProjectileHit { .. })
            | ("player", Event::PlayerMove { .. })
            | ("sheep", Event::SheepSpawn { .. })
            | ("sheep", Event::SheepDeath { .. })
    )
}

fn script_rank(kind: &str) -> usize {
    match kind {
        "player" => 0,
        "game" => 1,
        "sheep" => 2,
        _ => usize::MAX,
    }
}

fn event_rank(kind: &str) -> usize {
    match kind {
        "projectile_hit_event" => 0,
        "player_move_event" => 1,
        "sheep_spawn_event" => 2,
        "sheep_death_event" => 3,
        _ => usize::MAX,
    }
}

fn valid_node_id(value: &str) -> bool {
    (3..=64).contains(&value.len())
        && value.starts_with(|character: char| character.is_ascii_lowercase())
        && value.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}

fn bounded(value: f64, minimum: f64, maximum: f64) -> bool {
    value.is_finite() && value >= minimum && value <= maximum
}

async fn deliver_to_paper(
    bridge_directory: &Path,
    bridge_secret: &[u8],
    command_id: &str,
    payload: String,
) -> Result<BridgeResponse, String> {
    if !safe_file_id(command_id) {
        return Err("invalid_command_id".to_string());
    }
    let inbox = bridge_directory.join("inbox");
    let outbox = bridge_directory.join("outbox");
    fs::create_dir_all(&inbox).map_err(|_| "paper_bridge_unavailable".to_string())?;
    fs::create_dir_all(&outbox).map_err(|_| "paper_bridge_unavailable".to_string())?;
    let filename = format!("{command_id}.json");
    let response_path = outbox.join(&filename);
    if !response_path.is_file() {
        let request_path = inbox.join(&filename);
        let temporary = inbox.join(format!("{command_id}.json.new"));
        let wrapper = json!({
            "payload": payload,
            "signature": hmac_hex(bridge_secret, payload.as_bytes()),
        });
        let bytes = serde_json::to_vec(&wrapper).map_err(|_| "host_delivery_failed".to_string())?;
        if bytes.len() as u64 > MAX_BRIDGE_BYTES {
            return Err("request_too_large".to_string());
        }
        fs::write(&temporary, bytes).map_err(|_| "paper_bridge_unavailable".to_string())?;
        fs::rename(&temporary, &request_path)
            .map_err(|_| "paper_bridge_unavailable".to_string())?;
    }

    let deadline = tokio::time::Instant::now() + BRIDGE_TIMEOUT;
    loop {
        if let Ok(metadata) = fs::metadata(&response_path) {
            if metadata.len() > MAX_BRIDGE_BYTES {
                let _ = fs::remove_file(&response_path);
                return Err("paper_response_too_large".to_string());
            }
            let bytes =
                fs::read(&response_path).map_err(|_| "paper_bridge_unavailable".to_string())?;
            let wrapper = serde_json::from_slice::<SignedBridgeResponse>(&bytes)
                .map_err(|_| "paper_response_invalid".to_string())?;
            if !verify_hmac_hex(
                bridge_secret,
                wrapper.payload.as_bytes(),
                &wrapper.signature,
            ) {
                return Err("paper_response_signature_rejected".to_string());
            }
            let response = serde_json::from_str::<BridgeResponse>(&wrapper.payload)
                .map_err(|_| "paper_response_invalid".to_string())?;
            if response.command_id != command_id
                || !matches!(response.status.as_str(), "accepted" | "rejected")
            {
                return Err("paper_response_invalid".to_string());
            }
            return Ok(response);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("paper_ack_timeout".to_string());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn remove_bridge_response(bridge_directory: &Path, command_id: &str) {
    if safe_file_id(command_id) {
        let _ = fs::remove_file(
            bridge_directory
                .join("outbox")
                .join(format!("{command_id}.json")),
        );
    }
}

async fn acknowledge(
    client: &Client,
    config: &ClassroomWorkerConfig,
    acknowledgement: &HostAcknowledgement,
) -> Result<(), String> {
    let payload = serde_json::to_string(acknowledgement)
        .map_err(|_| "The Host acknowledgement could not be serialized.".to_string())?;
    let mut body = serde_json::to_value(acknowledgement)
        .map_err(|_| "The Host acknowledgement could not be serialized.".to_string())?;
    body.as_object_mut()
        .ok_or_else(|| "The Host acknowledgement was invalid.".to_string())?
        .insert("action".to_string(), Value::String("host_ack".to_string()));
    body.as_object_mut().unwrap().insert(
        "signature".to_string(),
        Value::String(hmac_hex(
            config.pairing_token.as_bytes(),
            payload.as_bytes(),
        )),
    );
    host_request(client, config, &body).await?;
    Ok(())
}

async fn host_request(
    client: &Client,
    config: &ClassroomWorkerConfig,
    body: &Value,
) -> Result<Vec<u8>, String> {
    let response = client
        .post(&config.api_url)
        .header("apikey", &config.publishable_key)
        .header("x-badgerbots-host-id", &config.host_id)
        .header("x-badgerbots-host-token", &config.pairing_token)
        .json(body)
        .send()
        .await
        .map_err(|_| "The Host could not reach the classroom service.".to_string())?;
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return Err("The classroom service response was too large.".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "The classroom service response ended unexpectedly.".to_string())?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("The classroom service response was too large.".to_string());
    }
    if !status.is_success() {
        return Err(serde_json::from_slice::<Value>(&bytes)
            .ok()
            .and_then(|value| value.get("error")?.as_str().map(str::to_string))
            .filter(|message| message.len() <= 300)
            .unwrap_or_else(|| format!("The classroom service returned HTTP {status}.")));
    }
    Ok(bytes.to_vec())
}

fn validate_cloud_command(command: &CloudCommand) -> Result<(), String> {
    for value in [
        &command.id,
        &command.organization_id,
        &command.location_id,
        &command.session_id,
        &command.workspace_id,
    ] {
        if !safe_identifier(value) {
            return Err(
                "The authenticated classroom command used an invalid identifier.".to_string(),
            );
        }
    }
    if command.sequence < 0 {
        return Err("The authenticated classroom command used an invalid sequence.".to_string());
    }
    let issued = DateTime::parse_from_rfc3339(&command.issued_at)
        .map_err(|_| "The classroom command issue time was invalid.".to_string())?
        .timestamp_millis();
    let expires = DateTime::parse_from_rfc3339(&command.expires_at)
        .map_err(|_| "The classroom command expiry was invalid.".to_string())?
        .timestamp_millis();
    let now = now_millis();
    if issued > now + 30_000 || expires <= issued || expires - issued > 300_000 {
        return Err("The classroom command time window was rejected.".to_string());
    }
    Ok(())
}

fn command_expired(command: &CloudCommand) -> bool {
    DateTime::parse_from_rfc3339(&command.expires_at)
        .map(|value| value.timestamp_millis() <= now_millis())
        .unwrap_or(true)
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or_default()
}

fn remember_acknowledgement(state: &mut DurableWorkerState, acknowledgement: HostAcknowledgement) {
    state.acknowledgements.push_back(acknowledgement);
    while state.acknowledgements.len() > MAX_ACKNOWLEDGEMENTS {
        state.acknowledgements.pop_front();
    }
}

fn load_state(path: &Path) -> DurableWorkerState {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<DurableWorkerState>(&bytes).ok())
        .filter(|state| {
            state.schema_version == 1 && state.acknowledgements.len() <= MAX_ACKNOWLEDGEMENTS
        })
        .unwrap_or_default()
}

fn persist_state(path: &Path, state: &DurableWorkerState) -> Result<(), String> {
    let temporary = path.with_extension("json.new");
    let bytes = serde_json::to_vec_pretty(state)
        .map_err(|_| "Cloud command recovery state could not be serialized.".to_string())?;
    fs::write(&temporary, bytes)
        .map_err(|_| "Cloud command recovery state could not be staged.".to_string())?;
    replace_file_atomic(&temporary, path)
        .map_err(|_| "Cloud command recovery state could not be saved.".to_string())
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

fn command_event(acknowledgement: &HostAcknowledgement) -> ClassroomWorkerEvent {
    ClassroomWorkerEvent::Command {
        command_id: acknowledgement.command_id.clone(),
        status: acknowledgement.status.clone(),
        code: acknowledgement.code.clone(),
    }
}

fn safe_identifier(value: &str) -> bool {
    (8..=64).contains(&value.len())
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn safe_file_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn hmac_hex(key: &[u8], payload: &[u8]) -> String {
    let mut block = [0_u8; 64];
    if key.len() > block.len() {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36_u8; 64];
    let mut outer_pad = [0x5c_u8; 64];
    for index in 0..64 {
        inner_pad[index] ^= block[index];
        outer_pad[index] ^= block[index];
    }
    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(payload);
    let inner_hash = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner_hash);
    format!("{:x}", outer.finalize())
}

fn verify_hmac_hex(key: &[u8], payload: &[u8], provided: &str) -> bool {
    if provided.len() != 64 || !provided.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return false;
    }
    let expected = hmac_hex(key, payload);
    expected
        .bytes()
        .zip(provided.bytes())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right.to_ascii_lowercase())
        })
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deployment_command(program: Value) -> CloudCommand {
        CloudCommand {
            id: "11111111-1111-4111-8111-111111111111".to_string(),
            organization_id: "22222222-2222-4222-8222-222222222222".to_string(),
            location_id: "33333333-3333-4333-8333-333333333333".to_string(),
            session_id: "44444444-4444-4444-8444-444444444444".to_string(),
            workspace_id: "55555555-5555-4555-8555-555555555555".to_string(),
            sequence: 1,
            kind: CommandKind::DeployProgram,
            payload: json!({
                "camperId": "66666666-6666-4666-8666-666666666666",
                "projectId": "sheep-city",
                "programVersionId": "77777777-7777-4777-8777-777777777777",
                "program": program,
            }),
            issued_at: "2026-07-29T12:00:00Z".to_string(),
            expires_at: "2026-07-29T12:01:00Z".to_string(),
        }
    }

    fn completed_program() -> Value {
        json!({
            "schemaVersion": 2,
            "programId": "sheep-city-complete",
            "projectId": "sheep-city",
            "scripts": [
                {
                    "id": "script-sheep",
                    "nodeType": "script",
                    "scriptKind": "sheep",
                    "displayName": "Sheep",
                    "body": [
                        {
                            "id": "event-sheep-death",
                            "nodeType": "sheep_death_event",
                            "body": [{
                                "id": "drop-gold",
                                "nodeType": "drop_item",
                                "item": "GOLD_INGOT",
                                "quantity": 2
                            }]
                        },
                        {
                            "id": "event-sheep-spawn",
                            "nodeType": "sheep_spawn_event",
                            "body": [
                                {
                                    "id": "sheep-red",
                                    "nodeType": "set_sheep_color",
                                    "color": "RED"
                                },
                                {
                                    "id": "sheep-fast",
                                    "nodeType": "set_sheep_speed",
                                    "multiplier": 1.5
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "script-player",
                    "nodeType": "script",
                    "scriptKind": "player",
                    "displayName": "Player",
                    "body": [
                        {
                            "id": "event-player-move",
                            "nodeType": "player_move_event",
                            "body": [{
                                "id": "if-gold",
                                "nodeType": "if_then",
                                "condition": {
                                    "id": "equals-gold",
                                    "nodeType": "equals",
                                    "left": {
                                        "id": "material-under",
                                        "nodeType": "get_material_under_player"
                                    },
                                    "right": {
                                        "id": "gold-material",
                                        "nodeType": "material_literal",
                                        "material": "GOLD_BLOCK"
                                    }
                                },
                                "then": [{
                                    "id": "bounce-gold",
                                    "nodeType": "bounce_player",
                                    "verticalVelocity": 1.2
                                }]
                            }]
                        },
                        {
                            "id": "event-projectile-hit",
                            "nodeType": "projectile_hit_event",
                            "body": [{
                                "id": "explode-arrow",
                                "nodeType": "explode_at_hit",
                                "power": 2
                            }]
                        }
                    ]
                },
                {
                    "id": "script-game",
                    "nodeType": "script",
                    "scriptKind": "game",
                    "displayName": "Game",
                    "body": []
                }
            ]
        })
    }

    #[test]
    fn hmac_matches_the_cloud_sha256_contract() {
        assert_eq!(
            hmac_hex(b"key", b"The quick brown fox jumps over the lazy dog"),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
        assert!(verify_hmac_hex(
            b"key",
            b"The quick brown fox jumps over the lazy dog",
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        ));
        assert!(!verify_hmac_hex(b"key", b"tampered", &"0".repeat(64)));
    }

    #[test]
    fn durable_acknowledgements_are_bounded() {
        let mut state = DurableWorkerState::default();
        for index in 0..600 {
            remember_acknowledgement(
                &mut state,
                HostAcknowledgement {
                    command_id: format!("command-{index}"),
                    status: "accepted".to_string(),
                    code: None,
                    active_runtime_version_id: None,
                },
            );
        }
        assert_eq!(state.acknowledgements.len(), MAX_ACKNOWLEDGEMENTS);
        assert_eq!(
            state.acknowledgements.front().unwrap().command_id,
            "command-88"
        );
    }

    #[test]
    fn compiles_valid_cloud_program_to_deterministic_paper_graph() {
        let payload = compile_bridge_command(&deployment_command(completed_program())).unwrap();
        let command: Value = serde_json::from_str(&payload).unwrap();
        let handlers = command["graph"]["handlers"].as_array().unwrap();
        assert_eq!(handlers.len(), 4);
        assert_eq!(handlers[0]["event"], "projectile_hit");
        assert_eq!(
            handlers[0]["instructions"][0]["opcode"],
            "explode_at_event_location"
        );
        assert_eq!(handlers[1]["event"], "player_move");
        assert_eq!(handlers[1]["instructions"][0]["opcode"], "if");
        assert_eq!(
            handlers[1]["instructions"][0]["condition"]["left"]["opcode"],
            "read_material_under_player"
        );
        assert_eq!(handlers[2]["event"], "sheep_spawn");
        assert_eq!(handlers[3]["event"], "sheep_death");
        assert_eq!(
            command["scope"]["studentId"],
            "66666666-6666-4666-8666-666666666666"
        );
    }

    #[test]
    fn rejects_out_of_range_program_before_paper_delivery() {
        let mut program = completed_program();
        program["scripts"][1]["body"][1]["body"][0]["power"] = json!(40);
        assert_eq!(
            compile_bridge_command(&deployment_command(program)),
            Err("program_validation_failed".to_string())
        );
    }
}
