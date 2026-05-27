import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-route-auth";
import {
  buildLabelsPdfBuffer,
  clampInteger,
  formatTagCode,
  generateActivationCode,
  sanitizeDomain,
  type LabelPdfItem,
} from "@/lib/admin-tag-labels";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp, requireSameOrigin } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import { createId } from "@/lib/utils";

interface CreateLabelsBody {
  quantity?: number;
  startNumber?: number;
  domain?: string;
}

interface ExistingTagRow {
  code: string;
  activation_code: string;
}

interface InsertedLabelRow {
  code: string;
  activation_code: string;
}

interface DraftTagItem {
  code: string;
  activationCode: string;
}

function isDuplicateConstraint(errorMessage: string, constraint: string) {
  return (
    errorMessage.toLowerCase().includes("duplicate key value") &&
    errorMessage.toLowerCase().includes(constraint.toLowerCase())
  );
}

function buildDraftTags(
  quantity: number,
  startNumber: number,
  usedCodes: Set<string>,
  usedActivationCodes: Set<string>,
) {
  const output: DraftTagItem[] = [];
  let sequence = startNumber;
  let guard = 0;
  const maxGuard = Math.max(10_000, usedCodes.size + quantity + 5_000);

  while (output.length < quantity) {
    guard += 1;
    if (guard > maxGuard) {
      throw new Error("Nao foi possivel montar um lote unico de Codigos NFC.");
    }

    const code = formatTagCode(sequence);
    sequence += 1;

    if (usedCodes.has(code)) {
      continue;
    }

    let activationCode = generateActivationCode();
    let activationGuard = 0;
    while (usedActivationCodes.has(activationCode)) {
      activationGuard += 1;
      if (activationGuard > 10_000) {
        throw new Error("Nao foi possivel gerar Chaves de Ativacao unicas.");
      }
      activationCode = generateActivationCode();
    }

    usedCodes.add(code);
    usedActivationCodes.add(activationCode);
    output.push({
      code,
      activationCode,
    });
  }

  return output;
}

function getSequenceFromCode(code: string) {
  const match = code.match(/^PTBR-NFC-(\d{3,})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return parsed;
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
    key: `admin-tags-labels-create:${getRequestIp(request)}`,
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas criacoes de lote em pouco tempo.",
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

  let body: CreateLabelsBody;
  try {
    body = (await request.json()) as CreateLabelsBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const quantity = clampInteger(body.quantity, 1, 500, 20);
  const startNumber = clampInteger(body.startNumber, 1, 9_999_999, 1);
  const domain = sanitizeDomain(body.domain);
  const supabase = createSupabaseServerClient();
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: existingRows, error: listError } = await supabase
      .from("nfc_tags")
      .select("code, activation_code");

    if (listError) {
      return NextResponse.json(
        {
          ok: false,
          message: listError.message || "Falha ao listar tags existentes.",
        },
        { status: 500 },
      );
    }

    const usedCodes = new Set<string>();
    const usedActivationCodes = new Set<string>();
    for (const row of (existingRows ?? []) as ExistingTagRow[]) {
      if (row.code) {
        usedCodes.add(row.code);
      }
      if (row.activation_code) {
        usedActivationCodes.add(row.activation_code);
      }
    }

    let draftTags: DraftTagItem[];
    try {
      draftTags = buildDraftTags(quantity, startNumber, usedCodes, usedActivationCodes);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao montar o lote de tags.",
        },
        { status: 500 },
      );
    }

    const nowIso = new Date().toISOString();
    const insertPayload = draftTags.map((tag) => ({
      id: createId("tag"),
      code: tag.code,
      activation_code: tag.activationCode,
      owner_id: null,
      pet_id: null,
      status: "unlinked" as const,
      created_at: nowIso,
      updated_at: nowIso,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from("nfc_tags")
      .insert(insertPayload)
      .select("code, activation_code");

    if (insertError) {
      const message = insertError.message ?? "";
      if (
        isDuplicateConstraint(message, "nfc_tags_code_key") ||
        isDuplicateConstraint(message, "nfc_tags_activation_code_key")
      ) {
        continue;
      }

      return NextResponse.json(
        {
          ok: false,
          message: message || "Falha ao criar lote de tags NFC.",
        },
        { status: 500 },
      );
    }

    const labels = ((insertedRows ?? []) as InsertedLabelRow[])
      .map((row) => ({
        code: row.code,
        activationCode: row.activation_code,
        siteDomain: domain,
      }))
      .sort((a, b) => getSequenceFromCode(a.code) - getSequenceFromCode(b.code));

    if (labels.length !== quantity) {
      return NextResponse.json(
        {
          ok: false,
          message: "Lote incompleto apos criacao. Revise as tags no admin e tente novamente.",
        },
        { status: 500 },
      );
    }

    const pdfBytes = await buildLabelsPdfBuffer(labels as LabelPdfItem[]);
    const dateLabel = new Date().toISOString().slice(0, 10);
    const filename = `etiquetas-oficiais-${dateLabel}-${quantity}-tags.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
        "X-Tags-Created": String(quantity),
        "X-First-Code": labels[0]?.code ?? "",
        "X-Last-Code": labels[labels.length - 1]?.code ?? "",
      },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      message: "Nao foi possivel criar o lote agora. Tente novamente.",
    },
    { status: 500 },
  );
}
