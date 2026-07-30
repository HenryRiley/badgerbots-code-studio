import {
  createJoinCode,
  deriveJoinCode,
  hmacHex,
  nativeHostOnboardingActionAllowed,
  sheepCityStarterProgram,
  validateCamperName,
  validateClassroomProgram,
  validateMinecraftUsername,
  validateStableDevicePublicId,
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

Deno.test("session join codes are stable, readable, and distinct without database plaintext", async () => {
  const secret = "test-only-credential-pepper-longer-than-thirty-two";
  const first = await deriveJoinCode(
    secret,
    "11111111-1111-4111-8111-111111111111",
  );
  const again = await deriveJoinCode(
    secret,
    "11111111-1111-4111-8111-111111111111",
  );
  const second = await deriveJoinCode(
    secret,
    "22222222-2222-4222-8222-222222222222",
  );
  assertEquals(first, again);
  assertEquals(first === second, false);
  assertEquals(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(first), true);
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

Deno.test("native Host onboarding is restricted to authenticated setup actions", () => {
  assertEquals(nativeHostOnboardingActionAllowed("profile"), true);
  assertEquals(nativeHostOnboardingActionAllowed("pair_host"), true);
  assertEquals(nativeHostOnboardingActionAllowed("join"), false);
  assertEquals(nativeHostOnboardingActionAllowed("queue_runtime"), false);
  assertEquals(nativeHostOnboardingActionAllowed("host_poll"), false);
});

Deno.test("device and Minecraft player identifiers are strict but rename-safe", () => {
  assertEquals(
    validateStableDevicePublicId("A9E5F7D1-CA6D-4B52-8E13-321963E81A52"),
    "a9e5f7d1-ca6d-4b52-8e13-321963e81a52",
  );
  assertEquals(validateMinecraftUsername("Camper_17"), "Camper_17");
  assertThrows(() => validateStableDevicePublicId("../shared-device"));
  assertThrows(() => validateMinecraftUsername("name with spaces"));
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
