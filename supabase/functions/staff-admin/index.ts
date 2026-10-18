// staff-admin: superadmin-only user management (create user, reset password, activate/deactivate, set roles, list).
// Why an Edge Function: creating users / changing passwords needs the service-role key, which must never reach the browser.
// Security model:
//   1. verify_jwt is OFF on purpose (same reason as invite-rep): the browser CORS preflight (OPTIONS) carries no token
//      and the platform would reject it with 401 before reaching this code.
//   2. This code verifies the token itself (auth.getUser) AND checks the caller is an ACTIVE superadmin in public.user_roles.
//   3. It only ever touches accounts that exist in public.staff_profiles (never customers / other auth users).
// Secrets (SUPABASE_SERVICE_ROLE_KEY) are injected by Supabase at runtime; nothing is hardcoded here.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Staff who log in with a username get a synthetic auth email: <username>@staff.alaslsolar.com
const EMAIL_DOMAIN = "staff.alaslsolar.com";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = "876000h";
// Legacy bridge: today's RLS (is_rep()) reads public.reps, so rep-like roles need a reps row until policies migrate.
const REP_ROLES = new Set(["sales_rep", "sales_manager"]);

const ALLOWED_ORIGINS = new Set([
  "https://alaslsolar.com",
  "https://www.alaslsolar.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://alaslsolar.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function checkPassword(pw: unknown, username?: string | null): string {
  if (typeof pw !== "string") throw new HttpError(400, "password_required");
  if (pw.length < 10) throw new HttpError(400, "password_too_short_min_10");
  if (new TextEncoder().encode(pw).length > 72) throw new HttpError(400, "password_too_long_max_72_bytes");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new HttpError(400, "password_needs_letter_and_digit");
  if (username && pw.toLowerCase().includes(username)) throw new HttpError(400, "password_contains_username");
  return pw;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "missing_token");

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: whoErr } = await callerClient.auth.getUser();
    if (whoErr || !who?.user) throw new HttpError(401, "invalid_token");
    const caller = who.user;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Caller must be an ACTIVE superadmin (checked server-side, never from a client flag).
    const { data: sa, error: saErr } = await admin
      .from("user_roles")
      .select("user_id, staff_profiles!inner(active)")
      .eq("user_id", caller.id)
      .eq("role_key", "superadmin")
      .eq("staff_profiles.active", true)
      .limit(1);
    if (saErr) throw new Error("superadmin_check_failed");
    if (!sa || sa.length === 0) throw new HttpError(403, "forbidden");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "invalid_json");
    }
    const action = body.action;

    const audit = async (act: string, target: string | null, details: Record<string, unknown>) => {
      const { error } = await admin.from("audit_log").insert({
        actor_id: caller.id,
        action: act,
        table_name: "staff",
        record_key: target,
        new_data: details, // never put passwords here
      });
      if (error) console.error("audit_insert_failed", error.message);
    };

    const loadRoleKeys = async (): Promise<Set<string>> => {
      const { data, error } = await admin.from("roles").select("key");
      if (error) throw new Error("roles_load_failed");
      return new Set((data ?? []).map((r: { key: string }) => r.key));
    };

    const parseRoles = async (v: unknown): Promise<string[]> => {
      if (!Array.isArray(v) || v.length === 0 || v.length > 8) throw new HttpError(400, "roles_required");
      const allowed = await loadRoleKeys();
      const roles = [...new Set(v.map(String))];
      for (const r of roles) if (!allowed.has(r)) throw new HttpError(400, `unknown_role:${r}`);
      return roles;
    };

    const requireStaffTarget = async (id: unknown) => {
      const uid = str(id, 64);
      if (!uid) throw new HttpError(400, "user_id_required");
      const { data, error } = await admin
        .from("staff_profiles")
        .select("id, email, username, display_name, active")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw new Error("target_load_failed");
      if (!data) throw new HttpError(404, "staff_user_not_found");
      return data as { id: string; email: string; username: string | null; display_name: string | null; active: boolean };
    };

    // Keeps legacy public.reps in step (is_rep() still reads it). The UPDATE goes through the caller's JWT because
    // trg_reps_protect_sensitive_columns silently reverts changes unless is_admin() is true.
    const syncLegacyReps = async (
      t: { id: string; email: string; display_name: string | null },
      roles: string[],
      active: boolean,
      flags?: { offgrid?: boolean; products?: boolean; crm?: boolean },
    ): Promise<boolean> => {
      const needs = roles.some((r) => REP_ROLES.has(r));
      const { data: row, error } = await admin.from("reps").select("id, active").eq("id", t.id).maybeSingle();
      if (error) return false;
      if (needs && !row) {
        const { error: insErr } = await admin.from("reps").insert({
          id: t.id,
          email: t.email,
          display_name: t.display_name ?? t.email.split("@")[0],
          active,
          can_access_offgrid: flags?.offgrid ?? true,
          can_access_products: flags?.products ?? true,
          can_access_crm: flags?.crm ?? true,
        });
        return !insErr;
      }
      if (row) {
        const want = needs && active;
        if (row.active !== want) {
          await callerClient.from("reps").update({ active: want }).eq("id", t.id);
          const { data: after } = await admin.from("reps").select("active").eq("id", t.id).maybeSingle();
          return after?.active === want;
        }
      }
      return true;
    };

    switch (action) {
      case "list_users": {
        const [profiles, userRoles, authList] = await Promise.all([
          admin.from("staff_profiles").select("id, email, username, display_name, active, created_at").order("created_at"),
          admin.from("user_roles").select("user_id, role_key"),
          admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        ]);
        if (profiles.error || userRoles.error || authList.error) throw new Error("list_failed");
        const authMap = new Map(authList.data.users.map((u) => [u.id, u]));
        const users = (profiles.data ?? []).map((p) => {
          const a = authMap.get(p.id);
          const bannedUntil = a && (a as { banned_until?: string | null }).banned_until;
          return {
            ...p,
            roles: (userRoles.data ?? []).filter((r) => r.user_id === p.id).map((r) => r.role_key).sort(),
            last_sign_in_at: a?.last_sign_in_at ?? null,
            banned: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
          };
        });
        return json(req, 200, { ok: true, users });
      }

      case "create_user": {
        const username = body.username ? str(body.username, 32)?.toLowerCase() ?? null : null;
        const emailIn = body.email ? str(body.email, 254)?.toLowerCase() ?? null : null;
        if (!username && !emailIn) throw new HttpError(400, "username_or_email_required");
        if (username && !USERNAME_RE.test(username)) throw new HttpError(400, "invalid_username_format");
        if (emailIn && !EMAIL_RE.test(emailIn)) throw new HttpError(400, "invalid_email_format");
        const authEmail = emailIn ?? `${username}@${EMAIL_DOMAIN}`;
        const password = checkPassword(body.password, username);
        const displayName = str(body.display_name, 80);
        if (!displayName) throw new HttpError(400, "display_name_required");
        const roles = await parseRoles(body.roles);
        const flags = (body.flags ?? {}) as Record<string, unknown>;

        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName, staff: true },
        });
        if (cErr || !created?.user) {
          if (cErr && /already|registered|exists/i.test(cErr.message)) throw new HttpError(409, "user_exists");
          throw new HttpError(400, "create_failed");
        }
        const uid = created.user.id;
        const rollback = async () => {
          await admin.from("user_roles").delete().eq("user_id", uid);
          await admin.from("staff_profiles").delete().eq("id", uid);
          await admin.from("reps").delete().eq("id", uid);
          await admin.auth.admin.deleteUser(uid);
        };

        const { error: pErr } = await admin.from("staff_profiles").insert({
          id: uid, email: authEmail, username, display_name: displayName, active: true,
        });
        if (pErr) {
          await rollback();
          throw new HttpError(pErr.code === "23505" ? 409 : 400, pErr.code === "23505" ? "username_taken" : "profile_failed");
        }
        const { error: rErr } = await admin.from("user_roles").insert(
          roles.map((r) => ({ user_id: uid, role_key: r, granted_by: caller.id })),
        );
        if (rErr) {
          await rollback();
          throw new HttpError(400, "roles_failed");
        }
        const synced = await syncLegacyReps(
          { id: uid, email: authEmail, display_name: displayName },
          roles,
          true,
          { offgrid: flags.offgrid as boolean | undefined, products: flags.products as boolean | undefined, crm: flags.crm as boolean | undefined },
        );
        await audit("create_user", uid, { username, email: authEmail, roles });
        return json(req, 200, { ok: true, user_id: uid, login: username ?? authEmail, legacy_reps_synced: synced });
      }

      case "set_password": {
        const t = await requireStaffTarget(body.user_id);
        const password = checkPassword(body.password, t.username);
        const { error } = await admin.auth.admin.updateUserById(t.id, { password });
        if (error) throw new HttpError(400, "password_update_failed");
        await audit("set_password", t.id, {});
        return json(req, 200, { ok: true });
      }

      case "set_active": {
        const t = await requireStaffTarget(body.user_id);
        if (typeof body.active !== "boolean") throw new HttpError(400, "active_boolean_required");
        const active = body.active;
        if (!active && t.id === caller.id) throw new HttpError(400, "cannot_deactivate_self");
        // DB guard trigger refuses to deactivate the last active superadmin; do this first so nothing else changes on failure.
        const { error: uErr } = await admin.from("staff_profiles").update({ active }).eq("id", t.id);
        if (uErr) throw new HttpError(400, uErr.message.includes("last active superadmin") ? "last_superadmin" : "update_failed");
        // Ban blocks new sign-ins and token refresh immediately; an already-issued access token lives until it expires (<= 1h by default).
        const { error: bErr } = await admin.auth.admin.updateUserById(t.id, { ban_duration: active ? "none" : BAN_FOREVER });
        if (bErr) throw new HttpError(500, "ban_update_failed");
        const { data: rs } = await admin.from("user_roles").select("role_key").eq("user_id", t.id);
        const synced = await syncLegacyReps(t, (rs ?? []).map((r) => r.role_key), active);
        await audit("set_active", t.id, { active });
        return json(req, 200, { ok: true, legacy_reps_synced: synced });
      }

      case "set_roles": {
        const t = await requireStaffTarget(body.user_id);
        const roles = await parseRoles(body.roles);
        if (t.id === caller.id && !roles.includes("superadmin")) throw new HttpError(400, "cannot_remove_own_superadmin");
        const { data: cur, error: cErr } = await admin.from("user_roles").select("role_key").eq("user_id", t.id);
        if (cErr) throw new Error("roles_load_failed");
        const have = new Set((cur ?? []).map((r) => r.role_key));
        const toAdd = roles.filter((r) => !have.has(r));
        const toRemove = [...have].filter((r) => !roles.includes(r));
        if (toAdd.length) {
          const { error } = await admin.from("user_roles").insert(
            toAdd.map((r) => ({ user_id: t.id, role_key: r, granted_by: caller.id })),
          );
          if (error) throw new HttpError(400, "roles_failed");
        }
        if (toRemove.length) {
          const { error } = await admin.from("user_roles").delete().eq("user_id", t.id).in("role_key", toRemove);
          if (error) throw new HttpError(400, error.message.includes("last active superadmin") ? "last_superadmin" : "roles_failed");
        }
        const synced = await syncLegacyReps(t, roles, t.active);
        await audit("set_roles", t.id, { added: toAdd, removed: toRemove });
        return json(req, 200, { ok: true, legacy_reps_synced: synced });
      }

      default:
        throw new HttpError(400, "unknown_action");
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, e.status, { error: e.message });
    console.error("staff-admin unexpected error:", e instanceof Error ? e.message : "unknown");
    return json(req, 500, { error: "internal_error" });
  }
});
