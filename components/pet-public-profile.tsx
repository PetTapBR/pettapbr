"use client";

import { useMemo, useState } from "react";

import type { Pet } from "@/lib/types";
import { buildGoogleMapsUrl, getStatusMeta, getYouTubeEmbed } from "@/lib/utils";

function phoneToDigits(phone: string) {
  return phone.replace(/\D+/g, "");
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">{title}</p>
      <p className="mt-1 text-sm font-medium text-zinc-100">{value || "Nao informado"}</p>
    </div>
  );
}

export function PetPublicProfile({
  pet,
  ownerName,
  isPremiumPlan = true,
}: {
  pet: Pet;
  ownerName?: string;
  isPremiumPlan?: boolean;
}) {
  const [shareFeedback, setShareFeedback] = useState("");

  const statusMeta = useMemo(() => getStatusMeta(pet.status), [pet.status]);
  const locationUrl = useMemo(
    () => pet.locationUrl || buildGoogleMapsUrl(pet.locationLat, pet.locationLng),
    [pet.locationLat, pet.locationLng, pet.locationUrl],
  );
  const tutorName = (ownerName ?? "Tutor").trim() || "Tutor";
  const whatsappDigits = phoneToDigits(pet.whatsapp);
  const whatsappUrl = `https://wa.me/${whatsappDigits}?text=Oi%2C+acabei+de+acessar+o+perfil+do+${encodeURIComponent(pet.name)}.`;
  const callUrl = `tel:${phoneToDigits(pet.phone || pet.whatsapp)}`;
  const showPremiumSections = isPremiumPlan;

  async function shareLocation() {
    if (!whatsappDigits) {
      setShareFeedback("WhatsApp do tutor nao informado.");
      return;
    }

    const fallbackLocationUrl = locationUrl || "";
    setShareFeedback("Obtendo sua localizacao...");

    const currentLocationUrl = await new Promise<string>((resolve) => {
      if (!navigator.geolocation) {
        resolve("");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(buildGoogleMapsUrl(position.coords.latitude, position.coords.longitude));
        },
        () => {
          resolve("");
        },
        {
          enableHighAccuracy: true,
          maximumAge: 60000,
          timeout: 12000,
        },
      );
    });

    const finalLocationUrl = currentLocationUrl || fallbackLocationUrl;
    if (!finalLocationUrl) {
      setShareFeedback("Nao foi possivel obter a localizacao para compartilhar.");
      return;
    }

    const message = `Ola ${tutorName}, encontrei ${pet.name}. Segue a localizacao dele: ${finalLocationUrl}`;
    const shareUrl = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setShareFeedback("Abrindo WhatsApp com a localizacao.");
  }

  const lostMode = showPremiumSections && pet.status === "lost";

  return (
    <section
      className={[
        "relative overflow-hidden rounded-[2rem] border p-5 shadow-2xl backdrop-blur-xl sm:p-8",
        lostMode
          ? "border-rose-500/45 bg-gradient-to-b from-rose-700/30 via-rose-950/70 to-zinc-950"
          : "border-white/10 bg-gradient-to-b from-zinc-900/70 via-zinc-950/90 to-zinc-950",
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-none absolute inset-0 opacity-70",
          lostMode
            ? "bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.35),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(251,113,133,0.2),transparent_45%)]"
            : "bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.12),transparent_45%)]",
        ].join(" ")}
      />

      <div className="relative z-10 grid gap-6">
        {lostMode && (
          <div className="rounded-2xl border border-rose-300/50 bg-rose-500/20 p-4 text-rose-50">
            <p className="text-lg font-bold uppercase tracking-[0.2em]">PET PERDIDO</p>
            <p className="mt-1 text-sm text-rose-100">
              Se voce viu {pet.name}, entre em contato imediatamente pelos botoes abaixo.
            </p>
            {pet.reward ? (
              <p className="mt-3 inline-flex rounded-full border border-rose-200/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                Recompensa: {pet.reward}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <img
            src={pet.avatarUrl}
            alt={`Foto de ${pet.name}`}
            className="size-34 rounded-[1.8rem] border border-white/20 object-cover shadow-xl shadow-black/60 sm:size-40"
          />
          <div className="flex-1">
            <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">{pet.name}</h1>
            {showPremiumSections ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">{pet.bio}</p>
            ) : (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                Perfil basico PetTapBR.
              </p>
            )}
          </div>
        </div>

        <div
          className={[
            "rounded-2xl border px-4 py-3",
            lostMode
              ? "border-rose-300/55 bg-rose-500/20 text-rose-50"
              : "border-cyan-300/35 bg-cyan-500/10 text-cyan-100",
          ].join(" ")}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Urgente</p>
          <p className="mt-1 text-sm">
            Se encontrou este pet, toque em WhatsApp imediatamente.
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.14em] opacity-80">Protegido por PetTapBR</p>
        </div>

        <div className={showPremiumSections ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-emerald-300/40 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-500/25"
          >
            WhatsApp
          </a>
          <a
            href={callUrl}
            className="rounded-2xl border border-sky-300/40 bg-sky-500/15 px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-sky-100 transition hover:bg-sky-500/25"
          >
            Ligar Agora
          </a>
          {showPremiumSections ? (
            <button
              type="button"
              onClick={shareLocation}
              className="rounded-2xl border border-violet-300/40 bg-violet-500/15 px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-violet-100 transition hover:bg-violet-500/25"
            >
              ENVIAR MINHA LOCALIZACAO
            </button>
          ) : null}
        </div>

        {showPremiumSections ? <p className="text-xs text-zinc-400">{shareFeedback}</p> : null}

        {showPremiumSections ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <InfoCard title="Idade" value={pet.age} />
            <InfoCard title="Raca" value={pet.breed} />
            <InfoCard title="Peso" value={pet.weight} />
            <InfoCard title="Cidade" value={pet.city} />
            <InfoCard title="Localizacao" value={pet.locationLabel} />
          </div>
        ) : null}

        {showPremiumSections ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <InfoCard title="Alergias" value={pet.medical.allergies} />
            <InfoCard title="Medicamentos" value={pet.medical.medications} />
            <InfoCard title="Vacinas" value={pet.medical.vaccines} />
          </section>
        ) : null}

        {showPremiumSections ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {pet.gallery.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-zinc-400 sm:col-span-2">
                Sem fotos e videos cadastrados.
              </div>
            ) : (
              pet.gallery.map((media) => {
                if (media.type === "photo") {
                  return (
                    <figure key={media.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      <img src={media.url} alt={media.caption || pet.name} className="h-56 w-full object-cover" />
                      <figcaption className="px-3 py-2 text-xs text-zinc-300">{media.caption}</figcaption>
                    </figure>
                  );
                }

                const youtubeEmbed = getYouTubeEmbed(media.url);

                return (
                  <div key={media.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    {youtubeEmbed ? (
                      <iframe
                        src={youtubeEmbed}
                        title={`${pet.name}-video-${media.id}`}
                        className="h-56 w-full"
                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video src={media.url} className="h-56 w-full object-cover" controls />
                    )}
                    <p className="px-3 py-2 text-xs text-zinc-300">{media.caption}</p>
                  </div>
                );
              })
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
