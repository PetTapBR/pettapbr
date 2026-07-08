import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface RouteContext {
  params: Promise<{ petId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
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

  const ownerId = auth.user.id;
  const rateLimit = consumeRateLimit({
    key: `delete-pet:${ownerId}:${getRequestIp(request)}`,
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas exclusoes em pouco tempo. Aguarde e tente novamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const params = await context.params;
  const petId = (params.petId ?? "").trim();

  if (!petId) {
    return NextResponse.json(
      {
        ok: false,
        message: "petId e obrigatorio.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: petRows, error: petLookupError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("owner_id", ownerId)
    .limit(1);

  if (petLookupError || !petRows || petRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: petLookupError?.message || "Pet nao encontrado para este tutor.",
      },
      { status: 404 },
    );
  }

  const nowIso = new Date().toISOString();
  const { error: tagUpdateError } = await supabase
    .from("nfc_tags")
    .update({
      pet_id: null,
      status: "unlinked",
      updated_at: nowIso,
    })
    .eq("pet_id", petId)
    .eq("owner_id", ownerId);

  if (tagUpdateError) {
    return NextResponse.json(
      {
        ok: false,
        message: tagUpdateError.message || "Falha ao desvincular tag NFC do pet.",
      },
      { status: 500 },
    );
  }

  const { error: deletePetError } = await supabase
    .from("pets")
    .delete()
    .eq("id", petId)
    .eq("owner_id", ownerId);

  if (deletePetError) {
    return NextResponse.json(
      {
        ok: false,
        message: deletePetError.message || "Falha ao excluir pet.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Perfil do pet excluido com sucesso.",
  });
}
