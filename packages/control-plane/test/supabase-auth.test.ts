import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseInstructorAuthAdmin, validateSupabaseAdminConfiguration } from "../src/index.js";

describe("Supabase instructor auth adapter", () => {
  it("creates instructors only through the server-side admin API", async () => {
    const calls: unknown[] = [];
    const client = {
      auth: {
        admin: {
          createUser(input: unknown) {
            calls.push(input);
            return Promise.resolve({ data: { user: { id: "auth-user-1" } }, error: null });
          },
        },
      },
    } as unknown as SupabaseClient;
    const adapter = new SupabaseInstructorAuthAdmin(client);
    await expect(
      adapter.createInstructor({ email: "owner@example.test", password: "not-persisted" }),
    ).resolves.toEqual({ authUserId: "auth-user-1" });
    expect(calls).toEqual([
      { email: "owner@example.test", password: "not-persisted", email_confirm: true },
    ]);
  });

  it("rejects unsafe provider configuration before a network client is created", () => {
    expect(() => validateSupabaseAdminConfiguration("http://example.test", "short")).toThrow(
      /HTTPS/,
    );
    expect(() => validateSupabaseAdminConfiguration("https://example.test", "short")).toThrow(
      /credential is missing/,
    );
  });
});
