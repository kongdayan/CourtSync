interface KeyRing {
  active: string;
  keys: Record<string, string>; // keyId -> base64-encoded 32-byte key
}

interface ChannelConfig {
  pushKey: string;
}

// Parse CHANNEL_ENCRYPTION_KEYS env var
export function parseKeyRing(raw: string): KeyRing {
  const parsed = JSON.parse(raw);
  if (!parsed.active || !parsed.keys || !parsed.keys[parsed.active]) {
    throw new Error("invalid key ring: active key not found");
  }
  for (const [id, key] of Object.entries(parsed.keys)) {
    const decoded = Uint8Array.from(atob(key as string), c => c.charCodeAt(0));
    if (decoded.length !== 32) {
      throw new Error(`invalid key ${id}: must be 32 bytes`);
    }
  }
  return parsed as KeyRing;
}

async function deriveKey(masterKey: BufferSource, context: string): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey("raw", masterKey, { name: "HKDF" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(context) },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveHmacKey(masterKey: BufferSource, context: string): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey("raw", masterKey, { name: "HKDF" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(context) },
    key,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"]
  );
}

function getKeyBytes(keyRing: KeyRing, keyId: string): Uint8Array<ArrayBuffer> {
  const b64 = keyRing.keys[keyId];
  if (!b64) throw new Error(`unknown key id: ${keyId}`);
  const raw = atob(b64);
  const result = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) result[i] = raw.charCodeAt(i);
  return result;
}

export async function encryptChannelConfig(keyRing: KeyRing, config: ChannelConfig): Promise<string> {
  const keyId = keyRing.active;
  const masterKey = getKeyBytes(keyRing, keyId);
  const aesKey = await deriveKey(masterKey, "courtsync/channel/encryption/v1");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(canonicalJson(config));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext));
  return `v1.${keyId}.${base64url(iv)}.${base64url(ciphertext)}`;
}

export async function decryptChannelConfig(keyRing: KeyRing, encrypted: string): Promise<ChannelConfig> {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid ciphertext format");
  const [, keyId, ivB64, ctB64] = parts;
  const masterKey = getKeyBytes(keyRing, keyId);
  const aesKey = await deriveKey(masterKey, "courtsync/channel/encryption/v1");
  const iv = base64urlDecode(ivB64);
  const ciphertext = base64urlDecode(ctB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function fingerprintChannelConfig(keyRing: KeyRing, config: ChannelConfig): Promise<string> {
  const keyId = keyRing.active;
  const masterKey = getKeyBytes(keyRing, keyId);
  const hmacKey = await deriveHmacKey(masterKey, "courtsync/channel/fingerprint/v1");
  const data = new TextEncoder().encode(canonicalJson(config));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, data));
  return base64url(sig);
}

function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

function base64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const raw = atob(str);
  const result = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) result[i] = raw.charCodeAt(i);
  return result;
}

// Verification tokens
interface TokenPayload {
  userId: string;
  provider: string;
  configFingerprint: string;
  expiresAt: number; // unix timestamp
}

export async function issueVerificationToken(keyRing: KeyRing, payload: TokenPayload): Promise<string> {
  const keyId = keyRing.active;
  const masterKey = getKeyBytes(keyRing, keyId);
  const hmacKey = await deriveHmacKey(masterKey, "courtsync/verification-token/v1");
  const data = new TextEncoder().encode(canonicalJson(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, data));
  return `v1.${keyId}.${base64url(new TextEncoder().encode(canonicalJson(payload)))}.${base64url(sig)}`;
}

export async function verifyVerificationToken(
  keyRing: KeyRing,
  token: string,
  expected: { userId: string; provider: string; configFingerprint: string; now: number }
): Promise<void> {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid token");
  const [, keyId, payloadB64, sigB64] = parts;
  const masterKey = getKeyBytes(keyRing, keyId);
  const hmacKey = await deriveHmacKey(masterKey, "courtsync/verification-token/v1");
  const payloadBytes = base64urlDecode(payloadB64);
  const sig = base64urlDecode(sigB64);

  // Verify signature
  const valid = await crypto.subtle.verify("HMAC", hmacKey, sig, payloadBytes);
  if (!valid) throw new Error("invalid token signature");

  const payload: TokenPayload = JSON.parse(new TextDecoder().decode(payloadBytes));
  if (payload.expiresAt < expected.now) throw new Error("token expired");
  if (payload.userId !== expected.userId) throw new Error("token user mismatch");
  if (payload.provider !== expected.provider) throw new Error("token provider mismatch");
  if (payload.configFingerprint !== expected.configFingerprint) throw new Error("token fingerprint mismatch");
}
