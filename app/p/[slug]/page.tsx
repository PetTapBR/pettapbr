"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PetPublicProfile } from "@/components/pet-public-profile";
import { usePetTap } from "@/context/pettap-provider";
import { formatViewerGpsLocation, reverseGeocodeLabel } from "@/lib/geocode-client";
import { isOwnerPro } from "@/lib/owner-defaults";
import { supabase } from "@/lib/supabase";
import type { Pet, ScanSource } from "@/lib/types";

function parseSource(raw: string | null): ScanSource {
  if (raw === "nfc") {
    return raw;
  }

  return "direct";
}

interface OwnerRow {
  id: string;
  full_name: string;
  plan_tier: "start" | "pro" | null;
  plan_status: "active" | "inactive" | null;
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

export default function PublicPetPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const { isReady, state, getPetBySlug, recordScan } = usePetTap();

  const slug = params.slug;
  const source = parseSource(searchParams.get("source"));
  const manualLocation = searchParams.get("loc");

  const [detectedLocation, setDetectedLocation] = useState("");
  const [detectedLocationReady, setDetectedLocationReady] = useState(false);
  const [remoteOwnerResult, setRemoteOwnerResult] = useState<{
    ownerId: string;
    name: string;
    isPremiumPlan: boolean;
  } | null>(null);
  const [remotePetResult, setRemotePetResult] = useState<{ slug: string; pet: Pet | null } | null>(
    null,
  );
  const location = manualLocation ?? detectedLocation;
  const locationReady = manualLocation ? true : detectedLocationReady;

  const localPet = useMemo(() => getPetBySlug(slug), [getPetBySlug, slug]);
  const hasRemotePetForSlug = remotePetResult?.slug === slug;
  const remotePet = hasRemotePetForSlug ? (remotePetResult?.pet ?? null) : null;
  const pet = localPet ?? remotePet;
  const isPetResolved = !isReady ? false : Boolean(localPet) || hasRemotePetForSlug || !supabase;
  const localOwner = pet?.ownerId ? (state.owners.find((owner) => owner.id === pet.ownerId) ?? null) : null;
  const localOwnerName = localOwner?.fullName ?? "";
  const localOwnerIsPremium = isOwnerPro(localOwner);
  const remoteOwnerName =
    pet?.ownerId && remoteOwnerResult?.ownerId === pet.ownerId ? remoteOwnerResult.name : "";
  const remoteOwnerIsPremium =
    pet?.ownerId && remoteOwnerResult?.ownerId === pet.ownerId ? remoteOwnerResult.isPremiumPlan : false;
  const ownerName = localOwnerName || remoteOwnerName || "Tutor";
  const isPremiumPlan = localOwner ? localOwnerIsPremium : remoteOwnerIsPremium;
  const recordedRef = useRef<string>("");

  useEffect(() => {
    if (!isReady || localPet || !supabase) {
      return;
    }

    if (remotePetResult?.slug === slug) {
      return;
    }

    const supabaseClient = supabase;
    const slugOrId = slug;
    let isMounted = true;

    async function fetchPublicPet() {
      const petColumns =
        "id, owner_id, slug, name, bio, age, breed, weight, city, avatar_url, whatsapp, phone, location_url, location_lat, location_lng, location_label, reward, status, allergies, medications, vaccines, created_at, updated_at";

      const { data: petBySlugRows, error: petBySlugError } = await supabaseClient
        .from("pets")
        .select(petColumns)
        .eq("slug", slugOrId)
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (petBySlugError) {
        setRemotePetResult({
          slug: slugOrId,
          pet: null,
        });
        return;
      }

      let petRow = (petBySlugRows?.[0] ?? null) as PetRow | null;

      if (!petRow) {
        const { data: petByIdRows, error: petByIdError } = await supabaseClient
          .from("pets")
          .select(petColumns)
          .eq("id", slugOrId)
          .limit(1);

        if (!isMounted) {
          return;
        }

        if (petByIdError) {
          setRemotePetResult({
            slug: slugOrId,
            pet: null,
          });
          return;
        }

        petRow = (petByIdRows?.[0] ?? null) as PetRow | null;
      }

      if (!petRow) {
        setRemotePetResult({
          slug: slugOrId,
          pet: null,
        });
        return;
      }

      const { data: mediaRows, error: mediaError } = await supabaseClient
        .from("pet_media")
        .select("id, pet_id, media_type, url, caption")
        .eq("pet_id", petRow.id);

      if (!isMounted) {
        return;
      }

      const galleryRows = mediaError ? [] : ((mediaRows ?? []) as PetMediaRow[]);

      setRemotePetResult({
        slug: slugOrId,
        pet: mapPetRow(petRow, galleryRows),
      });
    }

    void fetchPublicPet();

    return () => {
      isMounted = false;
    };
  }, [isReady, localPet, remotePetResult?.slug, slug]);

  useEffect(() => {
    if (!pet?.ownerId || localOwnerName || !supabase) {
      return;
    }

    if (remoteOwnerResult?.ownerId === pet.ownerId) {
      return;
    }

    const supabaseClient = supabase;
    const ownerId = pet.ownerId;
    let isMounted = true;

    async function fetchOwnerName() {
      const { data, error } = await supabaseClient
        .from("owners")
        .select("id, full_name, plan_tier, plan_status")
        .eq("id", ownerId)
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (error) {
        return;
      }

      const row = (data?.[0] ?? null) as OwnerRow | null;

      if (!row) {
        return;
      }

      setRemoteOwnerResult({
        ownerId: row.id,
        name: row.full_name || "Tutor",
        isPremiumPlan: row.plan_tier === "pro" && row.plan_status !== "inactive",
      });
    }

    void fetchOwnerName();

    return () => {
      isMounted = false;
    };
  }, [localOwnerName, pet?.ownerId, remoteOwnerResult?.ownerId]);

  useEffect(() => {
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
  }, [manualLocation]);

  useEffect(() => {
    if (!isReady || !pet || !locationReady) {
      return;
    }

    const scanSlug = pet.slug || slug;
    const key = `${scanSlug}-${source}-${location}`;

    if (recordedRef.current === key) {
      return;
    }

    recordScan(scanSlug, source, location);
    recordedRef.current = key;
  }, [isReady, location, locationReady, pet, recordScan, slug, source]);

  if (!isReady || !isPetResolved) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-300 backdrop-blur">
        Carregando perfil...
      </div>
    );
  }

  if (!pet) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-200">
        <h1 className="text-3xl font-semibold text-white">Perfil nao encontrado</h1>
        <p className="mt-3 text-sm text-zinc-400">Este link publico nao esta vinculado a um pet valido.</p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Ir para PetTapBR
        </Link>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.16em] text-zinc-300">
        Acesso detectado por {source.toUpperCase()} | Local: {locationReady ? location : "Localizando..."}
      </div>
      <PetPublicProfile pet={pet} ownerName={ownerName} isPremiumPlan={isPremiumPlan} />
    </div>
  );
}
