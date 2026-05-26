"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePetTap } from "@/context/pettap-provider";
import { authFetch } from "@/lib/auth-client";
import { reverseGeocodeLabel } from "@/lib/geocode-client";
import { isOwnerPro } from "@/lib/owner-defaults";

type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX";

const AUTO_SYNC_INTERVAL_MS = 8000;
const AUTO_SYNC_MAX_ATTEMPTS = 60;

interface StartSubscriptionResponse {
  ok: boolean;
  message?: string;
  paymentUrl?: string;
  pendingMonths?: number;
}

interface SyncSubscriptionResponse {
  ok: boolean;
  status?: "active" | "pending";
  paymentStatus?: string;
  paymentUrl?: string;
  expiresAt?: string | null;
  message?: string;
}

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatPlanDate(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return "";
  }

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleDateString("pt-BR");
}

function formatPaymentStatusLabel(value: string | null | undefined) {
  const status = (value ?? "").trim().toUpperCase();
  switch (status) {
    case "PENDING":
      return "Pendente";
    case "RECEIVED":
      return "Recebido";
    case "CONFIRMED":
      return "Confirmado";
    case "OVERDUE":
      return "Vencido";
    default:
      return status || "Pendente";
  }
}

const BILLING_OPTIONS: Array<{ value: AsaasBillingType; label: string }> = [
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "BOLETO" },
  { value: "CREDIT_CARD", label: "CARTAO" },
];

const RENEWAL_OPTIONS = [1, 3, 6, 12] as const;

export default function PlansPage() {
  const router = useRouter();
  const {
    isReady,
    currentOwner,
    refreshCurrentOwner,
    updateCurrentOwnerAlertSettings,
  } = usePetTap();

  const [planFeedback, setPlanFeedback] = useState("");
  const [alertFeedback, setAlertFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [isBillingSubmitting, setIsBillingSubmitting] = useState(false);
  const [isVerifyingBilling, setIsVerifyingBilling] = useState(false);
  const [isAutoCheckingPayment, setIsAutoCheckingPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");

  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [billingType, setBillingType] = useState<AsaasBillingType>("PIX");
  const [renewalMonths, setRenewalMonths] = useState(1);

  const [alertDraft, setAlertDraft] = useState({
    receiveLostAlerts: false,
    radiusKm: 5,
    locationLat: null as number | null,
    locationLng: null as number | null,
    locationLabel: "",
  });

  const isProPlan = isOwnerPro(currentOwner);
  const isAsaasPending =
    currentOwner?.subscription.provider === "asaas" &&
    currentOwner.subscription.tier === "pro" &&
    currentOwner.subscription.status === "inactive";
  const planExpiresLabel = formatPlanDate(currentOwner?.subscription.expiresAt);
  const hasExpiredPlan =
    Boolean(planExpiresLabel) &&
    currentOwner?.subscription.tier === "pro" &&
    currentOwner.subscription.status === "active" &&
    !isProPlan;

  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSyncAttemptRef = useRef(0);
  const autoSyncInFlightRef = useRef(false);
  const handledSuccessParamRef = useRef(false);

  useEffect(() => {
    if (isReady && !currentOwner) {
      router.push("/login?next=/plans");
    }
  }, [currentOwner, isReady, router]);

  useEffect(() => {
    if (!currentOwner) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlertDraft({
      receiveLostAlerts: currentOwner.alerts.receiveLostAlerts,
      radiusKm: currentOwner.alerts.radiusKm,
      locationLat: currentOwner.alerts.locationLat,
      locationLng: currentOwner.alerts.locationLng,
      locationLabel: currentOwner.alerts.locationLabel,
    });
  }, [currentOwner]);

  const asaasStatusLabel = useMemo(() => {
    if (!currentOwner) {
      return "";
    }

    if (isOwnerPro(currentOwner)) {
      return planExpiresLabel ? `Pro ativo ate ${planExpiresLabel}` : "Pro ativo";
    }

    if (isAsaasPending) {
      return "Aguardando confirmacao de pagamento";
    }

    if (currentOwner.subscription.tier === "pro") {
      return "Plano Pro inativo ou vencido";
    }

    return "Plano Start";
  }, [currentOwner, isAsaasPending, planExpiresLabel]);

  const stopAutoSync = useCallback(() => {
    if (autoSyncTimerRef.current) {
      clearInterval(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }

    autoSyncAttemptRef.current = 0;
    setIsAutoCheckingPayment(false);
  }, []);

  const syncSubscriptionStatus = useCallback(
    async (options?: { showPendingMessage?: boolean }) => {
      if (!currentOwner) {
        return { ok: false, active: false, pending: false };
      }

      if (autoSyncInFlightRef.current) {
        return { ok: false, active: false, pending: true };
      }

      const showPendingMessage = options?.showPendingMessage ?? true;

      autoSyncInFlightRef.current = true;
      setIsVerifyingBilling(true);

      try {
        const response = await authFetch("/api/billing/asaas/subscription/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        const data = (await response.json()) as SyncSubscriptionResponse;
        if (!response.ok || !data.ok) {
          setPlanFeedback(data.message ?? "Falha ao verificar pagamento.");
          return { ok: false, active: false, pending: false };
        }

        if (data.status === "active") {
          await refreshCurrentOwner();
          const expiresLabel = formatPlanDate(data.expiresAt);
          const fallbackMessage = expiresLabel
            ? `Pagamento confirmado e plano Pro ativo ate ${expiresLabel}.`
            : "Pagamento confirmado e plano Pro ativado.";
          setPlanFeedback(data.message ?? fallbackMessage);
          return { ok: true, active: true, pending: false };
        }

        setPaymentUrl((prev) => data.paymentUrl ?? prev);

        if (showPendingMessage) {
          setPlanFeedback(
            data.message ??
              `Pagamento ainda pendente (${formatPaymentStatusLabel(data.paymentStatus)}).`,
          );
        }

        return { ok: true, active: false, pending: true };
      } catch {
        setPlanFeedback("Erro de conexao ao verificar pagamento no Asaas.");
        return { ok: false, active: false, pending: false };
      } finally {
        autoSyncInFlightRef.current = false;
        setIsVerifyingBilling(false);
      }
    },
    [currentOwner, refreshCurrentOwner],
  );

  const startAutoSync = useCallback(
    async (options?: { showStartMessage?: boolean }) => {
      const showStartMessage = options?.showStartMessage ?? true;

      if (!currentOwner) {
        return;
      }

      stopAutoSync();
      setIsAutoCheckingPayment(true);

      if (showStartMessage) {
        setPlanFeedback("Aguardando confirmacao de pagamento no Asaas...");
      }

      const firstCheck = await syncSubscriptionStatus({ showPendingMessage: false });
      if (firstCheck.active || !firstCheck.pending) {
        stopAutoSync();
        return;
      }

      autoSyncTimerRef.current = setInterval(() => {
        if (autoSyncInFlightRef.current) {
          return;
        }

        autoSyncAttemptRef.current += 1;

        if (autoSyncAttemptRef.current > AUTO_SYNC_MAX_ATTEMPTS) {
          stopAutoSync();
          setPlanFeedback(
            "Pagamento ainda pendente. Continue no Asaas e a atualizacao sera feita automaticamente em breve.",
          );
          return;
        }

        void (async () => {
          const result = await syncSubscriptionStatus({ showPendingMessage: false });
          if (result.active || !result.pending) {
            stopAutoSync();
          }
        })();
      }, AUTO_SYNC_INTERVAL_MS);
    },
    [currentOwner, stopAutoSync, syncSubscriptionStatus],
  );

  useEffect(() => {
    return () => {
      stopAutoSync();
    };
  }, [stopAutoSync]);

  useEffect(() => {
    if (!isReady || !currentOwner) {
      return;
    }

    if (isAsaasPending && !autoSyncTimerRef.current && !isAutoCheckingPayment) {
      void startAutoSync({ showStartMessage: false });
    }
  }, [
    currentOwner,
    isAsaasPending,
    isAutoCheckingPayment,
    isReady,
    startAutoSync,
  ]);

  useEffect(() => {
    if (!isReady || !currentOwner) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    if (query.get("asaas") !== "success") {
      return;
    }

    if (handledSuccessParamRef.current) {
      return;
    }

    handledSuccessParamRef.current = true;
    void startAutoSync({ showStartMessage: true });
  }, [currentOwner, isReady, startAutoSync]);

  if (!isReady || !currentOwner) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
        Carregando planos...
      </div>
    );
  }

  async function handleUpgradeToProAsaas() {
    if (!currentOwner) {
      setPlanFeedback("Sessao invalida. Faca login novamente.");
      return;
    }

    const normalizedCpfCnpj = sanitizeDigits(cpfCnpj);
    const requiresCpfCnpj = !currentOwner.subscription.asaasCustomerId.trim();
    if (
      requiresCpfCnpj &&
      normalizedCpfCnpj.length !== 11 &&
      normalizedCpfCnpj.length !== 14
    ) {
      setPlanFeedback("Informe CPF/CNPJ valido para gerar a cobranca no Asaas.");
      return;
    }

    setIsBillingSubmitting(true);
    setPlanFeedback(`Gerando cobranca de ${renewalMonths} mes(es) no Asaas...`);

    try {
      const response = await authFetch("/api/billing/asaas/subscription/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cpfCnpj: normalizedCpfCnpj,
          phone,
          billingType,
          months: renewalMonths,
        }),
      });

      const data = (await response.json()) as StartSubscriptionResponse;
      if (!response.ok || !data.ok) {
        setPlanFeedback(data.message ?? "Falha ao gerar cobranca no Asaas.");
        setIsBillingSubmitting(false);
        return;
      }

      setPaymentUrl(data.paymentUrl ?? "");
      setPlanFeedback(
        data.message ?? "Cobranca criada. Abra a fatura para concluir o pagamento.",
      );
      await refreshCurrentOwner();
      void startAutoSync({ showStartMessage: true });

      if (data.paymentUrl) {
        window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setPlanFeedback("Erro de conexao ao gerar cobranca no Asaas.");
    } finally {
      setIsBillingSubmitting(false);
    }
  }

  async function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setAlertFeedback("Geolocalizacao nao suportada neste navegador.");
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      const host = window.location.hostname.toLowerCase();
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
      if (!isLocalhost) {
        setAlertFeedback("Geolocalizacao exige HTTPS em celular.");
        return;
      }
    }

    setIsLoadingGeo(true);
    setAlertFeedback("Capturando sua localizacao...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setAlertDraft((prev) => ({
          ...prev,
          locationLat: lat,
          locationLng: lng,
        }));

        const resolved = await reverseGeocodeLabel(lat, lng);
        if (resolved) {
          setAlertDraft((prev) => ({
            ...prev,
            locationLabel: resolved,
          }));
        }

        setIsLoadingGeo(false);
        setAlertFeedback("Localizacao capturada. Salve para aplicar.");
      },
      () => {
        setIsLoadingGeo(false);
        setAlertFeedback("Nao foi possivel obter sua localizacao.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 12000,
      },
    );
  }

  async function handleSaveAlerts() {
    if (alertDraft.receiveLostAlerts && (alertDraft.locationLat === null || alertDraft.locationLng === null)) {
      setAlertFeedback("Defina sua localizacao para receber alertas por proximidade.");
      return;
    }

    setIsSubmitting(true);
    const result = await updateCurrentOwnerAlertSettings({
      receiveLostAlerts: alertDraft.receiveLostAlerts,
      radiusKm: alertDraft.radiusKm,
      locationLat: alertDraft.locationLat,
      locationLng: alertDraft.locationLng,
      locationLabel: alertDraft.locationLabel,
    });
    setIsSubmitting(false);

    setAlertFeedback(
      result.message ??
        (result.ok ? "Preferencias de alerta atualizadas com sucesso." : "Falha ao salvar alertas."),
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Planos PetTapBR</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
          Escolha seu nivel de protecao
        </h1>
        <p className="mt-3 text-sm text-zinc-300">
          Integracao real com Asaas (sandbox): gere cobrancas de renovacao por 1, 3, 6 ou 12 meses
          e confirme o pagamento para liberar todos os recursos.
        </p>
        <p className="mt-3 inline-flex rounded-full border border-cyan-300/35 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">
          {asaasStatusLabel}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Plano Start</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">R$ 0 / mes</h2>
          <ul className="mt-4 grid gap-2 text-sm text-zinc-300">
            <li>Nome do pet</li>
            <li>Foto de perfil</li>
            <li>Contato principal</li>
          </ul>
          {isProPlan ? (
            <p className="mt-6 text-sm text-zinc-300">
              Se o pagamento nao for renovado ate o vencimento, o plano volta para o basico automaticamente.
            </p>
          ) : (
            <p className="mt-6 inline-flex rounded-full border border-emerald-300/35 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100">
              Plano atual
            </p>
          )}
        </article>

        <article className="rounded-3xl border border-cyan-300/30 bg-cyan-500/10 p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-cyan-100">Plano Pro</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">R$ 7,90 / mes</h2>
          <ul className="mt-4 grid gap-2 text-sm text-cyan-100">
            <li>Tudo do plano Start</li>
            <li>Bio, idade, raca, peso e cidade</li>
            <li>Galeria de fotos e videos</li>
            <li>Informacoes medicas</li>
            <li>Modo perdido + recompensa</li>
            <li>Alerta para tutores proximos</li>
          </ul>

          {isProPlan ? (
            <p className="mt-6 inline-flex rounded-full border border-cyan-200/40 bg-cyan-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50">
              Plano atual
            </p>
          ) : null}

          {planExpiresLabel ? (
            <p className="mt-3 text-sm font-medium text-cyan-100">
              {hasExpiredPlan
                ? `Seu plano venceu em ${planExpiresLabel}.`
                : `Seu plano vence em ${planExpiresLabel}.`}
            </p>
          ) : (
            <p className="mt-3 text-sm text-cyan-100/90">Sem vencimento ativo no momento.</p>
          )}

          <div className="mt-6 grid gap-3">
            <label className="grid gap-2 text-sm text-cyan-100">
              <span className="text-xs uppercase tracking-[0.14em] text-cyan-200">
                CPF/CNPJ (obrigatorio apenas na 1a cobranca)
              </span>
              <input
                type="text"
                value={cpfCnpj}
                onChange={(event) => setCpfCnpj(event.target.value)}
                placeholder="Somente numeros"
                className="rounded-2xl border border-cyan-200/25 bg-cyan-950/20 px-4 py-3 text-white outline-none placeholder:text-cyan-200/50 focus:border-cyan-200/55"
              />
            </label>

            <label className="grid gap-2 text-sm text-cyan-100">
              <span className="text-xs uppercase tracking-[0.14em] text-cyan-200">Telefone (opcional)</span>
              <input
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="DDD + numero"
                className="rounded-2xl border border-cyan-200/25 bg-cyan-950/20 px-4 py-3 text-white outline-none placeholder:text-cyan-200/50 focus:border-cyan-200/55"
              />
            </label>

            <label className="grid gap-2 text-sm text-cyan-100">
              <span className="text-xs uppercase tracking-[0.14em] text-cyan-200">Forma de cobranca</span>
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-cyan-200/25 bg-cyan-950/15 p-2 sm:grid-cols-3">
                {BILLING_OPTIONS.map((option) => {
                  const isActive = billingType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBillingType(option.value)}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                        isActive
                          ? "border border-cyan-100/50 bg-cyan-300/20 text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                          : "border border-transparent bg-cyan-950/20 text-cyan-100/80 hover:border-cyan-200/30 hover:text-cyan-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </label>

            <label className="grid gap-2 text-sm text-cyan-100">
              <span className="text-xs uppercase tracking-[0.14em] text-cyan-200">Renovar por</span>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-cyan-200/25 bg-cyan-950/15 p-2 sm:grid-cols-4">
                {RENEWAL_OPTIONS.map((months) => {
                  const isActive = renewalMonths === months;
                  return (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setRenewalMonths(months)}
                      className={`rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                        isActive
                          ? "border border-white/50 bg-white text-zinc-900"
                          : "border border-transparent bg-cyan-950/20 text-cyan-100/85 hover:border-cyan-200/30 hover:text-cyan-50"
                      }`}
                    >
                      {months}m
                    </button>
                  );
                })}
              </div>
            </label>

            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleUpgradeToProAsaas();
                }}
                disabled={isBillingSubmitting}
                className="w-full rounded-full bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 disabled:opacity-60 sm:w-auto"
              >
                {isBillingSubmitting ? "Gerando..." : `Renovar ${renewalMonths} mes(es)`}
              </button>
            </div>

            {isAutoCheckingPayment || isVerifyingBilling ? (
              <p className="text-xs text-cyan-100/90">
                Verificacao automatica ativa. Assim que o Asaas confirmar, seu plano sera renovado.
              </p>
            ) : null}

            {paymentUrl ? (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-sm text-cyan-100 underline underline-offset-4"
              >
                Abrir fatura novamente
              </a>
            ) : null}
          </div>

          <p className="mt-4 text-sm text-cyan-50/90">{planFeedback}</p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-white">Alertas de pet perdido por proximidade</h3>
            <p className="mt-1 text-sm text-zinc-300">
              Quando um pet for marcado como perdido, voce recebe notificacao se estiver no raio configurado.
            </p>
          </div>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.14em] text-zinc-300">
            {isProPlan ? "Disponivel no Pro" : "Upgrade para Pro"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={alertDraft.receiveLostAlerts}
              onChange={(event) =>
                setAlertDraft((prev) => ({
                  ...prev,
                  receiveLostAlerts: event.target.checked,
                }))
              }
              className="size-4 accent-cyan-400"
            />
            Receber alertas de pets perdidos perto de mim
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Raio de alerta (km)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={alertDraft.radiusKm}
              onChange={(event) =>
                setAlertDraft((prev) => ({
                  ...prev,
                  radiusKm: Number(event.target.value) || 5,
                }))
              }
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isLoadingGeo}
            className="rounded-full border border-cyan-300/40 bg-cyan-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 disabled:opacity-60"
          >
            {isLoadingGeo ? "Localizando..." : "Usar minha localizacao"}
          </button>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Referencia da localizacao</span>
            <input
              type="text"
              value={alertDraft.locationLabel}
              onChange={(event) =>
                setAlertDraft((prev) => ({
                  ...prev,
                  locationLabel: event.target.value,
                }))
              }
              placeholder="Ex: Vila Mariana, Sao Paulo"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-zinc-400">
          Coordenadas: {alertDraft.locationLat !== null && alertDraft.locationLng !== null ? `${alertDraft.locationLat.toFixed(5)}, ${alertDraft.locationLng.toFixed(5)}` : "nao definidas"}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handleSaveAlerts();
            }}
            disabled={isSubmitting}
            className="rounded-full bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 disabled:opacity-60"
          >
            Salvar configuracoes
          </button>
          <p className="text-sm text-zinc-300">{alertFeedback}</p>
        </div>
      </section>
    </div>
  );
}
