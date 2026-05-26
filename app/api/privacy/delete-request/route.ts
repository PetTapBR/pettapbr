import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import { createId } from "@/lib/utils";

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

  const requestIp = getRequestIp(request);
  const ownerId = auth.user.id;
  const rateLimit = consumeRateLimit({
    key: `privacy-delete-request:${ownerId}:${requestIp}`,
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas solicitacoes em pouco tempo. Aguarde alguns minutos.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: pendingRows, error: pendingError } = await supabase
    .from("data_deletion_requests")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .limit(1);

  if (pendingError) {
    return NextResponse.json(
      {
        ok: false,
        message: pendingError.message || "Falha ao validar solicitacao existente.",
      },
      { status: 500 },
    );
  }

  if (pendingRows && pendingRows.length > 0) {
    return NextResponse.json({
      ok: true,
      message: "Ja existe uma solicitacao de exclusao em andamento para esta conta.",
    });
  }

  const nowIso = new Date().toISOString();
  const { error: insertError } = await supabase.from("data_deletion_requests").insert({
    id: createId("dreq"),
    owner_id: ownerId,
    requested_by_email: auth.user.email,
    request_ip: requestIp,
    status: "pending",
    notes: "Solicitacao realizada pelo painel do tutor.",
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (insertError) {
    return NextResponse.json(
      {
        ok: false,
        message: insertError.message || "Falha ao registrar solicitacao de exclusao.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "Solicitacao recebida. Nosso time vai processar a exclusao dos dados conforme a LGPD.",
  });
}
