import type { D1Database } from "@cloudflare/workers-types";
import type { UserRole, UserStatus } from "./types";

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  image?: string;
  role: UserRole;
  status: UserStatus;
  ruleLimit: number;
  ruleCount: number;
  pushDeerConfigured: boolean;
  firstLoginAt: string;
  lastLoginAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: string;
  targetUserId: string;
  beforeJson: string;
  afterJson: string;
  requestId: string;
  createdAt: string;
}

export class AdminRepository {
  constructor(private db: D1Database) {}

  async listUsers(filters: {
    status?: UserStatus;
    search?: string;
    cursor?: string;
  }): Promise<AdminUserSummary[]> {
    let query = `
      SELECT u.id, u.email, u.name, u.image,
             ua.role, ua.status, ua.rule_limit as ruleLimit,
             ua.first_login_at as firstLoginAt, ua.last_login_at as lastLoginAt,
             (SELECT COUNT(*) FROM notification_rule nr WHERE nr.user_id = u.id) as ruleCount,
             (CASE WHEN EXISTS (SELECT 1 FROM notification_channel nc WHERE nc.user_id = u.id AND nc.provider = 'pushdeer') THEN 1 ELSE 0 END) as pushDeerConfigured
      FROM user u
      JOIN user_access ua ON ua.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.status) {
      query += " AND ua.status = ?";
      params.push(filters.status);
    }
    if (filters.search) {
      query += " AND (u.email LIKE ? OR u.name LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += " ORDER BY ua.last_login_at DESC LIMIT 100";

    const result = await this.db.prepare(query).bind(...params).all<{
      id: string; email: string; name: string; image: string | null;
      role: UserRole; status: UserStatus; ruleLimit: number;
      firstLoginAt: string; lastLoginAt: string;
      ruleCount: number; pushDeerConfigured: number;
    }>();

    return result.results.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      image: r.image ?? undefined,
      role: r.role,
      status: r.status,
      ruleLimit: r.ruleLimit,
      ruleCount: r.ruleCount,
      pushDeerConfigured: r.pushDeerConfigured === 1,
      firstLoginAt: r.firstLoginAt,
      lastLoginAt: r.lastLoginAt,
    }));
  }

  async updateAccess(
    actorUserId: string,
    targetUserId: string,
    params: {
      status?: UserStatus;
      role?: UserRole;
      ruleLimit?: number;
      requestId: string;
      now: string;
    }
  ): Promise<{ status: UserStatus; role: UserRole; ruleLimit: number; statusChangedBy?: string }> {
    // Read current state
    const before = await this.db.prepare(
      "SELECT * FROM user_access WHERE user_id = ?"
    ).bind(targetUserId).first<{
      user_id: string; role: string; status: string; rule_limit: number;
    }>();
    if (!before) throw new Error("user not found");

    const beforeJson = JSON.stringify({ role: before.role, status: before.status, ruleLimit: before.rule_limit });

    // Determine new values
    const newStatus = params.status ?? before.status;
    const newRole = params.role ?? before.role;
    const newRuleLimit = params.ruleLimit ?? before.rule_limit;

    // Batch: update access, delete sessions if disabling, insert audit
    const batch: any[] = [];

    // Update access
    batch.push(this.db.prepare(`
      UPDATE user_access SET
        status = ?, role = ?, rule_limit = ?,
        status_changed_at = ?, status_changed_by = ?
      WHERE user_id = ?
    `).bind(newStatus, newRole, newRuleLimit, params.now, actorUserId, targetUserId));

    // Delete sessions if disabling
    if (newStatus === "disabled") {
      batch.push(this.db.prepare("DELETE FROM session WHERE userId = ?").bind(targetUserId));
    }

    // Insert audit
    const afterJson = JSON.stringify({ role: newRole, status: newStatus, ruleLimit: newRuleLimit });
    batch.push(this.db.prepare(`
      INSERT INTO admin_audit_log (id, actor_user_id, action, target_user_id, before_json, after_json, request_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), actorUserId, newStatus === "active" && before.status === "pending" ? "approve_user" : "update_access", targetUserId, beforeJson, afterJson, params.requestId, params.now));

    await this.db.batch(batch);

    return { status: newStatus as UserStatus, role: newRole as UserRole, ruleLimit: newRuleLimit, statusChangedBy: actorUserId };
  }

  async getAuditLogs(targetUserId: string): Promise<AuditLogEntry[]> {
    const result = await this.db.prepare(
      "SELECT * FROM admin_audit_log WHERE target_user_id = ? ORDER BY created_at DESC LIMIT 100"
    ).bind(targetUserId).all<{
      id: string; actor_user_id: string; action: string; target_user_id: string;
      before_json: string; after_json: string; request_id: string; created_at: string;
    }>();
    return result.results.map(r => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      action: r.action,
      targetUserId: r.target_user_id,
      beforeJson: r.before_json,
      afterJson: r.after_json,
      requestId: r.request_id,
      createdAt: r.created_at,
    }));
  }
}
