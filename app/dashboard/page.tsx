"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PushNotificationCard } from "@/components/push-notification-card";
import { StatusPill } from "@/components/status-pill";
import { usePetTap } from "@/context/pettap-provider";
import { authFetch } from "@/lib/auth-client";
import { reverseGeocodeLabel } from "@/lib/geocode-client";
import { isOwnerPro } from "@/lib/owner-defaults";
import { formatCoordinates, formatDateTime, normalizeTagCode } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const {
    isReady,
    currentOwner,
    currentOwnerPets,
    currentOwnerTags,
    ownerScanEvents,
    state,
    markNotificationRead,
    markAllNotificationsRead,
    updateCurrentOwnerAlertSettings,
    updatePetStatus,
    getTagByPetId,
    getPetById,
  } = usePetTap();
  const [statusFeedback, setStatusFeedback] = useState("");
  const [lostModeModal, setLostModeModal] = useState<{
    petId: string;
    petName: string;
    reward: string;
  } | null>(null);
  const [isLostModeSubmitting, setIsLostModeSubmitting] = useState(false);
  const [nfcLinkModal, setNfcLinkModal] = useState<{
    petId: string;
    petName: string;
    code: string;
  } | null>(null);
  const [nfcLinkError, setNfcLinkError] = useState("");
  const [privacyFeedback, setPrivacyFeedback] = useState("");
  const [isSubmittingDeleteRequest, setIsSubmittingDeleteRequest] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState("");
  const [isSavingAlertSettings, setIsSavingAlertSettings] = useState(false);
  const [isRequestingAlertLocation, setIsRequestingAlertLocation] = useState(false);
  const [alertDraft, setAlertDraft] = useState({
    receiveLostAlerts: false,
    radiusKm: 5,
    locationLat: null as number | null,
    locationLng: null as number | null,
    locationLabel: "",
  });

  useEffect(() => {
    if (isReady && !currentOwner) {
      router.push("/login");
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

  if (!isReady || !currentOwner) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-300 backdrop-blur">
        Carregando dashboard...
      </div>
    );
  }

  const lostPetsCount = currentOwnerPets.filter((pet) => pet.status === "lost").length;
  const totalScans = ownerScanEvents.length;
  const nfcScans = ownerScanEvents.filter((event) => event.source === "nfc").length;
  const isProPlan = isOwnerPro(currentOwner);
  const planLabel = isProPlan ? "Pro" : "Start";

  function openNfcLinkFlow(petId: string, petName: string) {
    setNfcLinkError("");
    setNfcLinkModal({
      petId,
      petName,
      code: "",
    });
  }

  function handleConfirmNfcLink() {
    if (!nfcLinkModal) {
      return;
    }

    const normalized = normalizeTagCode(nfcLinkModal.code);
    if (!normalized) {
      setNfcLinkError("Digite o Codigo NFC da tag para continuar.");
      return;
    }

    setNfcLinkError("");
    const nextUrl = `/t/${encodeURIComponent(normalized)}?pet=${encodeURIComponent(nfcLinkModal.petId)}`;
    setNfcLinkModal(null);
    router.push(nextUrl);
  }

  async function handleStatusChange(petId: string, status: "safe" | "lost" | "found", reward = "") {
    const result = await updatePetStatus(petId, status, reward);
    setStatusFeedback(result.message ?? (result.ok ? "Status atualizado com sucesso." : "Nao foi possivel atualizar o status."));
  }

  async function handleConfirmLostMode() {
    if (!lostModeModal) {
      return;
    }

    setIsLostModeSubmitting(true);
    await handleStatusChange(lostModeModal.petId, "lost", lostModeModal.reward);
    setIsLostModeSubmitting(false);
    setLostModeModal(null);
  }

  async function handleRequestDataDeletion() {
    setPrivacyFeedback("");
    setIsSubmittingDeleteRequest(true);

    try {
      const response = await authFetch("/api/privacy/delete-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setPrivacyFeedback(payload.message ?? "Nao foi possivel registrar sua solicitacao agora.");
        return;
      }

      setPrivacyFeedback(
        payload.message ?? "Solicitacao enviada com sucesso. Voce recebera retorno por e-mail.",
      );
    } catch {
      setPrivacyFeedback("Falha de conexao ao enviar solicitacao de exclusao.");
    } finally {
      setIsSubmittingDeleteRequest(false);
    }
  }

  async function handleUseAlertLocation() {
    if (!navigator.geolocation) {
      setAlertFeedback("Geolocalizacao nao suportada neste navegador.");
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      const host = window.location.hostname.toLowerCase();
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
      if (!isLocalhost) {
        setAlertFeedback("Geolocalizacao exige HTTPS no celular.");
        return;
      }
    }

    setIsRequestingAlertLocation(true);
    setAlertFeedback("Capturando sua localizacao...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const fallbackLabel = formatCoordinates(lat, lng);

        setAlertDraft((prev) => ({
          ...prev,
          locationLat: lat,
          locationLng: lng,
          locationLabel: prev.locationLabel || fallbackLabel,
        }));

        const resolved = await reverseGeocodeLabel(lat, lng);
        if (resolved) {
          setAlertDraft((prev) => ({
            ...prev,
            locationLabel: resolved,
          }));
        }

        setIsRequestingAlertLocation(false);
        setAlertFeedback("Localizacao capturada. Agora salve para receber alertas proximos.");
      },
      () => {
        setIsRequestingAlertLocation(false);
        setAlertFeedback("Nao foi possivel obter sua localizacao. Verifique a permissao do navegador.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 12000,
      },
    );
  }

  async function handleSaveAlertSettings() {
    if (alertDraft.receiveLostAlerts && (alertDraft.locationLat === null || alertDraft.locationLng === null)) {
      setAlertFeedback("Defina sua localizacao para receber alertas de pets perdidos proximos.");
      return;
    }

    setIsSavingAlertSettings(true);
    const result = await updateCurrentOwnerAlertSettings({
      receiveLostAlerts: alertDraft.receiveLostAlerts,
      radiusKm: alertDraft.radiusKm,
      locationLat: alertDraft.locationLat,
      locationLng: alertDraft.locationLng,
      locationLabel: alertDraft.locationLabel,
    });
    setIsSavingAlertSettings(false);

    setAlertFeedback(
      result.message ??
        (result.ok ? "Preferencias de alerta salvas com sucesso." : "Nao foi possivel salvar os alertas."),
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      <section className="min-w-0 w-full max-w-full rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Painel do tutor</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-white sm:text-4xl">
                Bem-vinda, {currentOwner.fullName}
              </h1>
              <span className="rounded-full border border-cyan-300/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">
                Plano {planLabel}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              Gerencie seus pets, tags NFC e acompanhe cada acesso em tempo real.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-3">
            <Link
              href="/pets/new"
              className="rounded-full bg-white px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-cyan-200 sm:px-5 sm:text-sm sm:tracking-[0.14em]"
            >
              Novo Pet
            </Link>
            <Link
              href="/plans"
              className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-500/20 sm:px-5 sm:text-sm sm:tracking-[0.14em]"
            >
              Ver Planos
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/20 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-zinc-100 transition hover:bg-white/10 sm:px-5 sm:text-sm sm:tracking-[0.14em]"
            >
              Ver Site
            </Link>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 w-full max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Total de pets</p>
          <p className="mt-2 text-3xl font-semibold text-white">{currentOwnerPets.length}</p>
        </div>
        <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-rose-200">Pets perdidos</p>
          <p className="mt-2 text-3xl font-semibold text-rose-100">{lostPetsCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Acessos NFC</p>
          <p className="mt-2 text-3xl font-semibold text-white">{nfcScans}</p>
          <p className="mt-1 text-xs text-zinc-400">Total geral {totalScans}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-cyan-100">Tags NFC ativas</p>
          <p className="mt-2 text-3xl font-semibold text-cyan-50">
            {currentOwnerTags.filter((tag) => tag.status === "active").length}
          </p>
        </div>
      </section>

      {!isProPlan ? (
        <section className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Plano Start ativo: voce pode manter perfis basicos e receber alertas de pets perdidos proximos.
          Para disparar o modo perdido, liberar galeria e dados medicos, faca upgrade em Planos.
        </section>
      ) : null}

      {statusFeedback ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
          {statusFeedback}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Privacidade LGPD</p>
        <p className="mt-2 text-zinc-300">
          Se desejar encerrar a conta, voce pode solicitar a exclusao dos seus dados pessoais.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handleRequestDataDeletion();
            }}
            disabled={isSubmittingDeleteRequest}
            className="rounded-full border border-rose-300/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmittingDeleteRequest
              ? "Enviando..."
              : "Solicitar exclusao dos meus dados"}
          </button>
          {privacyFeedback ? <p className="text-xs text-zinc-300">{privacyFeedback}</p> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-300/25 bg-cyan-500/10 p-5 text-sm text-zinc-200 backdrop-blur sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Rede de alerta</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
              Receber pets perdidos perto de mim
            </h2>
            <p className="mt-1 text-sm text-cyan-50/85">
              Qualquer tutor cadastrado pode receber aviso quando um pet perdido estiver no raio configurado.
            </p>
          </div>
          <span className="rounded-full border border-cyan-200/35 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50">
            Gratis para todos
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
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
            <span className="text-zinc-100">Quero receber notificacoes de pets perdidos proximos</span>
          </label>

          <label className="grid gap-2 text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-cyan-200">Raio de alerta (km)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={alertDraft.radiusKm}
              onChange={(event) =>
                setAlertDraft((prev) => ({
                  ...prev,
                  radiusKm: Math.min(50, Math.max(1, Number(event.target.value) || 5)),
                }))
              }
              className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <button
            type="button"
            onClick={() => {
              void handleUseAlertLocation();
            }}
            disabled={isRequestingAlertLocation}
            className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-50 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRequestingAlertLocation ? "Localizando..." : "Usar minha localizacao atual"}
          </button>

          <label className="grid gap-2 text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-cyan-200">Referencia da localizacao</span>
            <input
              type="text"
              value={alertDraft.locationLabel}
              onChange={(event) =>
                setAlertDraft((prev) => ({
                  ...prev,
                  locationLabel: event.target.value,
                }))
              }
              placeholder="Ex: Centro, Sao Paulo"
              className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60"
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-cyan-50/75">
          Coordenadas:{" "}
          {alertDraft.locationLat !== null && alertDraft.locationLng !== null
            ? formatCoordinates(alertDraft.locationLat, alertDraft.locationLng)
            : "nao definidas"}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handleSaveAlertSettings();
            }}
            disabled={isSavingAlertSettings}
            className="rounded-full bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingAlertSettings ? "Salvando..." : "Salvar alertas"}
          </button>
          {alertFeedback ? <p className="text-sm text-cyan-50/90">{alertFeedback}</p> : null}
        </div>

        {!isProPlan ? (
          <p className="mt-3 text-xs text-cyan-50/75">
            Receber alertas fica liberado no Start. O plano Pro continua necessario para marcar seu pet
            como perdido e disparar o aviso para a rede.
          </p>
        ) : null}
      </section>

      <section className="min-w-0 w-full max-w-full rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-white">Notificacoes</h2>
          <button
            type="button"
            onClick={markAllNotificationsRead}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
          >
            Marcar todas como lidas
          </button>
        </div>

        <div className="grid gap-2">
          {state.notifications
            .filter((item) => item.ownerId === currentOwner.id)
            .slice(0, 8)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => markNotificationRead(item.id)}
                className={[
                  "min-w-0 rounded-2xl border px-4 py-3 text-left transition",
                  item.read
                    ? "border-white/10 bg-white/5 text-zinc-400"
                    : "border-cyan-300/35 bg-cyan-500/10 text-cyan-50",
                ].join(" ")}
              >
                <p className="break-words text-sm">{item.message}</p>
                <p className="mt-1 text-xs opacity-75">{formatDateTime(item.createdAt)}</p>
              </button>
            ))}

          {state.notifications.filter((item) => item.ownerId === currentOwner.id).length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm text-zinc-400">
              Sem notificacoes ainda. Alertas de pet perdido e acessos via NFC aparecerao aqui.
            </p>
          )}
        </div>

        <div className="mt-4">
          <PushNotificationCard />
        </div>
      </section>

      <section className="grid min-w-0 w-full max-w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {currentOwnerPets.map((pet) => {
          const tag = getTagByPetId(pet.id);

          return (
            <article
              key={pet.id}
              className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/30"
            >
              <img src={pet.avatarUrl} alt={pet.name} className="h-48 w-full rounded-2xl object-cover" />
              <div className="mt-4 flex min-w-0 items-start justify-between gap-2">
                <h3 className="min-w-0 break-words text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {pet.name}
                </h3>
                <StatusPill status={pet.status} />
              </div>
              <p className="mt-2 max-h-11 overflow-hidden break-words text-sm text-zinc-300">{pet.bio}</p>

              <div className="mt-3 break-all rounded-2xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                {tag ? `Codigo NFC: ${tag.code}` : "Sem tag NFC vinculada"}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Link
                  href={`/pets/${pet.id}/edit`}
                  className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.1em] text-zinc-200 transition hover:bg-white/10 sm:tracking-[0.14em]"
                >
                  Editar
                </Link>
                <Link
                  href={`/p/${pet.slug}?source=direct`}
                  target="_blank"
                  className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.1em] text-zinc-200 transition hover:bg-white/10 sm:tracking-[0.14em]"
                >
                  Perfil Publico
                </Link>

                {tag ? (
                  <Link
                    href={`/t/${tag.code}`}
                    target="_blank"
                    className="col-span-2 rounded-xl border border-cyan-300/35 bg-cyan-500/15 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.1em] text-cyan-50 transition hover:bg-cyan-500/25 sm:tracking-[0.14em]"
                  >
                    Abrir link NFC
                  </Link>
                ) : (
                    <button
                      type="button"
                      onClick={() => openNfcLinkFlow(pet.id, pet.name)}
                      className="col-span-2 rounded-xl border border-dashed border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.1em] text-cyan-100 transition hover:bg-cyan-500/20 sm:tracking-[0.14em]"
                    >
                      Vincular Tag NFC
                    </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleStatusChange(pet.id, "safe");
                  }}
                  disabled={!isProPlan}
                  className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Em Casa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLostModeModal({
                      petId: pet.id,
                      petName: pet.name,
                      reward: pet.reward ?? "",
                    });
                  }}
                  disabled={!isProPlan}
                  className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Perdido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleStatusChange(pet.id, "found");
                  }}
                  disabled={!isProPlan}
                  className="rounded-xl border border-sky-400/35 bg-sky-500/10 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Encontrado
                </button>
              </div>

              {!isProPlan ? (
                <p className="mt-2 text-xs text-zinc-400">Modo perdido e alertas avancados: apenas plano Pro.</p>
              ) : null}
            </article>
          );
        })}
      </section>

      {currentOwnerPets.length === 0 && (
        <section className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-zinc-300">
          <p className="text-lg font-semibold text-white">Nenhum pet cadastrado ainda.</p>
          <p className="mt-2 text-sm">Crie o primeiro perfil inteligente para ativar sua tag NFC.</p>
          <Link
            href="/pets/new"
            className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
          >
            Cadastrar Pet
          </Link>
        </section>
      )}

      <section className="min-w-0 w-full max-w-full rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">Minhas tags NFC</h2>
        <div className="mt-4 w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm text-zinc-300">
            <thead className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Codigo NFC</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Pet</th>
                <th className="px-3 py-2">Acesso</th>
              </tr>
            </thead>
            <tbody>
              {currentOwnerTags.map((tag) => {
                const linkedPet = tag.petId ? getPetById(tag.petId) : null;

                return (
                  <tr key={tag.id} className="border-t border-white/10">
                    <td className="px-3 py-3 font-semibold text-cyan-100">{tag.code}</td>
                    <td className="px-3 py-3 uppercase">{tag.status}</td>
                    <td className="px-3 py-3">{linkedPet?.name ?? "Nao vinculado"}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/t/${tag.code}`}
                        target="_blank"
                        className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.12em]"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {currentOwnerTags.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={4}>
                    Nenhuma tag NFC ativa nesta conta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="min-w-0 w-full max-w-full rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">Historico de acessos NFC</h2>
        <div className="mt-4 w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm text-zinc-300">
            <thead className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Pet</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {ownerScanEvents.slice(0, 20).map((event) => (
                <tr key={event.id} className="border-t border-white/10">
                  <td className="px-3 py-3">{event.petName}</td>
                  <td className="px-3 py-3 uppercase">{event.source}</td>
                  <td className="px-3 py-3">{event.viewerLocation || "Nao informado"}</td>
                  <td className="px-3 py-3">{formatDateTime(event.createdAt)}</td>
                </tr>
              ))}
              {ownerScanEvents.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={4}>
                    Ainda nao houve escaneamentos NFC.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {lostModeModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-300/35 bg-zinc-950/95 p-6 shadow-2xl shadow-black/70 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.14em] text-rose-200">Modo perdido</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Ativar alerta para {lostModeModal.petName}
            </h3>
            <p className="mt-2 text-sm text-zinc-300">
              Defina uma recompensa opcional para destacar no perfil publico e incentivar o contato rapido.
            </p>

            <label className="mt-5 grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Recompensa (opcional)</span>
              <input
                type="text"
                value={lostModeModal.reward}
                onChange={(event) =>
                  setLostModeModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          reward: event.target.value,
                        }
                      : prev,
                  )
                }
                placeholder="Ex: R$ 500"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-rose-300/60 focus:bg-white/10"
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setLostModeModal(null)}
                className="rounded-full border border-white/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmLostMode();
                }}
                disabled={isLostModeSubmitting}
                className="rounded-full bg-rose-500 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLostModeSubmitting ? "Ativando..." : "Ativar Modo Perdido"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nfcLinkModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-cyan-300/35 bg-zinc-950/95 p-6 shadow-2xl shadow-black/70 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Vincular tag NFC</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Vincular em {nfcLinkModal.petName}
            </h3>
            <p className="mt-2 text-sm text-zinc-300">
              Digite o Codigo NFC da tag para abrir a tela de vinculacao desse pet.
            </p>

            <label className="mt-5 grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Codigo NFC</span>
              <input
                type="text"
                value={nfcLinkModal.code}
                autoFocus
                onChange={(event) => {
                  const nextValue = event.target.value.toUpperCase().replace(/\s+/g, "");
                  setNfcLinkModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          code: nextValue,
                        }
                      : prev,
                  );
                }}
                placeholder="Ex: PTBR-NFC-010"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
              />
            </label>

            {nfcLinkError ? <p className="mt-3 text-sm text-rose-300">{nfcLinkError}</p> : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setNfcLinkModal(null)}
                className="rounded-full border border-white/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmNfcLink}
                className="rounded-full bg-cyan-500 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-400"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
