/**
 * The app's public origin. Required outside of a Next.js request context
 * (Trigger.dev tasks, cron jobs) where `headers()` isn't available; server
 * actions/routes still prefer the live request origin when present.
 */
export function getAppUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be set for background jobs and webhook callbacks to work."
    );
  }
  return url;
}

export function getAiWebhookUrl() {
  const secret = process.env.AI_WEBHOOK_SECRET ?? "";
  return `${getAppUrl()}/api/webhooks/ai?token=${encodeURIComponent(secret)}`;
}
