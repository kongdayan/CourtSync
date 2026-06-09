import type { D1Database } from "@cloudflare/workers-types";
import type { CompiledRule } from "./schema";

export interface RuleRow {
  id: string;
  user_id: string;
  name: string;
  source: string;
  weekday_mask: number;
  timeslot_mask: number;
  facility_ids_json: string;
  min_consecutive: number;
  push_limit: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: RuleRow): CompiledRule & { id: string; userId: string; createdAt: string; updatedAt: string } {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    source: row.source as "usthing" | "jiushi",
    weekdayMask: row.weekday_mask,
    timeslotMask: row.timeslot_mask,
    facilityIds: JSON.parse(row.facility_ids_json),
    minConsecutive: row.min_consecutive,
    pushLimit: row.push_limit,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RuleRepository {
  constructor(private db: D1Database) {}

  async create(userId: string, rule: CompiledRule): Promise<RuleRow | null> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = await this.db.prepare(`
      INSERT INTO notification_rule (
        id, user_id, name, source, weekday_mask, timeslot_mask,
        facility_ids_json, min_consecutive, push_limit, enabled,
        created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM user_access
        WHERE user_id = ? AND status = 'active'
          AND (SELECT COUNT(*) FROM notification_rule WHERE user_id = ?) < rule_limit
      )
      RETURNING *
    `).bind(
      id, userId, rule.name, rule.source, rule.weekdayMask, rule.timeslotMask,
      JSON.stringify(rule.facilityIds), rule.minConsecutive, rule.pushLimit,
      rule.enabled ? 1 : 0, now, now,
      userId, userId
    ).first<RuleRow>();

    return result ?? null;
  }

  async getById(id: string): Promise<RuleRow | null> {
    return this.db.prepare("SELECT * FROM notification_rule WHERE id = ?").bind(id).first<RuleRow>() ?? null;
  }

  async listByUser(userId: string): Promise<RuleRow[]> {
    const result = await this.db.prepare(
      "SELECT * FROM notification_rule WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(userId).all<RuleRow>();
    return result.results;
  }

  async countByUser(userId: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) as count FROM notification_rule WHERE user_id = ?"
    ).bind(userId).first<{ count: number }>();
    return row?.count ?? 0;
  }

  async update(id: string, updates: Partial<CompiledRule>): Promise<RuleRow | null> {
    const now = new Date().toISOString();
    const existing = await this.getById(id);
    if (!existing) return null;

    const name = updates.name ?? existing.name;
    const source = updates.source ?? existing.source;
    const weekdayMask = updates.weekdayMask ?? existing.weekday_mask;
    const timeslotMask = updates.timeslotMask ?? existing.timeslot_mask;
    const facilityIds = updates.facilityIds ?? JSON.parse(existing.facility_ids_json);
    const minConsecutive = updates.minConsecutive ?? existing.min_consecutive;
    const pushLimit = updates.pushLimit ?? existing.push_limit;
    const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;

    return this.db.prepare(`
      UPDATE notification_rule SET
        name = ?, source = ?, weekday_mask = ?, timeslot_mask = ?,
        facility_ids_json = ?, min_consecutive = ?, push_limit = ?, enabled = ?,
        updated_at = ?
      WHERE id = ?
      RETURNING *
    `).bind(name, source, weekdayMask, timeslotMask, JSON.stringify(facilityIds), minConsecutive, pushLimit, enabled, now, id).first<RuleRow>() ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM notification_rule WHERE id = ?").bind(id).run();
    return result.meta.changes > 0;
  }
}
