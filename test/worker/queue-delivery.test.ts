import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { DeliveryService } from "../../ts/notifications/delivery-service";

async function seedDeliveryData() {
  // User
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Test', 'u1@test.com', 1, datetime('now'), datetime('now'))`).run();
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at) VALUES ('u1', 'user', 'active', 5, datetime('now'), datetime('now'), datetime('now'))`).run();
  // Rule
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'u1', 'Rule 1', 'usthing', 0, 0, '[]', 1, 3, 1, datetime('now'), datetime('now'))`).run();
  // Channel (encrypted with a dummy value)
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO notification_channel (id, user_id, provider, encrypted_config, destination_mask, config_fingerprint, verified_at, enabled, created_at, updated_at) VALUES ('ch1', 'u1', 'pushdeer', 'v1.v1.aaaa.bbbb', 'PDU1****cret', 'fp1', datetime('now'), 1, datetime('now'), datetime('now'))`).run();
  // Match state
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO rule_match_state (fingerprint, rule_id, user_id, source, slot_date, start_time, end_time, availability_json, is_active, notification_count, first_seen_at, last_seen_at, last_sync_run_id) VALUES ('fp1', 'r1', 'u1', 'usthing', '2026-06-10', '18:00', '19:00', '[]', 1, 0, datetime('now'), datetime('now'), 'sync-1')`).run();
  // Outbox
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO notification_outbox (id, user_id, channel_id, sync_run_id, payload_json, match_fingerprints_json, status, created_at) VALUES ('ob1', 'u1', 'ch1', 'sync-1', '{"text":"test"}', '["fp1"]', 'pending', datetime('now'))`).run();
}

describe("DeliveryService", () => {
  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM notification_outbox").run();
    await env.APP_DB.prepare("DELETE FROM rule_match_state").run();
    await env.APP_DB.prepare("DELETE FROM notification_channel").run();
    await env.APP_DB.prepare("DELETE FROM notification_rule").run();
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
    await seedDeliveryData();
  });

  it("claims a pending outbox atomically", async () => {
    const service = new DeliveryService(env.APP_DB);
    const claimed = await service.claimOutbox("ob1", new Date().toISOString());
    expect(claimed).toBeTruthy();
    expect(claimed!.status).toBe("sending");
  });

  it("marks outbox as sent on provider success", async () => {
    const service = new DeliveryService(env.APP_DB);
    await service.claimOutbox("ob1", new Date().toISOString());
    await service.markSent("ob1", ["fp1"], new Date().toISOString());

    const outbox = await env.APP_DB.prepare("SELECT status FROM notification_outbox WHERE id = 'ob1'").first<{ status: string }>();
    expect(outbox!.status).toBe("sent");

    const match = await env.APP_DB.prepare("SELECT notification_count FROM rule_match_state WHERE fingerprint = 'fp1'").first<{ notification_count: number }>();
    expect(match!.notification_count).toBe(1);
  });

  it("marks outbox as failed and does not increment counts", async () => {
    const service = new DeliveryService(env.APP_DB);
    await service.claimOutbox("ob1", new Date().toISOString());
    await service.markFailed("ob1", "invalid key");

    const outbox = await env.APP_DB.prepare("SELECT status, last_error FROM notification_outbox WHERE id = 'ob1'").first<{ status: string; last_error: string }>();
    expect(outbox!.status).toBe("failed");
    expect(outbox!.last_error).toBe("invalid key");

    const match = await env.APP_DB.prepare("SELECT notification_count FROM rule_match_state WHERE fingerprint = 'fp1'").first<{ notification_count: number }>();
    expect(match!.notification_count).toBe(0);
  });
});
