import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface ClearNotificationsBody {
  notificationId?: string;
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

  let body: ClearNotificationsBody;
  try {
    body = (await request.json()) as ClearNotificationsBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const notificationId = (body.notificationId ?? "").trim();
  const ownerId = auth.user.id;
  const rateLimit = consumeRateLimit({
    key: `notifications-clear:${ownerId}:${getRequestIp(request)}`,
    maxRequests: 240,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas operacoes de notificacao em pouco tempo.",
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

  let query = supabase.from("notifications").delete().eq("owner_id", ownerId);
  if (notificationId) {
    query = query.eq("id", notificationId);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "Falha ao limpar notificacoes.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
