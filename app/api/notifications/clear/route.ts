import { NextResponse } from "next/server";

import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface ClearNotificationsBody {
  ownerId?: string;
  notificationId?: string;
}

export async function POST(request: Request) {
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

  const ownerId = (body.ownerId ?? "").trim();
  const notificationId = (body.notificationId ?? "").trim();

  if (!ownerId) {
    return NextResponse.json(
      {
        ok: false,
        message: "ownerId e obrigatorio.",
      },
      { status: 400 },
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
