"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PetPublicProfile } from "@/components/pet-public-profile";
import { usePetTap } from "@/context/pettap-provider";
import { formatViewerGpsLocation, reverseGeocodeLabel } from "@/lib/geocode-client";
import { normalizeTagCode } from "@/lib/utils";

export default function PublicNfcTagPage() {
  const params = useParams<{ tagCode: string }>();
  const searchParams = useSearchParams();

  const {
    isReady,
    currentOwner,
    currentOwnerPets,
    currentOwnerTags,
    getTagByCode,
    activateNfcTag,
    resolvePetByTagCode,
    recordNfcScanByTag,
  } = usePetTap();

  const [activationCode, setActivationCode] = useState("");
  const [petId, setPetId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tagCode = normalizeTagCode(params.tagCode);
  const manualLocation = searchParams.get("loc");
  const [detectedLocation, setDetectedLocation] = useState("");
  const [detectedLocationReady, setDetectedLocationReady] = useState(false);
  const location = manualLocation ?? detectedLocation;
  const locationReady = manualLocation ? true : detectedLocationReady;

  const tag = useMemo(() => getTagByCode(tagCode), [getTagByCode, tagCode]);
  const pet = useMemo(() => resolvePetByTagCode(tagCode), [resolvePetByTagCode, tagCode]);
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
  const selectedPetId = petId || eligiblePets[0]?.id || "";

  const recordedRef = useRef<string>("");

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

    if (!activationCode.trim()) {
      setFeedback("Informe o codigo de ativacao da tag.");
      return;
    }

    setIsSubmitting(true);
    const result = await activateNfcTag({
      tagCode,
      activationCode,
      petId: selectedPetId,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setFeedback(result.message ?? "Nao foi possivel ativar a tag.");
      return;
    }

    setFeedback(result.message ?? "Tag ativada e vinculada com sucesso. Recarregue se necessario.");
  }

  if (!isReady) {
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
        <p className="mt-3 text-sm text-zinc-400">Verifique o codigo da tag e tente novamente.</p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Ir para PETTAPBR
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
        <PetPublicProfile pet={pet} />
      </div>
    );
  }

  if (!currentOwner) {
    const nextUrl = encodeURIComponent(`/t/${tag.code}`);

    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-200 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Ativacao de tag NFC</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Tag {tag.code} aguardando vinculacao</h1>
        <p className="mt-3 text-sm text-zinc-300">
          Esta tag ainda nao esta associada a um pet. Entre na sua conta para ativar e vincular.
        </p>
        <Link
          href={`/login?next=${nextUrl}`}
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Entrar para ativar
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
          Para ativar a tag {tag.code}, primeiro desvincule uma tag existente no painel administrativo.
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
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Ativacao de tag NFC</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Vincular tag {tag.code}</h1>
      <p className="mt-3 text-sm text-zinc-300">
        Informe o codigo de ativacao da tag e selecione o pet que recebera esta identificacao NFC.
      </p>

      <form className="mt-6 grid gap-4" onSubmit={handleActivate}>
        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Codigo de ativacao</span>
          <input
            type="text"
            value={activationCode}
            onChange={(event) => setActivationCode(event.target.value)}
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
          {isSubmitting ? "Ativando..." : "Ativar tag NFC"}
        </button>
      </form>
    </section>
  );
}
