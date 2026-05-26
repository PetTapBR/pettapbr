import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-route-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp, requireSameOrigin } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import type { NfcTagStatus } from "@/lib/types";

interface UpdateTagBody {
  action?: "setStatus" | "unlink";
  status?: NfcTagStatus;
}

const ALLOWED_STATUSES: NfcTagStatus[] = ["unlinked", "active", "disabled"];

interface RouteContext {
  params: Promise<{ tagId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const adminAuthError = await requireAdminSession();
  if (adminAuthError) {
    return adminAuthError;
  }

  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const rateLimit = consumeRateLimit({
    key: `admin-tags-mutate:${getRequestIp(request)}`,
    maxRequests: 200,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas alteracoes de tags em pouco tempo.",
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

  const params = await context.params;
  const tagId = (params.tagId ?? "").trim();

  if (!tagId) {
    return NextResponse.json(
      {
        ok: false,
        message: "tagId e obrigatorio.",
      },
      { status: 400 },
    );
  }

  let body: UpdateTagBody;
  try {
    body = (await request.json()) as UpdateTagBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const action = body.action ?? "setStatus";
  const supabase = createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  if (action === "unlink") {
    const { error } = await supabase
      .from("nfc_tags")
      .update({
        owner_id: null,
        pet_id: null,
        status: "unlinked",
        updated_at: nowIso,
      })
      .eq("id", tagId);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message || "Falha ao desvincular tag NFC.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  const nextStatus = body.status;
  if (!nextStatus || !ALLOWED_STATUSES.includes(nextStatus)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Status de tag invalido.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("nfc_tags")
    .update({
      status: nextStatus,
      updated_at: nowIso,
    })
    .eq("id", tagId);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "Falha ao atualizar status da tag NFC.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
