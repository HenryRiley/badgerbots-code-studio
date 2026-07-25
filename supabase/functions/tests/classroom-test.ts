import {
  createJoinCode,
  hmacHex,
  sheepCityStarterProgram,
  validateCamperName,
  validateClassroomProgram,
} from "../_shared/classroom.ts";

Deno.test("classroom join codes omit ambiguous characters and normalize minimal names", () => {
  const code = createJoinCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
  assertEquals(code.length, 8);
  assertEquals(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code), true);
  assertEquals(validateCamperName(" Ada ", "l"), {
    firstName: "Ada",
    lastInitial: "L",
  });
});

Deno.test("credential digests are deterministic without retaining the raw value", async () => {
  const secret = "test-only-credential-pepper-longer-than-thirty-two";
  const first = await hmacHex(secret, "ABCD2345");
  const second = await hmacHex(secret, "ABCD2345");
  assertEquals(first, second);
  assertEquals(first.length, 64);
  assertEquals(first.includes("ABCD2345"), false);
  await assertRejects(() => hmacHex("short", "ABCD2345"));
});

Deno.test("edge validation accepts the canonical starter and rejects oversized or unsafe shapes", () => {
  assertEquals(
    validateClassroomProgram(sheepCityStarterProgram),
    sheepCityStarterProgram,
  );
  assertThrows(() =>
    validateClassroomProgram({
      ...sheepCityStarterProgram,
      scripts: [
        ...sheepCityStarterProgram.scripts,
        {
          id: "script-danger",
          nodeType: "script",
          scriptKind: "game",
          displayName: "Game",
          body: [{ id: "event-danger", nodeType: "shell_command", body: [] }],
        },
      ],
    })
  );
  const invalid = structuredClone(sheepCityStarterProgram) as unknown as {
    scripts: { body: { body: unknown[] }[] }[];
  };
  invalid.scripts[0]!.body[0]!.body.push({
    id: "explode-unsafe",
    nodeType: "explode_at_hit",
    power: 100,
  });
  assertThrows(() => validateClassroomProgram(invalid));
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}

function assertThrows(work: () => unknown): void {
  try {
    work();
  } catch {
    return;
  }
  throw new Error("Expected function to throw.");
}

async function assertRejects(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error("Expected promise to reject.");
}
