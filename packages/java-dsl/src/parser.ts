import {
  normalizeProgram,
  validateProgram,
  type Diagnostic,
  type EventNode,
  type Program,
  type ScriptNode,
  type StatementNode,
} from "@badgerbots/program-model";

type TokenKind =
  "identifier" | "number" | "symbol" | "node-id" | "expression-id" | "program-id" | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
}

export interface TextDiagnostic extends Diagnostic {
  line: number;
  column: number;
}

export type ParseResult =
  { ok: true; program: Program; diagnostics: [] } | { ok: false; diagnostics: TextDiagnostic[] };

class ParseFailure extends Error {
  constructor(readonly diagnostic: TextDiagnostic) {
    super(diagnostic.message);
  }
}

const forbiddenPatterns: { pattern: RegExp; label: string; suggestion: string }[] = [
  {
    pattern: /\bimport\b/,
    label: "imports",
    suggestion: "Use only the blocks and names available in BadgerBots text mode.",
  },
  {
    pattern: /\b(?:class|interface|enum|record)\b/,
    label: "custom classes",
    suggestion: "Put code inside the provided Player, Game, or Sheep scripts.",
  },
  {
    pattern: /\b(?:System|Runtime|ProcessBuilder)\b/,
    label: "system or process access",
    suggestion: "BadgerBots programs cannot run computer commands.",
  },
  {
    pattern: /\b(?:Thread|synchronized|native)\b/,
    label: "threads or native code",
    suggestion: "Use supported game events instead.",
  },
  {
    pattern: /\bjava\.(?:io|net|nio|lang\.reflect)\b|\breflect\b/,
    label: "file, network, or reflection access",
    suggestion: "Student programs can only affect their scoped Minecraft world.",
  },
  {
    pattern: /\b(?:for|while|do)\b/,
    label: "loops in this Sheep City checkpoint",
    suggestion: "This checkpoint supports only the displayed Sheep City event and action blocks.",
  },
  {
    pattern: /\bnew\s+[A-Za-z_$]/,
    label: "creating arbitrary objects",
    suggestion: "Use a supported BadgerBots action instead.",
  },
];

function locate(text: string, index: number) {
  const before = text.slice(0, index).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

function forbiddenDiagnostic(text: string): TextDiagnostic | undefined {
  for (const item of forbiddenPatterns) {
    const match = item.pattern.exec(text);
    if (!match || match.index === undefined) continue;
    return {
      code: "UNSUPPORTED_SYNTAX",
      severity: "error",
      message: `BadgerBots text mode does not allow ${item.label}.`,
      suggestion: item.suggestion,
      ...locate(text, match.index),
    };
  }
  return undefined;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const advance = (value: string) => {
    for (const character of value) {
      if (character === "\n") {
        line += 1;
        column = 1;
      } else column += 1;
    }
    index += value.length;
  };

  while (index < text.length) {
    const rest = text.slice(index);
    const whitespace = /^[\s]+/.exec(rest);
    if (whitespace) {
      advance(whitespace[0]);
      continue;
    }
    const metadata = /^\/\/\s*@(program-id|expression-id|id):\s*([a-z][a-z0-9-]{2,63})[^\n]*/.exec(
      rest,
    );
    if (metadata) {
      tokens.push({
        kind:
          metadata[1] === "program-id"
            ? "program-id"
            : metadata[1] === "expression-id"
              ? "expression-id"
              : "node-id",
        value: metadata[2] ?? "",
        line,
        column,
      });
      advance(metadata[0]);
      continue;
    }
    const comment = /^\/\/[^\n]*/.exec(rest);
    if (comment) {
      advance(comment[0]);
      continue;
    }
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rest);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0], line, column });
      advance(identifier[0]);
      continue;
    }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: number[0], line, column });
      advance(number[0]);
      continue;
    }
    if (rest.startsWith("==")) {
      tokens.push({ kind: "symbol", value: "==", line, column });
      advance("==");
      continue;
    }
    if ("{}();,.".includes(rest[0] ?? "")) {
      const value = rest[0] ?? "";
      tokens.push({ kind: "symbol", value, line, column });
      advance(value);
      continue;
    }
    throw new ParseFailure({
      code: "UNKNOWN_CHARACTER",
      severity: "error",
      message: `The character “${rest[0]}” is not part of BadgerBots text mode.`,
      suggestion: "Remove it or return to blocks to see the supported structure.",
      line,
      column,
    });
  }
  tokens.push({ kind: "eof", value: "", line, column });
  return tokens;
}

class Parser {
  private position = 0;
  private generatedId = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Program {
    const programId = this.takeMetadata("program-id") ?? "sheep-city-text";
    this.expectIdentifier("program");
    this.expectIdentifier("SheepCity");
    this.expectSymbol("{");
    const scripts: ScriptNode[] = [];
    while (!this.matches("symbol", "}")) scripts.push(this.parseScript());
    this.expectSymbol("}");
    this.expect("eof");
    return normalizeProgram({ schemaVersion: 2, programId, projectId: "sheep-city", scripts });
  }

  private parseScript(): ScriptNode {
    const id = this.takeNodeId("script");
    this.expectIdentifier("script");
    const name = this.expect("identifier");
    const metadata = {
      Player: { scriptKind: "player", displayName: "Player" },
      Game: { scriptKind: "game", displayName: "Game" },
      Sheep: { scriptKind: "sheep", displayName: "Sheep" },
    } as const;
    const script = metadata[name.value as keyof typeof metadata];
    if (!script)
      this.fail(
        name,
        "UNKNOWN_SCRIPT",
        `“${name.value}” is not a Sheep City script.`,
        "Use Player, Game, or Sheep.",
      );
    this.expectSymbol("{");
    const body: EventNode[] = [];
    while (!this.matches("symbol", "}")) body.push(this.parseEvent());
    this.expectSymbol("}");
    return { id, nodeType: "script", ...script, body };
  }

  private parseEvent(): EventNode {
    const id = this.takeNodeId("event");
    this.expectIdentifier("void");
    const name = this.expect("identifier");
    const eventTypes = {
      onProjectileHit: "projectile_hit_event",
      onPlayerMove: "player_move_event",
      onSheepSpawn: "sheep_spawn_event",
      onSheepDeath: "sheep_death_event",
    } as const;
    const nodeType = eventTypes[name.value as keyof typeof eventTypes];
    if (!nodeType)
      this.fail(
        name,
        "UNKNOWN_EVENT",
        `“${name.value}” is not a supported Sheep City event.`,
        "Choose onProjectileHit, onPlayerMove, onSheepSpawn, or onSheepDeath.",
      );
    this.expectSymbol("(");
    this.expectSymbol(")");
    this.expectSymbol("{");
    const body = this.parseStatements();
    this.expectSymbol("}");
    return { id, nodeType, body };
  }

  private parseStatements(): StatementNode[] {
    const body: StatementNode[] = [];
    while (!this.matches("symbol", "}")) body.push(this.parseStatement());
    return body;
  }

  private parseStatement(): StatementNode {
    const id = this.takeNodeId("block");
    const expressionIds: string[] = [];
    while (this.matches("expression-id")) {
      expressionIds.push(this.tokens[this.position++]?.value ?? "");
    }
    const first = this.expect("identifier");
    if (first.value === "explodeAtHit") {
      this.expectSymbol("(");
      const power = this.expectNumber();
      this.expectSymbol(")");
      this.expectSymbol(";");
      return { id, nodeType: "explode_at_hit", power };
    }
    if (first.value === "if") {
      const [conditionId, leftId, rightId] = expressionIds;
      this.expectSymbol("(");
      this.expectIdentifier("getMaterialUnderPlayer");
      this.expectSymbol("(");
      this.expectSymbol(")");
      this.expectSymbol("==");
      this.expectIdentifier("Material");
      this.expectSymbol(".");
      this.expectIdentifier("GOLD_BLOCK");
      this.expectSymbol(")");
      this.expectSymbol("{");
      const then = this.parseStatements();
      this.expectSymbol("}");
      return {
        id,
        nodeType: "if_then",
        condition: {
          id: conditionId ?? this.nextGeneratedId("equals"),
          nodeType: "equals",
          left: {
            id: leftId ?? this.nextGeneratedId("material-under"),
            nodeType: "get_material_under_player",
          },
          right: {
            id: rightId ?? this.nextGeneratedId("gold-block"),
            nodeType: "material_literal",
            material: "GOLD_BLOCK",
          },
        },
        then,
      };
    }
    if (expressionIds.length > 0) {
      this.fail(
        first,
        "MISPLACED_EXPRESSION_ID",
        "Expression IDs may only appear before a supported if condition.",
        "Return to blocks to regenerate the supported text structure.",
      );
    }
    if (first.value === "player") {
      this.expectSymbol(".");
      this.expectIdentifier("bounce");
      this.expectSymbol("(");
      const verticalVelocity = this.expectNumber();
      this.expectSymbol(")");
      this.expectSymbol(";");
      return { id, nodeType: "bounce_player", verticalVelocity };
    }
    if (first.value === "sheep") {
      this.expectSymbol(".");
      const method = this.expect("identifier");
      this.expectSymbol("(");
      if (method.value === "setColor") {
        this.expectIdentifier("DyeColor");
        this.expectSymbol(".");
        this.expectIdentifier("RED");
        this.expectSymbol(")");
        this.expectSymbol(";");
        return { id, nodeType: "set_sheep_color", color: "RED" };
      }
      if (method.value === "setSpeedMultiplier") {
        const multiplier = this.expectNumber();
        this.expectSymbol(")");
        this.expectSymbol(";");
        return { id, nodeType: "set_sheep_speed", multiplier };
      }
      this.fail(
        method,
        "UNKNOWN_SHEEP_ACTION",
        `Sheep does not have the supported action “${method.value}”.`,
        "Use setColor or setSpeedMultiplier.",
      );
    }
    if (first.value === "dropItem") {
      this.expectSymbol("(");
      this.expectIdentifier("Material");
      this.expectSymbol(".");
      this.expectIdentifier("GOLD_INGOT");
      this.expectSymbol(",");
      const quantity = this.expectNumber();
      this.expectSymbol(")");
      this.expectSymbol(";");
      return { id, nodeType: "drop_item", item: "GOLD_INGOT", quantity };
    }
    this.fail(
      first,
      "UNKNOWN_ACTION",
      `“${first.value}” is not a supported Sheep City action.`,
      "Use a block from the searchable library, then switch back to text mode.",
    );
  }

  private takeNodeId(prefix: string): string {
    return this.takeMetadata("node-id") ?? this.nextGeneratedId(prefix);
  }

  private nextGeneratedId(prefix: string): string {
    return `text-${prefix}-${++this.generatedId}`;
  }

  private takeMetadata(kind: "node-id" | "program-id"): string | undefined {
    if (!this.matches(kind)) return undefined;
    return this.tokens[this.position++]?.value;
  }

  private expectNumber(): number {
    const token = this.expect("number");
    const value = Number(token.value);
    if (!Number.isFinite(value))
      this.fail(
        token,
        "INVALID_NUMBER",
        "This number is not finite.",
        "Use a small positive number shown by the matching block.",
      );
    return value;
  }

  private expectIdentifier(value: string): Token {
    const token = this.expect("identifier");
    if (token.value !== value)
      this.fail(
        token,
        "EXPECTED_WORD",
        `Expected “${value}” but found “${token.value}”.`,
        "Return to blocks to regenerate supported text if you are stuck.",
      );
    return token;
  }

  private expectSymbol(value: string): Token {
    const token = this.expect("symbol");
    if (token.value !== value)
      this.fail(
        token,
        "EXPECTED_SYMBOL",
        `Expected “${value}” but found “${token.value}”.`,
        "Check the nearby parentheses, braces, commas, and semicolons.",
      );
    return token;
  }

  private expect(kind: TokenKind): Token {
    const token = this.tokens[this.position];
    if (!token || token.kind !== kind) {
      const actual = token ?? this.tokens.at(-1) ?? { kind: "eof", value: "", line: 1, column: 1 };
      this.fail(
        actual,
        "EXPECTED_TOKEN",
        `Expected ${kind}, but found ${actual.value || "the end of the program"}.`,
        "Return to blocks to regenerate valid text if you are stuck.",
      );
    }
    this.position += 1;
    return token;
  }

  private matches(kind: TokenKind, value?: string): boolean {
    const token = this.tokens[this.position];
    return token?.kind === kind && (value === undefined || token.value === value);
  }

  private fail(token: Token, code: string, message: string, suggestion: string): never {
    throw new ParseFailure({
      code,
      severity: "error",
      message,
      suggestion,
      line: token.line,
      column: token.column,
    });
  }
}

export function parseProgram(text: string): ParseResult {
  const forbidden = forbiddenDiagnostic(text);
  if (forbidden) return { ok: false, diagnostics: [forbidden] };
  try {
    const program = new Parser(tokenize(text)).parse();
    const validation = validateProgram(program);
    if (!validation.ok) {
      return {
        ok: false,
        diagnostics: validation.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          line: 1,
          column: 1,
        })),
      };
    }
    return { ok: true, program, diagnostics: [] };
  } catch (caught) {
    if (caught instanceof ParseFailure) return { ok: false, diagnostics: [caught.diagnostic] };
    throw caught;
  }
}
