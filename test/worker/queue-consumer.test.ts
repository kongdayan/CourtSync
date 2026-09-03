import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleQueueBatch } from "../../ts/notifications/queue-consumer";
import { encryptChannelConfig } from "../../ts/notifications/crypto";

function makeKeyRingJson(): string {
  const key = new Uint8Array(32).fill(7);
  const b64 = btoa(String.fromCharCode(...key));
  return JSON.stringify({ active: "v1", keys: { v1: b64 } });
}

const KEY_RING_JSON = makeKeyRingJson();
const PUSH_KEY = "PDU-test-key";

interface FakeMessage {
  body: { outboxId: string };
  ack: () => void;
  retry: () => void;
  acked: boolean;
  retried: boolean;
}

function makeMessage(outboxId: string): FakeMessage {
  const msg: FakeMessage = {
    body: { outboxId },
    ack: () => {
      msg.acked = true;
    },
    retry: () => {
      msg.retried = true;
    },
    acked: false,
    retried: false,
  };
  return msg;
}

async function seedOutbox(status = "pending") {
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'T', 'u1@test.com', 1, datetime('now'), datetime('now'))"
  ).run();
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at) VALUES ('u1', 'user', 'active', 5, datetime('now'), datetime('now'), datetime('now'))"
  ).run();
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'u1', 'Rule 1', 'usthing', 0, 0, '[]', 1, 3, 1, datetime('now'), datetime('now'))"
  ).run();
  const encrypted = await encryptChannelConfig(JSON.parse(KEY_RING_JSON) as any, { pushKey: PUSH_KEY });
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO notification_channel (id, user_id, provider, encrypted_config, destination_mask, config_fingerprint, verified_at, enabled, created_at, updated_at) VALUES ('ch1', 'u1', 'pushdeer', ?, 'PDU-****', 'fp', datetime('now'), 1, datetime('now'), datetime('now'))"
  ).bind(encrypted).run();
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO rule_match_state (fingerprint, rule_id, user_id, source, slot_date, start_time, end_time, availability_json, is_active, notification_count, first_seen_at, last_seen_at, last_sync_run_id) VALUES ('fp1', 'r1', 'u1', 'usthing', '2026-09-10', '18:00', '19:00', '[]', 1, 0, datetime('now'), datetime('now'), 's1')"
  ).run();
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO notification_outbox (id, user_id, channel_id, sync_run_id, payload_json, match_fingerprints_json, status, created_at) VALUES ('ob1', 'u1', 'ch1', 's1', ?, '[\"fp1\"]', ?, datetime('now'))"
  ).bind(
    JSON.stringify({ matches: [{ ruleName: "周末 18 点", slotDate: "2026-09-10", startTime: "18:00", endTime: "19:00" }] }),
    status
  ).run();
}

beforeEach(async () => {
  await env.APP_DB.prepare("DELETE FROM notification_outbox").run();
  await env.APP_DB.prepare("DELETE FROM rule_match_state").run();
  await env.APP_DB.prepare("DELETE FROM notification_channel").run();
  await env.APP_DB.prepare("DELETE FROM notification_rule").run();
  await env.APP_DB.prepare("DELETE FROM user_access").run();
  await env.APP_DB.prepare("DELETE FROM user").run();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleQueueBatch", () => {
  it("delivers via PushDeer and marks sent on success", async () => {
    await seedOutbox();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const msg = makeMessage("ob1");
    await handleQueueBatch(
      { messages: [msg] },
      { APP_DB: env.APP_DB, CHANNEL_ENCRYPTION_KEYS: KEY_RING_JSON } as unknown as Env
    );

    expect(msg.acked).toBe(true);
    expect(msg.retried).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(fetchMock.mock.calls[0]![1]!.body as string);
    expect(params.get("pushkey")).toBe(PUSH_KEY);
    expect(params.get("text")).toContain("周末 18 点");
    expect(params.get("text")).toContain("18:00–19:00");
    expect(params.get("type")).toBe("markdown");

    const outbox = await env.APP_DB
      .prepare("SELECT status FROM notification_outbox WHERE id = 'ob1'")
      .first<{ status: string }>();
    expect(outbox!.status).toBe("sent");

    const match = await env.APP_DB
      .prepare("SELECT notification_count FROM rule_match_state WHERE fingerprint = 'fp1'")
      .first<{ notification_count: number }>();
    expect(match!.notification_count).toBe(1);
  });

  it("fails without calling the provider when user access is not active", async () => {
    await seedOutbox();
    await env.APP_DB.prepare("UPDATE user_access SET status = 'disabled' WHERE user_id = 'u1'").run();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const msg = makeMessage("ob1");
    await handleQueueBatch(
      { messages: [msg] },
      { APP_DB: env.APP_DB, CHANNEL_ENCRYPTION_KEYS: KEY_RING_JSON } as unknown as Env
    );

    expect(fetchMock).not.toHaveBeenCalled();
    const outbox = await env.APP_DB
      .prepare("SELECT status, last_error FROM notification_outbox WHERE id = 'ob1'")
      .first<{ status: string; last_error: string }>();
    expect(outbox!.status).toBe("failed");
    expect(outbox!.last_error).toBe("user access not active");
    expect(msg.acked).toBe(true);
  });

  it("marks failed with provider error and keeps notification counts", async () => {
    await seedOutbox();
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const msg = makeMessage("ob1");
    await handleQueueBatch(
      { messages: [msg] },
      { APP_DB: env.APP_DB, CHANNEL_ENCRYPTION_KEYS: KEY_RING_JSON } as unknown as Env
    );

    const outbox = await env.APP_DB
      .prepare("SELECT status, last_error FROM notification_outbox WHERE id = 'ob1'")
      .first<{ status: string; last_error: string }>();
    expect(outbox!.status).toBe("failed");
    expect(outbox!.last_error).toContain("500");

    const match = await env.APP_DB
      .prepare("SELECT notification_count FROM rule_match_state WHERE fingerprint = 'fp1'")
      .first<{ notification_count: number }>();
    expect(match!.notification_count).toBe(0);
    expect(msg.acked).toBe(true);
  });

  it("acks unknown outbox ids without side effects", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const msg = makeMessage("nope");
    await handleQueueBatch(
      { messages: [msg] },
      { APP_DB: env.APP_DB, CHANNEL_ENCRYPTION_KEYS: KEY_RING_JSON } as unknown as Env
    );

    expect(msg.acked).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not redeliver an already-sent outbox", async () => {
    await seedOutbox("sent");
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ code: 0 }) }));
    vi.stubGlobal("fetch", fetchMock);

    const msg = makeMessage("ob1");
    await handleQueueBatch(
      { messages: [msg] },
      { APP_DB: env.APP_DB, CHANNEL_ENCRYPTION_KEYS: KEY_RING_JSON } as unknown as Env
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(msg.acked).toBe(true);
  });
});
