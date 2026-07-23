import type { SupabaseClient } from "@supabase/supabase-js";
import type { InstructorAuthAdmin } from "./types.js";

export class SupabaseInstructorAuthAdmin implements InstructorAuthAdmin {
  constructor(private readonly client: Pick<SupabaseClient, "auth">) {}

  async createInstructor(input: { email: string; password: string }) {
    const { data, error } = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Instructor identity could not be created.");
    return { authUserId: data.user.id };
  }
}

export function validateSupabaseAdminConfiguration(url: string, serviceRoleKey: string): void {
  if (!url.startsWith("https://") && !url.startsWith("http://127.0.0.1"))
    throw new Error("Supabase URL must use HTTPS except for local development.");
  if (serviceRoleKey.length < 20) throw new Error("Supabase administrative credential is missing.");
}
