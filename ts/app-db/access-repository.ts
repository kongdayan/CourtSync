import type { D1Database } from "@cloudflare/workers-types";
import type { UserAccess, UserRole, UserStatus } from "./types";

export interface EnsureForLoginInput {
  userId: string;
  email: string;
  adminEmails: Set<string>;
  defaultRuleLimit: number;
  adminRuleLimit: number;
  now: string;
}

export class AccessRepository {
  constructor(private db: D1Database) {}

  async ensureForLogin(input: EnsureForLoginInput): Promise<UserAccess> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const isAdmin = input.adminEmails.has(normalizedEmail);
    const role: UserRole = isAdmin ? "admin" : "user";
    const status: UserStatus = isAdmin ? "active" : "pending";
    const ruleLimit = isAdmin ? input.adminRuleLimit : input.defaultRuleLimit;

    // Use INSERT ... ON CONFLICT DO UPDATE to handle upsert safely
    await this.db.prepare(`
      INSERT INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        last_login_at = excluded.last_login_at,
        role = CASE WHEN excluded.role = 'admin' THEN 'admin' ELSE role END,
        status = CASE WHEN excluded.status = 'active' THEN 'active' ELSE status END,
        rule_limit = CASE WHEN excluded.role = 'admin' THEN excluded.rule_limit ELSE rule_limit END,
        status_changed_at = CASE WHEN (excluded.role = 'admin' AND role <> excluded.role) OR (excluded.status = 'active' AND status <> excluded.status) THEN excluded.status_changed_at ELSE status_changed_at END
    `).bind(
      input.userId, role, status, ruleLimit,
      input.now, input.now, input.now
    ).run();

    const row = await this.db.prepare(
      "SELECT user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at, status_changed_by FROM user_access WHERE user_id = ?"
    ).bind(input.userId).first<{
      user_id: string;
      role: UserRole;
      status: UserStatus;
      rule_limit: number;
      first_login_at: string;
      last_login_at: string;
      status_changed_at: string;
      status_changed_by: string | null;
    }>();

    return {
      userId: row!.user_id,
      role: row!.role,
      status: row!.status,
      ruleLimit: row!.rule_limit,
      firstLoginAt: row!.first_login_at,
      lastLoginAt: row!.last_login_at,
      statusChangedAt: row!.status_changed_at,
      statusChangedBy: row!.status_changed_by ?? undefined,
    };
  }

  async getByUserId(userId: string): Promise<UserAccess | null> {
    const row = await this.db.prepare(
      "SELECT user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at, status_changed_by FROM user_access WHERE user_id = ?"
    ).bind(userId).first<{
      user_id: string;
      role: UserRole;
      status: UserStatus;
      rule_limit: number;
      first_login_at: string;
      last_login_at: string;
      status_changed_at: string;
      status_changed_by: string | null;
    }>();

    if (!row) return null;

    return {
      userId: row.user_id,
      role: row.role,
      status: row.status,
      ruleLimit: row.rule_limit,
      firstLoginAt: row.first_login_at,
      lastLoginAt: row.last_login_at,
      statusChangedAt: row.status_changed_at,
      statusChangedBy: row.status_changed_by ?? undefined,
    };
  }

  async disableUserAndDeleteSessions(userId: string, changedBy?: string): Promise<void> {
    const now = new Date().toISOString();
    const batch = [
      this.db.prepare(
        "UPDATE user_access SET status = 'disabled', status_changed_at = ?, status_changed_by = ? WHERE user_id = ?"
      ).bind(now, changedBy ?? null, userId),
      this.db.prepare(
        "DELETE FROM session WHERE userId = ?"
      ).bind(userId),
    ];
    await this.db.batch(batch);
  }
}
