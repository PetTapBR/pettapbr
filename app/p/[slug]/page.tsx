"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PetPublicProfile } from "@/components/pet-public-profile";
import { usePetTap } from "@/context/pettap-provider";
import { formatViewerGpsLocation, reverseGeocodeLabel } from "@/lib/geocode-client";
import { supabase } from "@/lib/supabase";
import type { ScanSource } from "@/lib/types";

function parseSource(raw: string | null): ScanSource {
  if (raw === "nfc") {
    return raw;
  }

  return "direct";
}

interface OwnerRow {
  id: string;
  full_name: string;
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
  const [remoteOwnerNameResult, setRemoteOwnerNameResult] = useState<{ ownerId: string; name: string } | null>(
    null,
  );
  const location = manualLocation ?? detectedLocation;
  const locationReady = manualLocation ? true : detectedLocationReady;

  const pet = useMemo(() => getPetBySlug(slug), [getPetBySlug, slug]);
  const localOwnerName = pet?.ownerId ? (state.owners.find((owner) => owner.id === pet.ownerId)?.fullName ?? "") : "";
  const remoteOwnerName =
    pet?.ownerId && remoteOwnerNameResult?.ownerId === pet.ownerId ? remoteOwnerNameResult.name : "";
  const ownerName = localOwnerName || remoteOwnerName || "Tutor";
  const recordedRef = useRef<string>("");

  useEffect(() => {
    if (!pet?.ownerId || localOwnerName || !supabase) {
      return;
    }

    if (remoteOwnerNameResult?.ownerId === pet.ownerId) {
      return;
    }

    const supabaseClient = supabase;
    const ownerId = pet.ownerId;
    let isMounted = true;

    async function fetchOwnerName() {
      const { data, error } = await supabaseClient
        .from("owners")
        .select("id, full_name")
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

      setRemoteOwnerNameResult({
        ownerId: row.id,
        name: row.full_name || "Tutor",
      });
    }

    void fetchOwnerName();

    return () => {
      isMounted = false;
    };
  }, [localOwnerName, pet?.ownerId, remoteOwnerNameResult?.ownerId]);

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

    const key = `${slug}-${source}-${location}`;

    if (recordedRef.current === key) {
      return;
    }

    recordScan(slug, source, location);
    recordedRef.current = key;
  }, [isReady, location, locationReady, pet, recordScan, slug, source]);

  if (!isReady) {
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
          Ir para PETTAPBR
        </Link>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.16em] text-zinc-300">
        Acesso detectado por {source.toUpperCase()} | Local: {locationReady ? location : "Localizando..."}
      </div>
      <PetPublicProfile pet={pet} ownerName={ownerName} />
    </div>
  );
}
