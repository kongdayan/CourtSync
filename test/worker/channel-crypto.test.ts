import { describe, expect, it } from "vitest";
import {
  encryptChannelConfig,
  decryptChannelConfig,
  fingerprintChannelConfig,
  issueVerificationToken,
  verifyVerificationToken,
} from "../../ts/notifications/crypto";

function makeTestKeyRing() {
  const key = new Uint8Array(32).fill(7);
  const b64 = btoa(String.fromCharCode(...key));
  return { active: "v1", keys: { v1: b64 } };
}

const keyRing = makeTestKeyRing();

describe("channel crypto", () => {
  it("round-trips channel config without embedding plaintext in ciphertext", async () => {
    const encrypted = await encryptChannelConfig(keyRing as any, { pushKey: "PDU-secret" });
    expect(encrypted).not.toContain("PDU-secret");
    await expect(decryptChannelConfig(keyRing as any, encrypted))
      .resolves.toEqual({ pushKey: "PDU-secret" });
  });

  it("produces stable fingerprints for identical configs", async () => {
    const fp1 = await fingerprintChannelConfig(keyRing as any, { pushKey: "same" });
    const fp2 = await fingerprintChannelConfig(keyRing as any, { pushKey: "same" });
    expect(fp1).toBe(fp2);
  });

  it("produces different fingerprints for different configs", async () => {
    const fp1 = await fingerprintChannelConfig(keyRing as any, { pushKey: "a" });
    const fp2 = await fingerprintChannelConfig(keyRing as any, { pushKey: "b" });
    expect(fp1).not.toBe(fp2);
  });

  it("binds a verification token to user and key fingerprint", async () => {
    const token = await issueVerificationToken(keyRing as any, {
      userId: "user-1",
      provider: "pushdeer",
      configFingerprint: "abc",
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    await expect(verifyVerificationToken(keyRing as any, token, {
      userId: "user-1",
      provider: "pushdeer",
      configFingerprint: "different",
      now: Math.floor(Date.now() / 1000),
    })).rejects.toThrow(/fingerprint/i);
  });
});
