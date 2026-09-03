import type { D1Database } from "@cloudflare/workers-types";
import type { CompiledRule } from "./schema";
import { RuleRepository } from "./repository";

export class RuleService {
  constructor(private repo: RuleRepository, private db: D1Database) {}

  async create(userId: string, rule: CompiledRule) {
    const row = await this.repo.create(userId, rule);
    if (!row) {
      // Check why: inactive or quota
      const access = await this.db.prepare("SELECT status, rule_limit FROM user_access WHERE user_id = ?").bind(userId).first<{ status: string; rule_limit: number }>();
      if (!access || access.status !== "active") {
        throw Object.assign(new Error("inactive_access"), { code: "inactive_access" });
      }
      const count = await this.repo.countByUser(userId);
      if (count >= access.rule_limit) {
        throw Object.assign(new Error("rule_limit_reached"), { code: "rule_limit_reached" });
      }
      throw Object.assign(new Error("create_failed"), { code: "create_failed" });
    }
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      source: row.source,
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

  async update(userId: string, id: string, updates: Partial<CompiledRule>) {
    const existing = await this.repo.getById(id);
    if (!existing || existing.user_id !== userId) {
      throw Object.assign(new Error("rule_not_found"), { code: "rule_not_found" });
    }
    const row = await this.repo.update(id, updates);
    if (!row) throw Object.assign(new Error("update_failed"), { code: "update_failed" });
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      source: row.source,
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

  async delete(userId: string, id: string) {
    const existing = await this.repo.getById(id);
    if (!existing || existing.user_id !== userId) {
      throw Object.assign(new Error("rule_not_found"), { code: "rule_not_found" });
    }
    await this.repo.delete(id);
  }

  async listByUser(userId: string) {
    const rows = await this.repo.listByUser(userId);
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      source: row.source,
      weekdayMask: row.weekday_mask,
      timeslotMask: row.timeslot_mask,
      facilityIds: JSON.parse(row.facility_ids_json),
      minConsecutive: row.min_consecutive,
      pushLimit: row.push_limit,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getById(userId: string, id: string) {
    const existing = await this.repo.getById(id);
    if (!existing || existing.user_id !== userId) return null;
    return {
      id: existing.id,
      userId: existing.user_id,
      name: existing.name,
      source: existing.source,
      weekdayMask: existing.weekday_mask,
      timeslotMask: existing.timeslot_mask,
      facilityIds: JSON.parse(existing.facility_ids_json),
      minConsecutive: existing.min_consecutive,
      pushLimit: existing.push_limit,
      enabled: existing.enabled === 1,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }
}
