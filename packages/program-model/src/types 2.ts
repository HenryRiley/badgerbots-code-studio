export const PROGRAM_SCHEMA_VERSION = 1 as const;

export const SCRIPT_KINDS = ["player", "game", "sheep"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

export const EVENT_TYPES = [
  "projectile_hit_event",
  "player_move_event",
  "sheep_spawn_event",
  "sheep_death_event",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface NodeBase {
  id: string;
  nodeType: string;
}

export interface ExplodeAtHitNode extends NodeBase {
  nodeType: "explode_at_hit";
  power: number;
}

export interface BouncePlayerNode extends NodeBase {
  nodeType: "bounce_player";
  verticalVelocity: number;
}

export interface IfOnMaterialNode extends NodeBase {
  nodeType: "if_on_material";
  material: "GOLD_BLOCK";
  then: StatementNode[];
}

export interface SetSheepColorNode extends NodeBase {
  nodeType: "set_sheep_color";
  color: "RED";
}

export interface SetSheepSpeedNode extends NodeBase {
  nodeType: "set_sheep_speed";
  multiplier: number;
}

export interface DropItemNode extends NodeBase {
  nodeType: "drop_item";
  item: "GOLD_INGOT";
  quantity: number;
}

export type StatementNode =
  | ExplodeAtHitNode
  | BouncePlayerNode
  | IfOnMaterialNode
  | SetSheepColorNode
  | SetSheepSpeedNode
  | DropItemNode;

export interface EventNode extends NodeBase {
  nodeType: EventType;
  body: StatementNode[];
}

export interface ScriptNode extends NodeBase {
  nodeType: "script";
  scriptKind: ScriptKind;
  displayName: "Player" | "Game" | "Sheep";
  body: EventNode[];
}

export interface ProgramV1 {
  schemaVersion: typeof PROGRAM_SCHEMA_VERSION;
  programId: string;
  projectId: "sheep-city";
  scripts: ScriptNode[];
}

export type Program = ProgramV1;

export interface LegacyProgramV0 {
  schemaVersion: 0;
  id: string;
  project: "sheep-city";
  areas: {
    Player?: EventNode[] | undefined;
    Game?: EventNode[] | undefined;
    Sheep?: EventNode[] | undefined;
  };
}

export type ProgramInput = Program | LegacyProgramV0;

export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  path?: string;
  suggestion?: string;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
}
