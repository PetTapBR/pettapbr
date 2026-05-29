import { randomInt } from "crypto";
import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-route-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp, requireSameOrigin } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import type { NfcTagStatus } from "@/lib/types";
import { createId } from "@/lib/utils";

interface RelatedOwnerRow {
  id: string;
  full_name: string;
  email: string;
}

interface RelatedPetRow {
  id: string;
  name: string;
}

interface AdminNfcTagRow {
  id: string;
  code: string;
  activation_code: string;
  owner_id: string | null;
  pet_id: string | null;
  status: NfcTagStatus;
  created_at: string;
  updated_at: string;
  owner: RelatedOwnerRow | RelatedOwnerRow[] | null;
  pet: RelatedPetRow | RelatedPetRow[] | null;
}

interface CreateAdminTagBody {
  code?: string;
  activationCode?: string;
}

function normalizeTagCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function normalizeActivationCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function asSingleRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function isDuplicateConstraint(errorMessage: string, constraint: string) {
  return (
    errorMessage.toLowerCase().includes("duplicate key value") &&
    errorMessage.toLowerCase().includes(constraint.toLowerCase())
  );
}

function randomActivationChars(length: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output += alphabet[randomInt(0, alphabet.length)];
  }

  return output;
}

function generateActivationCode() {
  return randomActivationChars(6);
}

async function generateNextTagCode() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("nfc_tags").select("code");

  if (error) {
    throw new Error(error.message || "Falha ao listar codigos existentes.");
  }

  const usedNumbers = new Set<number>();
  for (const row of data ?? []) {
    const rawCode = normalizeTagCode((row as { code?: string }).code ?? "");
    const match = rawCode.match(/^PTBR-NFC-(\d{3,})$/);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      usedNumbers.add(parsed);
    }
  }

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `PTBR-NFC-${String(nextNumber).padStart(3, "0")}`;
}

function mapTag(row: AdminNfcTagRow) {
  const owner = asSingleRow(row.owner);
  const pet = asSingleRow(row.pet);

  return {
    id: row.id,
    code: row.code,
    activationCode: row.activation_code,
    ownerId: row.owner_id,
    petId: row.pet_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: owner
      ? {
          id: owner.id,
          fullName: owner.full_name,
          email: owner.email,
        }
      : null,
    pet: pet
      ? {
          id: pet.id,
          name: pet.name,
        }
      : null,
  };
}

export async function GET() {
  const adminAuthError = await requireAdminSession();
  if (adminAuthError) {
    return adminAuthError;
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

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("nfc_tags")
    .select("id, code, activation_code, owner_id, pet_id, status, created_at, updated_at, owner:owners(id, full_name, email), pet:pets(id, name)")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "Falha ao listar tags NFC.",
      },
      { status: 500 },
    );
  }

  const tags = (data ?? []).map((row) => mapTag(row as AdminNfcTagRow));
  return NextResponse.json({ ok: true, tags });
}

export async function POST(request: Request) {
  const adminAuthError = await requireAdminSession();
  if (adminAuthError) {
    return adminAuthError;
  }

  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const rateLimit = consumeRateLimit({
    key: `admin-tags-create:${getRequestIp(request)}`,
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas operacoes de tags em pouco tempo.",
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

  let body: CreateAdminTagBody;
  try {
    body = (await request.json()) as CreateAdminTagBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const requestedCode = normalizeTagCode(body.code);
  const requestedActivationCode = normalizeActivationCode(body.activationCode);

  if (requestedCode && !/^[A-Z0-9-]{4,64}$/.test(requestedCode)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Codigo NFC invalido. Use apenas letras, numeros e hifen.",
      },
      { status: 400 },
    );
  }

  if (requestedActivationCode && !/^[A-Z0-9]{6}$/.test(requestedActivationCode)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Chave de ativacao invalida. Use exatamente 6 caracteres (A-Z e 0-9).",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = requestedCode || (await generateNextTagCode());
    const activationCode = requestedActivationCode || generateActivationCode();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("nfc_tags")
      .insert({
        id: createId("tag"),
        code,
        activation_code: activationCode,
        owner_id: null,
        pet_id: null,
        status: "unlinked",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, code, activation_code, owner_id, pet_id, status, created_at, updated_at")
      .limit(1);

    if (!error && data && data.length > 0) {
      const tag = data[0] as Omit<AdminNfcTagRow, "owner" | "pet">;

      return NextResponse.json({
        ok: true,
        tag: {
          id: tag.id,
          code: tag.code,
          activationCode: tag.activation_code,
          ownerId: tag.owner_id,
          petId: tag.pet_id,
          status: tag.status,
          createdAt: tag.created_at,
          updatedAt: tag.updated_at,
          owner: null,
          pet: null,
        },
      });
    }

    const message = error?.message ?? "";
    if (isDuplicateConstraint(message, "nfc_tags_code_key") && !requestedCode) {
      continue;
    }

    if (isDuplicateConstraint(message, "nfc_tags_activation_code_key") && !requestedActivationCode) {
      continue;
    }

    if (isDuplicateConstraint(message, "nfc_tags_code_key")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ja existe uma tag com este Codigo NFC.",
        },
        { status: 409 },
      );
    }

    if (isDuplicateConstraint(message, "nfc_tags_activation_code_key")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ja existe uma tag com esta Chave de Ativacao.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: message || "Falha ao criar tag NFC.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "Nao foi possivel gerar um Codigo NFC unico. Tente novamente.",
    },
    { status: 500 },
  );
}
