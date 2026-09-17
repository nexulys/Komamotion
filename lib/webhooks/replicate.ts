import { Webhook } from "svix";

/**
 * Replicate signs webhook deliveries using the Svix format (Webhook-Id /
 * Webhook-Timestamp / Webhook-Signature headers, HMAC-SHA256 over
 * `${id}.${timestamp}.${body}`). Verifying with the `svix` library is
 * Replicate's own documented approach — swap in an HMAC-only
 * implementation if you'd rather not depend on it.
 */
export function verifyReplicateWebhook(rawBody: string, headers: Headers): boolean {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) return false;

  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  try {
    new Webhook(secret).verify(rawBody, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    });
    return true;
  } catch {
    return false;
  }
}
