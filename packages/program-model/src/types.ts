export const PROGRAM_SCHEMA_VERSION = 2 as const;

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

export interface GetMaterialUnderPlayerNode extends NodeBase {
  nodeType: "get_material_under_player";
}

export interface MaterialLiteralNode extends NodeBase {
  nodeType: "material_literal";
  material: "GOLD_BLOCK";
}

export type MaterialExpressionNode = GetMaterialUnderPlayerNode | MaterialLiteralNode;

export interface EqualsNode extends NodeBase {
  nodeType: "equals";
  left: MaterialExpressionNode;
  right: MaterialExpressionNode;
}

export type BooleanExpressionNode = EqualsNode;

export interface IfThenNode extends NodeBase {
  nodeType: "if_then";
  condition: BooleanExpressionNode;
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
  | IfThenNode
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

export interface ProgramV2 {
  schemaVersion: typeof PROGRAM_SCHEMA_VERSION;
  programId: string;
  projectId: "sheep-city";
  scripts: ScriptNode[];
}

export type Program = ProgramV2;

export interface LegacyIfOnMaterialNode extends NodeBase {
  nodeType: "if_on_material";
  material: "GOLD_BLOCK";
  then: LegacyStatementV1[];
}

export type LegacyStatementV1 =
  | ExplodeAtHitNode
  | BouncePlayerNode
  | LegacyIfOnMaterialNode
  | SetSheepColorNode
  | SetSheepSpeedNode
  | DropItemNode;

export interface LegacyEventV1 extends NodeBase {
  nodeType: EventType;
  body: LegacyStatementV1[];
}

export interface LegacyScriptV1 extends NodeBase {
  nodeType: "script";
  scriptKind: ScriptKind;
  displayName: "Player" | "Game" | "Sheep";
  body: LegacyEventV1[];
}

export interface ProgramV1 {
  schemaVersion: 1;
  programId: string;
  projectId: "sheep-city";
  scripts: LegacyScriptV1[];
}

export interface LegacyProgramV0 {
  schemaVersion: 0;
  id: string;
  project: "sheep-city";
  areas: {
    Player?: LegacyEventV1[] | undefined;
    Game?: LegacyEventV1[] | undefined;
    Sheep?: LegacyEventV1[] | undefined;
  };
}

export type ProgramInput = Program | ProgramV1 | LegacyProgramV0;

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
