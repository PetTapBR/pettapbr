import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import { createId } from "@/lib/utils";

interface PushSubscriptionBody {
  userAgent?: string;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
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

  let body: PushSubscriptionBody;
  try {
    body = (await request.json()) as PushSubscriptionBody;
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
    key: `push-subscribe:${ownerId}:${getRequestIp(request)}`,
    maxRequests: 40,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas tentativas de ativar notificacao push. Aguarde e tente novamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const endpoint = (body.subscription?.endpoint ?? "").trim();
  const p256dh = (body.subscription?.keys?.p256dh ?? "").trim();
  const authKey = (body.subscription?.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "Dados da subscription sao obrigatorios.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { data: existingRows, error: existingError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .limit(1);

  if (existingError) {
    return NextResponse.json(
      {
        ok: false,
        message: existingError.message || "Falha ao validar subscription push.",
      },
      { status: 500 },
    );
  }

  const existingRow = existingRows?.[0] as { id?: string } | undefined;
  let error: { message?: string } | null = null;

  if (existingRow?.id) {
    const updateResult = await supabase
      .from("push_subscriptions")
      .update({
        owner_id: ownerId,
        p256dh,
        auth: authKey,
        user_agent: (body.userAgent ?? "").trim(),
        active: true,
        updated_at: nowIso,
      })
      .eq("id", existingRow.id);

    error = updateResult.error;
  } else {
    const insertResult = await supabase.from("push_subscriptions").insert({
      id: createId("pushsub"),
      owner_id: ownerId,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: (body.userAgent ?? "").trim(),
      active: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    error = insertResult.error;
  }

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "Falha ao salvar subscription push.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
