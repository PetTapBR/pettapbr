"use client";

import { useEffect, useMemo, useState } from "react";

import { usePetTap } from "@/context/pettap-provider";

type BrowserPermission = NotificationPermission | "unsupported";

interface PushPublicKeyResponse {
  ok: boolean;
  publicKey?: string;
  message?: string;
}

interface PushSubscribeResponse {
  ok: boolean;
  message?: string;
}

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function canUsePushInCurrentOrigin() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.isSecureContext) {
    return true;
  }

  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

async function saveSubscription(ownerId: string, subscription: PushSubscription) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ownerId,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      subscription: subscription.toJSON(),
    }),
  });

  const payload = (await response.json()) as PushSubscribeResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Falha ao salvar notificacoes push.");
  }
}

export function PushNotificationCard() {
  const { currentOwner } = usePetTap();
  const [permission, setPermission] = useState<BrowserPermission>(() => {
    if (typeof window === "undefined") {
      return "default";
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return "unsupported";
    }

    return Notification.permission;
  });
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (permission === "unsupported") {
      return;
    }

    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!registration) {
        setIsPushEnabled(false);
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      setIsPushEnabled(Boolean(subscription));
    })();
  }, [permission]);

  const statusLabel = useMemo(() => {
    if (permission === "unsupported") {
      return "Nao suportado neste navegador";
    }

    if (permission === "denied") {
      return "Bloqueado no navegador";
    }

    if (isPushEnabled) {
      return "Ativo neste dispositivo";
    }

    return "Desativado";
  }, [isPushEnabled, permission]);

  async function handleEnablePush() {
    if (!currentOwner) {
      setFeedback("Faca login novamente para ativar notificacoes.");
      return;
    }

    if (permission === "unsupported") {
      setFeedback("Este navegador nao suporta notificacoes push.");
      return;
    }

    if (!canUsePushInCurrentOrigin()) {
      setFeedback("Push exige HTTPS. Em producao, teste no dominio com certificado SSL.");
      return;
    }

    setIsSubmitting(true);
    setFeedback("");

    try {
      const keyResponse = await fetch("/api/push/public-key");
      const keyPayload = (await keyResponse.json()) as PushPublicKeyResponse;
      if (!keyResponse.ok || !keyPayload.ok || !keyPayload.publicKey) {
        throw new Error(
          keyPayload.message ??
            "Push web nao configurado no servidor. Configure as chaves VAPID.",
        );
      }

      const requestedPermission = await Notification.requestPermission();
      setPermission(requestedPermission);

      if (requestedPermission !== "granted") {
        setIsPushEnabled(false);
        setFeedback("Permissao negada. Libere notificacoes do site no navegador.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(keyPayload.publicKey),
        });
      }

      await saveSubscription(currentOwner.id, subscription);
      setIsPushEnabled(true);
      setFeedback("Notificacoes push ativadas neste dispositivo.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao ativar notificacoes push.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Notificacao Push</p>
      <p className="mt-2 text-sm text-cyan-50">
        Receba alerta de pet perdido no celular mesmo com o site fechado.
      </p>
      <p className="mt-2 text-xs text-cyan-100/85">Status: {statusLabel}</p>

      <button
        type="button"
        onClick={() => {
          void handleEnablePush();
        }}
        disabled={isSubmitting || permission === "unsupported"}
        className="mt-3 rounded-full border border-cyan-100/40 bg-cyan-400/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Ativando..." : "Ativar no dispositivo"}
      </button>

      {feedback ? <p className="mt-2 text-xs text-cyan-100">{feedback}</p> : null}
    </div>
  );
}
