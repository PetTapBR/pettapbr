import "server-only";

import webpush, { type PushSubscription } from "web-push";

const vapidPublicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
const vapidPrivateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "").trim();
const vapidSubject = (process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:suporte@pettapbr.com").trim();

let isConfigured = false;

export function isWebPushConfigured() {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export function getWebPushPublicKey() {
  return vapidPublicKey;
}

function configureWebPushIfNeeded() {
  if (isConfigured || !isWebPushConfigured()) {
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  isConfigured = true;
}

export async function sendWebPushNotification(
  subscription: PushSubscription,
  payload: Record<string, unknown>,
) {
  if (!isWebPushConfigured()) {
    return {
      ok: false,
      shouldDeactivate: false,
      errorMessage: "WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY nao configuradas.",
    };
  }

  configureWebPushIfNeeded();

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60,
      urgency: "high",
    });

    return {
      ok: true,
      shouldDeactivate: false,
    };
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;

    const shouldDeactivate = statusCode === 404 || statusCode === 410;

    return {
      ok: false,
      shouldDeactivate,
      errorMessage: error instanceof Error ? error.message : "Falha ao enviar push.",
    };
  }
}
