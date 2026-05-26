import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

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

interface OwnerRow {
  id: string;
  full_name: string;
  plan_tier: "start" | "pro" | null;
  plan_status: "active" | "inactive" | null;
}

function buildNotConfiguredResponse() {
  return NextResponse.json(
    {
      ok: false,
      message: "Supabase server nao configurado.",
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const rateLimit = consumeRateLimit({
    key: `public-pet:${getRequestIp(request)}`,
    maxRequests: 600,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitos acessos de perfil em pouco tempo.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  if (!hasSupabaseServerClient()) {
    return buildNotConfiguredResponse();
  }

  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();

  if (!slug) {
    return NextResponse.json(
      {
        ok: false,
        message: "slug e obrigatorio.",
      },
      { status: 400 },
    );
  }

  if (slug.length > 120) {
    return NextResponse.json(
      {
        ok: false,
        message: "slug invalido.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const petColumns =
    "id, owner_id, slug, name, bio, age, breed, weight, city, avatar_url, whatsapp, phone, location_url, location_lat, location_lng, location_label, reward, status, allergies, medications, vaccines, created_at, updated_at";

  let petRow: PetRow | null = null;
  const { data: petBySlugRows, error: petBySlugError } = await supabase
    .from("pets")
    .select(petColumns)
    .eq("slug", slug)
    .limit(1);

  if (petBySlugError) {
    return NextResponse.json(
      {
        ok: false,
        message: petBySlugError.message || "Falha ao buscar pet.",
      },
      { status: 500 },
    );
  }

  petRow = (petBySlugRows?.[0] ?? null) as PetRow | null;

  if (!petRow) {
    const { data: petByIdRows, error: petByIdError } = await supabase
      .from("pets")
      .select(petColumns)
      .eq("id", slug)
      .limit(1);

    if (petByIdError) {
      return NextResponse.json(
        {
          ok: false,
          message: petByIdError.message || "Falha ao buscar pet.",
        },
        { status: 500 },
      );
    }

    petRow = (petByIdRows?.[0] ?? null) as PetRow | null;
  }

  if (!petRow) {
    return NextResponse.json({ ok: true, pet: null });
  }

  const [{ data: mediaRows }, { data: ownerRows }] = await Promise.all([
    supabase
      .from("pet_media")
      .select("id, pet_id, media_type, url, caption")
      .eq("pet_id", petRow.id),
    supabase
      .from("owners")
      .select("id, full_name, plan_tier, plan_status")
      .eq("id", petRow.owner_id)
      .limit(1),
  ]);

  const ownerRow = (ownerRows?.[0] ?? null) as OwnerRow | null;
  const galleryRows = (mediaRows ?? []) as PetMediaRow[];

  return NextResponse.json({
    ok: true,
    ownerName: ownerRow?.full_name || "Tutor",
    isPremiumPlan: ownerRow?.plan_tier === "pro" && ownerRow?.plan_status !== "inactive",
    pet: {
      id: petRow.id,
      ownerId: petRow.owner_id,
      slug: petRow.slug,
      name: petRow.name,
      bio: petRow.bio,
      age: petRow.age,
      breed: petRow.breed,
      weight: petRow.weight,
      city: petRow.city,
      avatarUrl: petRow.avatar_url,
      whatsapp: petRow.whatsapp,
      phone: petRow.phone,
      locationUrl: petRow.location_url,
      locationLat: petRow.location_lat,
      locationLng: petRow.location_lng,
      locationLabel: petRow.location_label,
      reward: petRow.reward,
      status: petRow.status,
      medical: {
        allergies: petRow.allergies,
        medications: petRow.medications,
        vaccines: petRow.vaccines,
      },
      gallery: galleryRows.map((media) => ({
        id: media.id,
        type: media.media_type,
        url: media.url,
        caption: media.caption,
      })),
      createdAt: petRow.created_at,
      updatedAt: petRow.updated_at,
    },
  });
}
