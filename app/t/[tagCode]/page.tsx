"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PetPublicProfile } from "@/components/pet-public-profile";
import { usePetTap } from "@/context/pettap-provider";
import { formatViewerGpsLocation, reverseGeocodeLabel } from "@/lib/geocode-client";
import { isOwnerPro } from "@/lib/owner-defaults";
import type { NfcTag, NfcTagStatus, Pet } from "@/lib/types";
import { normalizeTagCode } from "@/lib/utils";

interface PublicTagResponse {
  ok: boolean;
  message?: string;
  tag?: Pick<NfcTag, "id" | "code" | "ownerId" | "petId" | "status"> | null;
  pet?: Pet | null;
  ownerName?: string;
  isPremiumPlan?: boolean;
  profilePrivate?: boolean;
}

export default function PublicNfcTagPage() {
  const params = useParams<{ tagCode: string }>();
  const searchParams = useSearchParams();

  const {
    isReady,
    state,
    currentOwner,
    currentOwnerPets,
    currentOwnerTags,
    getTagByCode,
    activateNfcTag,
    resolvePetByTagCode,
    recordNfcScanByTag,
  } = usePetTap();

  const [nfcCodeInput, setNfcCodeInput] = useState("");
  const [petId, setPetId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remoteTagResult, setRemoteTagResult] = useState<{
    code: string;
    tag: NfcTag | null;
    pet: Pet | null;
    ownerName: string;
    isPremiumPlan: boolean;
    profilePrivate: boolean;
  } | null>(null);

  const tagCode = normalizeTagCode(params.tagCode);
  const manualLocation = searchParams.get("loc");
  const preferredPetId = searchParams.get("pet") ?? "";
  const [detectedLocation, setDetectedLocation] = useState("");
  const [detectedLocationReady, setDetectedLocationReady] = useState(false);
  const location = manualLocation ?? detectedLocation;
  const locationReady = manualLocation ? true : detectedLocationReady;

  const localTag = useMemo(() => getTagByCode(tagCode), [getTagByCode, tagCode]);
  const localPet = useMemo(() => resolvePetByTagCode(tagCode), [resolvePetByTagCode, tagCode]);
  const hasRemoteTagForCode = remoteTagResult?.code === tagCode;
  const remoteTag = hasRemoteTagForCode ? (remoteTagResult?.tag ?? null) : null;
  const tag = localTag ?? remoteTag;
  const isProfilePrivate = Boolean(!localPet && hasRemoteTagForCode && remoteTagResult?.profilePrivate);
  const isTagResolved = !isReady ? false : Boolean(localTag) || hasRemoteTagForCode;
  const remotePet = hasRemoteTagForCode ? (remoteTagResult?.pet ?? null) : null;
  const pet = localPet ?? remotePet;
  const isPetResolved = !isReady ? false : !isTagResolved ? true : Boolean(localPet) || hasRemoteTagForCode;
  const eligiblePets = useMemo(() => {
    const linkedPetIds = new Set<string>();

    for (const linkedTag of currentOwnerTags) {
      if (!linkedTag.petId) {
        continue;
      }

      if (tag && linkedTag.id === tag.id) {
        continue;
      }

      linkedPetIds.add(linkedTag.petId);
    }

    return currentOwnerPets.filter((petOption) => !linkedPetIds.has(petOption.id));
  }, [currentOwnerPets, currentOwnerTags, tag]);
  const selectedPetId = (() => {
    if (petId && eligiblePets.some((petOption) => petOption.id === petId)) {
      return petId;
    }

    if (preferredPetId && eligiblePets.some((petOption) => petOption.id === preferredPetId)) {
      return preferredPetId;
    }

    return eligiblePets[0]?.id || "";
  })();

  const localOwner = pet?.ownerId ? (state.owners.find((owner) => owner.id === pet.ownerId) ?? null) : null;
  const localOwnerName = localOwner?.fullName ?? "";
  const localOwnerIsPremium = isOwnerPro(localOwner);
  const remoteOwnerName = hasRemoteTagForCode ? (remoteTagResult?.ownerName ?? "") : "";
  const remoteOwnerIsPremium = hasRemoteTagForCode ? Boolean(remoteTagResult?.isPremiumPlan) : false;
  const ownerName = localOwnerName || remoteOwnerName || "Tutor";
  const isPremiumPlan = localOwner ? localOwnerIsPremium : remoteOwnerIsPremium;

  const recordedRef = useRef<string>("");

  useEffect(() => {
    if (!isReady || localTag) {
      return;
    }

    let isMounted = true;

    async function fetchTagByCode() {
      try {
        const response = await fetch(`/api/public/tag?tagCode=${encodeURIComponent(tagCode)}`);
        const payload = (await response.json()) as PublicTagResponse;

        if (!isMounted) {
          return;
        }

        if (!response.ok || !payload.ok) {
          setRemoteTagResult({
            code: tagCode,
            tag: null,
            pet: null,
            ownerName: "Tutor",
            isPremiumPlan: false,
            profilePrivate: false,
          });
          return;
        }

        setRemoteTagResult({
          code: tagCode,
          tag: payload.tag
            ? {
                id: payload.tag.id,
                code: normalizeTagCode(payload.tag.code),
                activationCode: "",
                ownerId: payload.tag.ownerId ?? null,
                petId: payload.tag.petId ?? null,
                status: payload.tag.status as NfcTagStatus,
                createdAt: "",
                updatedAt: "",
              }
            : null,
          pet: payload.pet ?? null,
          ownerName: (payload.ownerName ?? "Tutor").trim() || "Tutor",
          isPremiumPlan: Boolean(payload.isPremiumPlan),
          profilePrivate: Boolean(payload.profilePrivate),
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setRemoteTagResult({
          code: tagCode,
          tag: null,
          pet: null,
          ownerName: "Tutor",
          isPremiumPlan: false,
          profilePrivate: false,
        });
      }
    }

    void fetchTagByCode();

    return () => {
      isMounted = false;
    };
  }, [isReady, localTag, tagCode]);

  useEffect(() => {
    if (!pet) {
      return;
    }

    if (manualLocation) {
      return;
    }

    let isMounted = true;

    if (!navigator.geolocation) {
      const fallbackTimer = setTimeout(() => {
        if (!isMounted) {
          return;
        }

        setDetectedLocation("Nao informado");
        setDetectedLocationReady(true);
      }, 0);

      return () => {
        clearTimeout(fallbackTimer);
        isMounted = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!isMounted) {
          return;
        }

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const fallback = formatViewerGpsLocation(lat, lng);
        const resolved = await reverseGeocodeLabel(lat, lng);

        if (!isMounted) {
          return;
        }

        setDetectedLocation(resolved ?? fallback);
        setDetectedLocationReady(true);
      },
      () => {
        if (!isMounted) {
          return;
        }

        setDetectedLocation("Nao informado");
        setDetectedLocationReady(true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 12000,
      },
    );

    return () => {
      isMounted = false;
    };
  }, [manualLocation, pet]);

  useEffect(() => {
    if (!isReady || !pet || !locationReady) {
      return;
    }

    const key = `${tagCode}-${location}`;
    if (recordedRef.current === key) {
      return;
    }

    recordNfcScanByTag(tagCode, location);
    recordedRef.current = key;
  }, [isReady, location, locationReady, pet, recordNfcScanByTag, tagCode]);

  async function handleActivate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPetId) {
      setFeedback("Selecione um pet para vincular a tag NFC.");
      return;
    }

    const normalizedInputCode = normalizeTagCode(nfcCodeInput);

    if (!normalizedInputCode) {
      setFeedback("Informe o Codigo NFC da tag.");
      return;
    }

    if (normalizedInputCode !== tagCode) {
      setFeedback("Codigo NFC informado nao confere com esta tag.");
      return;
    }

    setIsSubmitting(true);
    const result = await activateNfcTag({
      tagCode,
      activationCode: normalizedInputCode,
      petId: selectedPetId,
    }).finally(() => {
      setIsSubmitting(false);
    });

    if (!result.ok) {
      setFeedback(result.message ?? "Nao foi possivel ativar a tag.");
      return;
    }

    setFeedback(result.message ?? "Tag ativada e vinculada com sucesso. Recarregue se necessario.");
  }

  if (!isReady || !isTagResolved || !isPetResolved) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-300 backdrop-blur">
        Carregando tag NFC...
      </div>
    );
  }

  if (!tag) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-200">
        <h1 className="text-3xl font-semibold text-white">Tag NFC nao encontrada</h1>
        <p className="mt-3 text-sm text-zinc-400">Verifique o Codigo NFC da tag e tente novamente.</p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Ir para PetTapBR
        </Link>
      </section>
    );
  }

  if (pet) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3 text-xs uppercase tracking-[0.16em] text-cyan-100">
          Acesso detectado por NFC | Tag: {tag.code} | Local: {locationReady ? location : "Localizando..."}
        </div>
        <PetPublicProfile pet={pet} ownerName={ownerName} isPremiumPlan={isPremiumPlan} />
      </div>
    );
  }

  if (tag && isProfilePrivate) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-200 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Tag NFC ativa</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Perfil privado</h1>
        <p className="mt-3 text-sm text-zinc-300">
          O tutor manteve este perfil privado para proteger dados sensiveis.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Ir para PetTapBR
        </Link>
      </section>
    );
  }

  if (!currentOwner) {
    const nextUrl = encodeURIComponent(`/t/${tag.code}`);

    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-200 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Vinculacao de tag NFC</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Tag {tag.code} aguardando vinculacao</h1>
        <p className="mt-3 text-sm text-zinc-300">
          Esta tag ainda nao esta associada a um pet. Entre na sua conta para concluir a vinculacao.
        </p>
        <Link
          href={`/login?next=${nextUrl}`}
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Entrar para vincular
        </Link>
      </section>
    );
  }

  if (currentOwnerPets.length === 0) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-200 backdrop-blur">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Voce ainda nao tem pets cadastrados</h1>
        <p className="mt-3 text-sm text-zinc-300">Cadastre um pet para vincular a tag {tag.code}.</p>
        <Link
          href="/pets/new"
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Cadastrar pet
        </Link>
      </section>
    );
  }

  if (eligiblePets.length === 0) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-200 backdrop-blur">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Todos os pets ja possuem tag NFC</h1>
        <p className="mt-3 text-sm text-zinc-300">
          Para vincular a tag {tag.code}, primeiro desvincule uma tag existente no painel administrativo.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Ir para dashboard
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-200 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Vinculacao de tag NFC</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Vincular tag {tag.code}</h1>
      <p className="mt-3 text-sm text-zinc-300">
        Confirme o Codigo NFC da tag e selecione o pet que recebera esta vinculacao.
      </p>

      <form className="mt-6 grid gap-4" onSubmit={handleActivate}>
        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Codigo NFC</span>
          <input
            type="text"
            value={nfcCodeInput}
            onChange={(event) => setNfcCodeInput(event.target.value)}
            placeholder={tag.code}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
          />
        </label>

        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Pet para vincular</span>
          <select
            value={selectedPetId}
            onChange={(event) => setPetId(event.target.value)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
          >
            {eligiblePets.map((petOption) => (
              <option key={petOption.id} value={petOption.id} className="bg-zinc-900 text-white">
                {petOption.name}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm text-zinc-400">{feedback}</p>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-fit rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Vinculando..." : "Vincular tag NFC"}
        </button>
      </form>
    </section>
  );
}
