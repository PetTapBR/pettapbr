import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface TagRow {
  id: string;
  code: string;
  owner_id: string | null;
  pet_id: string | null;
  status: "unlinked" | "active" | "disabled";
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

interface OwnerRow {
  id: string;
  full_name: string;
  plan_tier: "start" | "pro" | null;
  plan_status: "active" | "inactive" | null;
}

export async function GET(request: Request) {
  const rateLimit = consumeRateLimit({
    key: `public-tag:${getRequestIp(request)}`,
    maxRequests: 600,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitos acessos de tag em pouco tempo.",
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
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase server nao configurado.",
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const tagCode = (url.searchParams.get("tagCode") ?? "").trim().toUpperCase();

  if (!tagCode) {
    return NextResponse.json(
      {
        ok: false,
        message: "tagCode e obrigatorio.",
      },
      { status: 400 },
    );
  }

  if (!/^[A-Z0-9-]{4,64}$/.test(tagCode)) {
    return NextResponse.json(
      {
        ok: false,
        message: "tagCode invalido.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: tagRows, error: tagError } = await supabase
    .from("nfc_tags")
    .select("id, code, owner_id, pet_id, status")
    .eq("code", tagCode)
    .limit(1);

  if (tagError) {
    return NextResponse.json(
      {
        ok: false,
        message: tagError.message || "Falha ao buscar tag NFC.",
      },
      { status: 500 },
    );
  }

  const tagRow = (tagRows?.[0] ?? null) as TagRow | null;
  if (!tagRow) {
    return NextResponse.json({ ok: true, tag: null });
  }

  let pet: PetRow | null = null;
  let mediaRows: PetMediaRow[] = [];
  let owner: OwnerRow | null = null;

  if (tagRow.pet_id && tagRow.status === "active") {
    const petColumns =
      "id, owner_id, slug, name, bio, age, breed, weight, city, avatar_url, whatsapp, phone, location_url, location_lat, location_lng, location_label, reward, status, allergies, medications, vaccines, created_at, updated_at";

    const [{ data: petRows, error: petError }, { data: petMediaRows, error: mediaError }] =
      await Promise.all([
        supabase.from("pets").select(petColumns).eq("id", tagRow.pet_id).limit(1),
        supabase
          .from("pet_media")
          .select("id, pet_id, media_type, url, caption")
          .eq("pet_id", tagRow.pet_id),
      ]);

    if (petError || mediaError) {
      return NextResponse.json(
        {
          ok: false,
          message: petError?.message || mediaError?.message || "Falha ao buscar perfil do pet.",
        },
        { status: 500 },
      );
    }

    pet = (petRows?.[0] ?? null) as PetRow | null;
    mediaRows = (petMediaRows ?? []) as PetMediaRow[];

    if (pet) {
      const { data: ownerRows } = await supabase
        .from("owners")
        .select("id, full_name, plan_tier, plan_status")
        .eq("id", pet.owner_id)
        .limit(1);

      owner = (ownerRows?.[0] ?? null) as OwnerRow | null;
    }
  }

  return NextResponse.json({
    ok: true,
    tag: {
      id: tagRow.id,
      code: tagRow.code,
      ownerId: tagRow.owner_id,
      petId: tagRow.pet_id,
      status: tagRow.status,
    },
    ownerName: owner?.full_name || "Tutor",
    isPremiumPlan: owner?.plan_tier === "pro" && owner?.plan_status !== "inactive",
    pet: pet
      ? {
          id: pet.id,
          ownerId: pet.owner_id,
          slug: pet.slug,
          name: pet.name,
          bio: pet.bio,
          age: pet.age,
          breed: pet.breed,
          weight: pet.weight,
          city: pet.city,
          avatarUrl: pet.avatar_url,
          whatsapp: pet.whatsapp,
          phone: pet.phone,
          locationUrl: pet.location_url,
          locationLat: pet.location_lat,
          locationLng: pet.location_lng,
          locationLabel: pet.location_label,
          reward: pet.reward,
          status: pet.status,
          medical: {
            allergies: pet.allergies,
            medications: pet.medications,
            vaccines: pet.vaccines,
          },
          gallery: mediaRows.map((media) => ({
            id: media.id,
            type: media.media_type,
            url: media.url,
            caption: media.caption,
          })),
          createdAt: pet.created_at,
          updatedAt: pet.updated_at,
        }
      : null,
  });
}
