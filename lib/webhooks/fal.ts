import { createHash, webcrypto } from "node:crypto";
import { importJWK, type JWK } from "jose";

const JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

let cachedKeys: JWK[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function getJwks(): Promise<JWK[]> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedKeys;
  }
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`Could not fetch fal.ai JWKS: ${response.status}`);
  const { keys } = (await response.json()) as { keys: JWK[] };
  cachedKeys = keys;
  cachedAt = Date.now();
  return keys;
}

/**
 * fal.ai signs webhook deliveries with ED25519 over
 * `${requestId}\n${userId}\n${timestamp}\n${sha256(body)}`, verifiable
 * against the public keys published at fal's JWKS endpoint. This is
 * defense-in-depth on top of the shared-secret token already required in
 * the callback URL (see AI_WEBHOOK_SECRET / getAiWebhookUrl) — if fal
 * changes their exact signing spec, re-check it against their current
 * docs before relying on this alone.
 */
export async function verifyFalWebhook(rawBody: string, headers: Headers): Promise<boolean> {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signatureHex = headers.get("x-fal-webhook-signature");

  if (!requestId || !userId || !timestamp || !signatureHex) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = `${requestId}\n${userId}\n${timestamp}\n${bodyHash}`;
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = Buffer.from(signatureHex, "hex");

  try {
    const keys = await getJwks();
    for (const jwk of keys) {
      const key = await importJWK(jwk, "EdDSA");
      const valid = await webcrypto.subtle.verify(
        "Ed25519",
        key as CryptoKey,
        signatureBytes,
        messageBytes
      );
      if (valid) return true;
    }
    return false;
  } catch {
    return false;
  }
}
