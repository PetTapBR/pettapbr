"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PetPublicProfile } from "@/components/pet-public-profile";
import { usePetTap } from "@/context/pettap-provider";
import { formatViewerGpsLocation, reverseGeocodeLabel } from "@/lib/geocode-client";
import { supabase } from "@/lib/supabase";
import type { NfcTag, NfcTagStatus, Pet } from "@/lib/types";
import { normalizeTagCode } from "@/lib/utils";

interface NfcTagRow {
  id: string;
  code: string;
  activation_code: string;
  owner_id: string | null;
  pet_id: string | null;
  status: NfcTagStatus;
  created_at: string;
  updated_at: string;
}

interface PetRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  bio: string;
  age: string;
  breed: string;
  weight: string;
  city: string;
  avatar_url: string;
  whatsapp: string;
  phone: string;
  location_url: string;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string;
  reward: string;
  status: "safe" | "lost" | "found";
  allergies: string;
  medications: string;
  vaccines: string;
  created_at: string;
  updated_at: string;
}

interface PetMediaRow {
  id: string;
  pet_id: string;
  media_type: "photo" | "video";
  url: string;
  caption: string;
}

function mapTagRow(row: NfcTagRow): NfcTag {
  return {
    id: row.id,
    code: normalizeTagCode(row.code),
    activationCode: (row.activation_code ?? "").trim().toUpperCase(),
    ownerId: row.owner_id,
    petId: row.pet_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPetRow(row: PetRow, mediaRows: PetMediaRow[]): Pet {
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    bio: row.bio,
    age: row.age,
    breed: row.breed,
    weight: row.weight,
    city: row.city,
    avatarUrl: row.avatar_url,
    whatsapp: row.whatsapp,
    phone: row.phone,
    locationUrl: row.location_url,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    locationLabel: row.location_label,
    reward: row.reward,
    status: row.status,
    medical: {
      allergies: row.allergies,
      medications: row.medications,
      vaccines: row.vaccines,
    },
    gallery: mediaRows.map((media) => ({
      id: media.id,
      type: media.media_type,
      url: media.url,
      caption: media.caption,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  const [remoteTagResult, setRemoteTagResult] = useState<{ code: string; tag: NfcTag | null } | null>(
    null,
  );
  const [remotePetResult, setRemotePetResult] = useState<{ petId: string; pet: Pet | null } | null>(
    null,
  );

  const tagCode = normalizeTagCode(params.tagCode);
  const manualLocation = searchParams.get("loc");
  const [detectedLocation, setDetectedLocation] = useState("");
  const [detectedLocationReady, setDetectedLocationReady] = useState(false);
  const location = manualLocation ?? detectedLocation;
  const locationReady = manualLocation ? true : detectedLocationReady;

  const localTag = useMemo(() => getTagByCode(tagCode), [getTagByCode, tagCode]);
  const localPet = useMemo(() => resolvePetByTagCode(tagCode), [resolvePetByTagCode, tagCode]);
  const hasRemoteTagForCode = remoteTagResult?.code === tagCode;
  const remoteTag = hasRemoteTagForCode ? (remoteTagResult?.tag ?? null) : null;
  const tag = localTag ?? remoteTag;
  const isTagResolved = !isReady ? false : Boolean(localTag) || hasRemoteTagForCode || !supabase;

  const needsRemotePetLookup = Boolean(tag && tag.status === "active" && tag.petId && !localPet);
  const hasRemotePetForTag = Boolean(tag?.petId && remotePetResult?.petId === tag.petId);
  const remotePet = hasRemotePetForTag ? (remotePetResult?.pet ?? null) : null;
  const pet = localPet ?? remotePet;
  const isPetResolved = !isReady
    ? false
    : !isTagResolved || !needsRemotePetLookup
      ? true
      : hasRemotePetForTag || !supabase;
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
    if (!isReady || localTag || !supabase) {
      return;
    }

    const supabaseClient = supabase;
    let isMounted = true;

    async function fetchTagByCode() {
      const { data, error } = await supabaseClient
        .from("nfc_tags")
        .select("id, code, activation_code, owner_id, pet_id, status, created_at, updated_at")
        .eq("code", tagCode)
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (error) {
        setRemoteTagResult({
          code: tagCode,
          tag: null,
        });
        return;
      }

      const row = (data?.[0] ?? null) as NfcTagRow | null;
      setRemoteTagResult({
        code: tagCode,
        tag: row ? mapTagRow(row) : null,
      });
    }

    void fetchTagByCode();

    return () => {
      isMounted = false;
    };
  }, [isReady, localTag, tagCode]);

  useEffect(() => {
    if (!isReady || !isTagResolved || !needsRemotePetLookup || !tag?.petId || !supabase) {
      return;
    }

    const supabaseClient = supabase;
    const petIdFromTag = tag.petId;
    let isMounted = true;

    async function fetchPetByTag() {
      const [{ data: petRows, error: petError }, { data: mediaRows, error: mediaError }] =
        await Promise.all([
          supabaseClient
            .from("pets")
            .select(
              "id, owner_id, slug, name, bio, age, breed, weight, city, avatar_url, whatsapp, phone, location_url, location_lat, location_lng, location_label, reward, status, allergies, medications, vaccines, created_at, updated_at",
            )
            .eq("id", petIdFromTag)
            .limit(1),
          supabaseClient.from("pet_media").select("id, pet_id, media_type, url, caption").eq("pet_id", petIdFromTag),
        ]);

      if (!isMounted) {
        return;
      }

      if (petError || mediaError) {
        setRemotePetResult({
          petId: petIdFromTag,
          pet: null,
        });
        return;
      }

      const petRow = (petRows?.[0] ?? null) as PetRow | null;

      if (!petRow) {
        setRemotePetResult({
          petId: petIdFromTag,
          pet: null,
        });
        return;
      }

      const galleryRows = (mediaRows ?? []) as PetMediaRow[];
      setRemotePetResult({
        petId: petIdFromTag,
        pet: mapPetRow(petRow, galleryRows),
      });
    }

    void fetchPetByTag();

    return () => {
      isMounted = false;
    };
  }, [isReady, isTagResolved, needsRemotePetLookup, tag?.petId]);

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
      setFeedback("Informe a Chave de Ativacao da tag.");
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
        Informe a Chave de Ativacao e selecione o pet que recebera este Codigo NFC.
      </p>

      <form className="mt-6 grid gap-4" onSubmit={handleActivate}>
        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Chave de Ativacao</span>
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
