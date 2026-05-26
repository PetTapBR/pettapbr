import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface RegisterBody {
  fullName?: string;
  email?: string;
  password?: string;
  activationCode?: string;
}

interface NfcTagLookupRow {
  id: string;
  owner_id: string | null;
  status: "unlinked" | "active" | "disabled";
}

function normalizeActivationCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createSupabaseAnonAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: Request) {
  const requestIp = getRequestIp(request);
  const rateLimit = consumeRateLimit({
    key: `auth-register:${requestIp}`,
    maxRequests: 8,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas tentativas de cadastro. Tente novamente em alguns minutos.",
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

  const anonAuthClient = createSupabaseAnonAuthClient();
  if (!anonAuthClient) {
    return NextResponse.json(
      {
        ok: false,
        message: "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para cadastro.",
      },
      { status: 500 },
    );
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const fullName = (body.fullName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const activationCode = normalizeActivationCode(body.activationCode);

  if (!fullName || !email || !password || !activationCode) {
    return NextResponse.json(
      {
        ok: false,
        message: "Preencha nome, e-mail, senha e chave de ativacao.",
      },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      {
        ok: false,
        message: "E-mail invalido.",
      },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      {
        ok: false,
        message: "Senha muito curta. Use ao menos 8 caracteres.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: tagRows, error: tagLookupError } = await supabase
    .from("nfc_tags")
    .select("id, owner_id, status")
    .eq("activation_code", activationCode)
    .limit(2);

  if (tagLookupError) {
    return NextResponse.json(
      {
        ok: false,
        message: tagLookupError.message || "Falha ao validar chave de ativacao.",
      },
      { status: 500 },
    );
  }

  if (!tagRows || tagRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Chave de ativacao invalida.",
      },
      { status: 400 },
    );
  }

  if (tagRows.length > 1) {
    return NextResponse.json(
      {
        ok: false,
        message: "Chave de ativacao duplicada. Contate o suporte.",
      },
      { status: 409 },
    );
  }

  const selectedTag = tagRows[0] as NfcTagLookupRow;
  if (selectedTag.status === "disabled") {
    return NextResponse.json(
      {
        ok: false,
        message: "Esta tag esta desativada. Contate o suporte.",
      },
      { status: 403 },
    );
  }

  if (selectedTag.owner_id) {
    return NextResponse.json(
      {
        ok: false,
        message: "Esta chave de ativacao ja foi utilizada.",
      },
      { status: 409 },
    );
  }

  const { data: signUpData, error: signUpError } = await anonAuthClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (signUpError) {
    return NextResponse.json(
      {
        ok: false,
        message: signUpError.message || "Falha ao criar conta.",
      },
      { status: 400 },
    );
  }

  const authUser = signUpData.user;
  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        message: "Nao foi possivel criar o usuario de autenticacao.",
      },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();

  const rollbackAuthUser = async () => {
    try {
      await supabase.auth.admin.deleteUser(authUser.id);
    } catch {
      // Rollback best effort.
    }
  };

  const { data: claimedRows, error: claimError } = await supabase
    .from("nfc_tags")
    .update({
      owner_id: authUser.id,
      updated_at: nowIso,
    })
    .eq("id", selectedTag.id)
    .is("owner_id", null)
    .select("id")
    .limit(1);

  if (claimError) {
    await rollbackAuthUser();
    return NextResponse.json(
      {
        ok: false,
        message: claimError.message || "Conta criada, mas falhou ao vincular a chave de ativacao.",
      },
      { status: 500 },
    );
  }

  if (!claimedRows || claimedRows.length === 0) {
    await rollbackAuthUser();
    return NextResponse.json(
      {
        ok: false,
        message: "Esta chave de ativacao acabou de ser usada por outra conta.",
      },
      { status: 409 },
    );
  }

  const { error: ownerError } = await supabase.from("owners").upsert(
    {
      id: authUser.id,
      full_name: fullName,
      email,
      password_hash: "__SUPABASE_AUTH__",
      created_at: authUser.created_at ?? nowIso,
    },
    { onConflict: "id" },
  );

  if (ownerError) {
    await supabase.from("nfc_tags").update({ owner_id: null, updated_at: nowIso }).eq("id", selectedTag.id);
    await rollbackAuthUser();
    return NextResponse.json(
      {
        ok: false,
        message: ownerError.message || "Falha ao salvar perfil do tutor.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    requiresEmailConfirmation: !signUpData.session,
    message: signUpData.session
      ? "Conta criada com sucesso e chave NFC vinculada."
      : "Conta criada e chave vinculada. Verifique seu e-mail para confirmar antes de entrar.",
  });
}
