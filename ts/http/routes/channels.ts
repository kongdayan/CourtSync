import { Hono } from "hono";
import { ChannelRepository } from "../../notifications/channel-repository";
import { PushDeerProvider } from "../../notifications/providers/pushdeer";
import {
  parseKeyRing,
  encryptChannelConfig,
  fingerprintChannelConfig,
  issueVerificationToken,
  verifyVerificationToken,
} from "../../notifications/crypto";
import type { AuthVariables } from "../middleware/session";

function maskPushKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export const channelsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

  // GET /api/channels
  .get("/channels", async (c) => {
    const repo = new ChannelRepository(c.env.APP_DB);
    const rows = await repo.listByUser(c.get("access").userId);
    // Never expose encrypted config — only return mask
    return c.json(rows.map(r => ({
      provider: r.provider,
      destinationMask: r.destination_mask,
      enabled: r.enabled === 1,
      verifiedAt: r.verified_at,
      lastError: r.last_error,
    })));
  })

  // POST /api/channels/pushdeer/test
  .post("/channels/pushdeer/test", async (c) => {
    const { pushKey } = await c.req.json<{ pushKey: string }>();
    if (!pushKey || typeof pushKey !== "string") {
      return c.json({ error: "pushKey is required" }, 400);
    }

    try {
      const provider = new PushDeerProvider();
      await provider.test({ pushKey });
    } catch (err: any) {
      return c.json({ error: "pushdeer_test_failed", message: err.message }, 400);
    }

    const keyRing = parseKeyRing(c.env.CHANNEL_ENCRYPTION_KEYS);
    const config = { pushKey };
    const fingerprint = await fingerprintChannelConfig(keyRing, config);
    const token = await issueVerificationToken(keyRing, {
      userId: c.get("access").userId,
      provider: "pushdeer",
      configFingerprint: fingerprint,
      expiresAt: Math.floor(Date.now() / 1000) + 600, // 10 min
    });

    return c.json({ verificationToken: token });
  })

  // PUT /api/channels/pushdeer (save)
  .put("/channels/pushdeer", async (c) => {
    const { pushKey, verificationToken } = await c.req.json<{ pushKey: string; verificationToken: string }>();
    if (!pushKey || !verificationToken) {
      return c.json({ error: "pushKey and verificationToken are required" }, 400);
    }

    const keyRing = parseKeyRing(c.env.CHANNEL_ENCRYPTION_KEYS);
    const config = { pushKey };
    const fingerprint = await fingerprintChannelConfig(keyRing, config);

    // Verify token
    try {
      await verifyVerificationToken(keyRing, verificationToken, {
        userId: c.get("access").userId,
        provider: "pushdeer",
        configFingerprint: fingerprint,
        now: Math.floor(Date.now() / 1000),
      });
    } catch (err: any) {
      return c.json({ error: "invalid_verification_token", message: err.message }, 400);
    }

    const encrypted = await encryptChannelConfig(keyRing, config);
    const now = new Date().toISOString();
    const repo = new ChannelRepository(c.env.APP_DB);
    await repo.upsert(c.get("access").userId, "pushdeer", encrypted, maskPushKey(pushKey), fingerprint, true, now);

    return c.json({ destinationMask: maskPushKey(pushKey), verifiedAt: now });
  });
