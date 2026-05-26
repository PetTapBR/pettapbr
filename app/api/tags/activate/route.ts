import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface ActivateTagBody {
  tagCode?: string;
  petId?: string;
}

interface TagRow {
  id: string;
  code: string;
  owner_id: string | null;
  pet_id: string | null;
  status: "unlinked" | "active" | "disabled";
  created_at: string;
  updated_at: string;
}

function normalizeTagCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) {
    return auth.response;
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

  let body: ActivateTagBody;
  try {
    body = (await request.json()) as ActivateTagBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const ownerId = auth.user.id;
  const rateLimit = consumeRateLimit({
    key: `activate-tag:${ownerId}:${getRequestIp(request)}`,
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas tentativas de vinculacao de tag. Aguarde e tente novamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const tagCode = normalizeTagCode(body.tagCode);
  const petId = (body.petId ?? "").trim();

  if (!tagCode || !petId) {
    return NextResponse.json(
      {
        ok: false,
        message: "tagCode e petId sao obrigatorios.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: petRows, error: petError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("owner_id", ownerId)
    .limit(1);

  if (petError || !petRows || petRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Pet nao encontrado para este tutor.",
      },
      { status: 404 },
    );
  }

  const { data: tagRows, error: tagError } = await supabase
    .from("nfc_tags")
    .select("id, code, owner_id, pet_id, status, created_at, updated_at")
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

  const tag = (tagRows?.[0] ?? null) as TagRow | null;
  if (!tag) {
    return NextResponse.json(
      {
        ok: false,
        message: "Tag NFC nao encontrada.",
      },
      { status: 404 },
    );
  }

  if (tag.status === "disabled") {
    return NextResponse.json(
      {
        ok: false,
        message: "Esta tag esta desativada.",
      },
      { status: 403 },
    );
  }

  if (tag.owner_id && tag.owner_id !== ownerId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Esta tag ja pertence a outro tutor.",
      },
      { status: 409 },
    );
  }

  const { data: existingTagForPetRows, error: existingTagForPetError } = await supabase
    .from("nfc_tags")
    .select("id, code")
    .eq("pet_id", petId)
    .neq("id", tag.id)
    .limit(1);

  if (existingTagForPetError) {
    return NextResponse.json(
      {
        ok: false,
        message: existingTagForPetError.message || "Falha ao validar vinculo atual do pet.",
      },
      { status: 500 },
    );
  }

  if (existingTagForPetRows && existingTagForPetRows.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: `Este pet ja possui uma tag NFC vinculada (${existingTagForPetRows[0].code}).`,
      },
      { status: 409 },
    );
  }

  if (tag.owner_id === ownerId && tag.pet_id === petId && tag.status === "active") {
    return NextResponse.json({
      ok: true,
      message: "Esta tag ja esta vinculada a este pet.",
      tag: {
        id: tag.id,
        code: tag.code,
        ownerId,
        petId,
        status: tag.status,
        createdAt: tag.created_at,
        updatedAt: tag.updated_at,
      },
    });
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("nfc_tags")
    .update({
      owner_id: ownerId,
      pet_id: petId,
      status: "active",
      updated_at: nowIso,
    })
    .eq("id", tag.id)
    .select("id, code, owner_id, pet_id, status, created_at, updated_at")
    .limit(1);

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: updateError?.message || "Falha ao ativar tag NFC.",
      },
      { status: 500 },
    );
  }

  const updatedTag = updatedRows[0] as TagRow;
  return NextResponse.json({
    ok: true,
    message: "Tag ativada e vinculada com sucesso.",
    tag: {
      id: updatedTag.id,
      code: updatedTag.code,
      ownerId: updatedTag.owner_id,
      petId: updatedTag.pet_id,
      status: updatedTag.status,
      createdAt: updatedTag.created_at,
      updatedAt: updatedTag.updated_at,
    },
  });
}
