import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import { createId, normalizeTagCode } from "@/lib/utils";

interface PublicScanBody {
  slug?: string;
  tagCode?: string;
  source?: "nfc" | "direct";
  viewerLocation?: string;
}

interface TagLookupRow {
  pet_id: string | null;
  status: "unlinked" | "active" | "disabled";
}

interface PetLookupRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  is_public: boolean | null;
}

function normalizeText(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeSource(value: string | undefined) {
  return value === "nfc" ? "nfc" : "direct";
}

export async function POST(request: Request) {
  const requestIp = getRequestIp(request);
  const ipRateLimit = consumeRateLimit({
    key: `public-scan-ip:${requestIp}`,
    maxRequests: 200,
    windowMs: 60 * 60 * 1000,
  });

  if (!ipRateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitos acessos em pouco tempo. Tente novamente mais tarde.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
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

  let body: PublicScanBody;
  try {
    body = (await request.json()) as PublicScanBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const source = normalizeSource(body.source);
  const slug = normalizeText(body.slug);
  const tagCode = normalizeTagCode(body.tagCode ?? "");
  const viewerLocation = normalizeText(body.viewerLocation).slice(0, 180);

  if (source === "nfc" && !tagCode) {
    return NextResponse.json(
      {
        ok: false,
        message: "tagCode e obrigatorio para escaneamento NFC.",
      },
      { status: 400 },
    );
  }

  if (source === "nfc" && !/^[A-Z0-9-]{4,64}$/.test(tagCode)) {
    return NextResponse.json(
      {
        ok: false,
        message: "tagCode invalido.",
      },
      { status: 400 },
    );
  }

  if (source !== "nfc" && !slug) {
    return NextResponse.json(
      {
        ok: false,
        message: "slug do pet e obrigatorio.",
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
  let pet: PetLookupRow | null = null;

  if (source === "nfc") {
    const { data: tagRows, error: tagError } = await supabase
      .from("nfc_tags")
      .select("pet_id, status")
      .eq("code", tagCode)
      .limit(1);

    if (tagError) {
      return NextResponse.json(
        {
          ok: false,
          message: tagError.message || "Falha ao localizar tag NFC.",
        },
        { status: 500 },
      );
    }

    const tagRow = (tagRows?.[0] ?? null) as TagLookupRow | null;
    if (!tagRow || tagRow.status !== "active" || !tagRow.pet_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Tag NFC nao encontrada ou ainda sem pet vinculado.",
        },
        { status: 404 },
      );
    }

    const petColumnsPrimary = "id, owner_id, slug, name, is_public";
    const petColumnsFallback = "id, owner_id, slug, name";

    const primaryPet = await supabase
      .from("pets")
      .select(petColumnsPrimary)
      .eq("id", tagRow.pet_id)
      .limit(1);

    let petRows = primaryPet.data as PetLookupRow[] | null;
    let petError = primaryPet.error;

    if (primaryPet.error) {
      const errorMessage = primaryPet.error.message.toLowerCase();
      const missingVisibilityColumn =
        errorMessage.includes("is_public") && errorMessage.includes("does not exist");

      if (missingVisibilityColumn) {
        const fallbackPet = await supabase
          .from("pets")
          .select(petColumnsFallback)
          .eq("id", tagRow.pet_id)
          .limit(1);

        if (fallbackPet.error) {
          petError = fallbackPet.error;
        } else {
          petError = null;
          petRows = ((fallbackPet.data ?? []) as PetLookupRow[]).map((row) => ({
            ...row,
            is_public: true,
          }));
        }
      }
    }

    if (petError) {
      return NextResponse.json(
        {
          ok: false,
          message: petError.message || "Falha ao localizar pet da tag NFC.",
        },
        { status: 500 },
      );
    }

    pet = (petRows?.[0] ?? null) as PetLookupRow | null;
  } else {
    const petColumnsPrimary = "id, owner_id, slug, name, is_public";
    const petColumnsFallback = "id, owner_id, slug, name";

    const primaryBySlug = await supabase
      .from("pets")
      .select(petColumnsPrimary)
      .eq("slug", slug)
      .limit(1);

    let petRowsBySlug = primaryBySlug.data as PetLookupRow[] | null;
    let petBySlugError = primaryBySlug.error;

    if (primaryBySlug.error) {
      const errorMessage = primaryBySlug.error.message.toLowerCase();
      const missingVisibilityColumn =
        errorMessage.includes("is_public") && errorMessage.includes("does not exist");
      if (missingVisibilityColumn) {
        const fallbackBySlug = await supabase
          .from("pets")
          .select(petColumnsFallback)
          .eq("slug", slug)
          .limit(1);
        if (fallbackBySlug.error) {
          petBySlugError = fallbackBySlug.error;
        } else {
          petBySlugError = null;
          petRowsBySlug = ((fallbackBySlug.data ?? []) as PetLookupRow[]).map((row) => ({
            ...row,
            is_public: true,
          }));
        }
      }
    }

    if (petBySlugError) {
      return NextResponse.json(
        {
          ok: false,
          message: petBySlugError.message || "Falha ao localizar pet.",
        },
        { status: 500 },
      );
    }

    pet = (petRowsBySlug?.[0] ?? null) as PetLookupRow | null;

    if (!pet && slug) {
      const primaryById = await supabase
        .from("pets")
        .select(petColumnsPrimary)
        .eq("id", slug)
        .limit(1);

      let petRowsById = primaryById.data as PetLookupRow[] | null;
      let petByIdError = primaryById.error;

      if (primaryById.error) {
        const errorMessage = primaryById.error.message.toLowerCase();
        const missingVisibilityColumn =
          errorMessage.includes("is_public") && errorMessage.includes("does not exist");
        if (missingVisibilityColumn) {
          const fallbackById = await supabase
            .from("pets")
            .select(petColumnsFallback)
            .eq("id", slug)
            .limit(1);
          if (fallbackById.error) {
            petByIdError = fallbackById.error;
          } else {
            petByIdError = null;
            petRowsById = ((fallbackById.data ?? []) as PetLookupRow[]).map((row) => ({
              ...row,
              is_public: true,
            }));
          }
        }
      }

      if (petByIdError) {
        return NextResponse.json(
          {
            ok: false,
            message: petByIdError.message || "Falha ao localizar pet.",
          },
          { status: 500 },
        );
      }

      pet = (petRowsById?.[0] ?? null) as PetLookupRow | null;
    }
  }

  if (!pet) {
    return NextResponse.json(
      {
        ok: false,
        message: "Pet nao encontrado.",
      },
      { status: 404 },
    );
  }

  if (pet.is_public === false) {
    return NextResponse.json(
      {
        ok: false,
        message: "Perfil do pet esta privado pelo tutor.",
      },
      { status: 403 },
    );
  }

  const perPetRateLimit = consumeRateLimit({
    key: `public-scan-pet:${requestIp}:${pet.id}`,
    maxRequests: 40,
    windowMs: 60 * 60 * 1000,
  });

  if (!perPetRateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Limite de acessos deste dispositivo para este pet foi atingido temporariamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(perPetRateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const nowIso = new Date().toISOString();
  const scanEventId = createId("scan");
  const notificationId = createId("notification");
  const viewerLocationLabel = viewerLocation || "local nao informado";

  const [{ error: scanInsertError }, { error: notificationInsertError }] = await Promise.all([
    supabase.from("scan_events").insert({
      id: scanEventId,
      pet_id: pet.id,
      owner_id: pet.owner_id,
      source,
      viewer_location: viewerLocationLabel,
      accessed_at: nowIso,
    }),
    supabase.from("notifications").insert({
      id: notificationId,
      owner_id: pet.owner_id,
      pet_id: pet.id,
      message: `${pet.name} recebeu um acesso via ${source.toUpperCase()} (${viewerLocationLabel}).`,
      is_read: false,
      created_at: nowIso,
    }),
  ]);

  if (scanInsertError || notificationInsertError) {
    return NextResponse.json(
      {
        ok: false,
        message:
          scanInsertError?.message ||
          notificationInsertError?.message ||
          "Falha ao registrar acesso no perfil.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    pet: {
      id: pet.id,
      slug: pet.slug,
      name: pet.name,
    },
  });
}
