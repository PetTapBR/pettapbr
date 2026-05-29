import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface RegisterBody {
  fullName?: string;
  email?: string;
  password?: string;
  activationCode?: string;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  lgpdAccepted?: boolean;
}

interface NfcTagLookupRow {
  id: string;
  owner_id: string | null;
  status: "unlinked" | "active" | "disabled";
}

interface SupabaseErrorLike {
  message?: string;
  code?: string;
}

interface OwnerLookupRow {
  id: string;
}

function normalizeActivationCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  if (code === "42703" || code === "PGRST204") {
    return true;
  }

  return message.includes("column") && message.includes("schema cache");
}

function isDuplicateEmailOwnerError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as SupabaseErrorLike;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  return code === "23505" && message.includes("owners_email_key");
}

function isOwnerForeignKeyClaimError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as SupabaseErrorLike;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  return code === "23503" && message.includes("nfc_tags_owner_id_fkey");
}

async function cleanupOrphanOwnerByEmail(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  email: string,
) {
  const { data: ownerRows, error: ownerLookupError } = await supabase
    .from("owners")
    .select("id")
    .eq("email", email)
    .limit(2);

  if (ownerLookupError) {
    return {
      ok: false as const,
      message: ownerLookupError.message || "Falha ao validar e-mail no cadastro.",
    };
  }

  if (!ownerRows || ownerRows.length === 0) {
    return { ok: true as const };
  }

  if (ownerRows.length > 1) {
    return {
      ok: false as const,
      message: "Este e-mail possui registros duplicados. Contate o suporte para regularizar.",
    };
  }

  const ownerId = (ownerRows[0] as OwnerLookupRow).id;
  const { data: existingAuthUser, error: authLookupError } = await supabase.auth.admin.getUserById(ownerId);

  const authUserExists = Boolean(existingAuthUser?.user) && !authLookupError;
  if (authUserExists) {
    return { ok: true as const };
  }

  const { count: petsCount, error: petsCountError } = await supabase
    .from("pets")
    .select("id", { head: true, count: "exact" })
    .eq("owner_id", ownerId);

  if (petsCountError) {
    return {
      ok: false as const,
      message: petsCountError.message || "Falha ao validar pets do tutor.",
    };
  }

  const { count: tagsCount, error: tagsCountError } = await supabase
    .from("nfc_tags")
    .select("id", { head: true, count: "exact" })
    .eq("owner_id", ownerId);

  if (tagsCountError) {
    return {
      ok: false as const,
      message: tagsCountError.message || "Falha ao validar tags do tutor.",
    };
  }

  if ((petsCount ?? 0) > 0 || (tagsCount ?? 0) > 0) {
    return {
      ok: false as const,
      message:
        "Seu e-mail esta vinculado a um cadastro incompleto com dados ativos. Fale com o suporte para regularizar.",
    };
  }

  const { error: deleteOwnerError } = await supabase.from("owners").delete().eq("id", ownerId);
  if (deleteOwnerError) {
    return {
      ok: false as const,
      message: deleteOwnerError.message || "Falha ao limpar cadastro incompleto do e-mail.",
    };
  }

  return { ok: true as const };
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
  const termsAccepted = body.termsAccepted === true || body.lgpdAccepted === true;
  const privacyAccepted = body.privacyAccepted === true || body.lgpdAccepted === true;

  if (!fullName || !email || !password || !activationCode) {
    return NextResponse.json(
      {
        ok: false,
        message: "Preencha nome, e-mail, senha e chave de ativacao.",
      },
      { status: 400 },
    );
  }

  if (!/^[A-Z0-9]{6}$/.test(activationCode)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Chave de ativacao invalida. Use os 6 caracteres enviados com a tag.",
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

  if (!termsAccepted || !privacyAccepted) {
    return NextResponse.json(
      {
        ok: false,
        message: "Aceite os Termos de Uso e a Politica de Privacidade para concluir o cadastro.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const orphanCleanup = await cleanupOrphanOwnerByEmail(supabase, email);
  if (!orphanCleanup.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: orphanCleanup.message,
      },
      { status: 409 },
    );
  }

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

  const rollbackOwnerRow = async () => {
    try {
      await supabase.from("owners").delete().eq("id", authUser.id);
    } catch {
      // Rollback best effort.
    }
  };

  const ownerPayload = {
    id: authUser.id,
    full_name: fullName,
    email,
    password_hash: "__SUPABASE_AUTH__",
    created_at: authUser.created_at ?? nowIso,
    terms_accepted_at: nowIso,
    terms_accepted_version: TERMS_VERSION,
    terms_accepted_ip: requestIp,
    privacy_accepted_at: nowIso,
    privacy_accepted_version: PRIVACY_VERSION,
    privacy_accepted_ip: requestIp,
    lgpd_consent_at: nowIso,
    lgpd_consent_version: PRIVACY_VERSION,
    lgpd_consent_ip: requestIp,
  };

  let ownerError: { message?: string; code?: string } | null = null;

  {
    const ownerResult = await supabase.from("owners").upsert(ownerPayload, { onConflict: "id" });
    ownerError = ownerResult.error;
  }

  if (ownerError && isMissingColumnError(ownerError)) {
    const legacyPayload = {
      id: authUser.id,
      full_name: fullName,
      email,
      password_hash: "__SUPABASE_AUTH__",
      created_at: authUser.created_at ?? nowIso,
      lgpd_consent_at: nowIso,
      lgpd_consent_version: PRIVACY_VERSION,
      lgpd_consent_ip: requestIp,
    };

    const legacyResult = await supabase.from("owners").upsert(legacyPayload, {
      onConflict: "id",
    });
    ownerError = legacyResult.error;
  }

  if (ownerError && isMissingColumnError(ownerError)) {
    const fallbackResult = await supabase.from("owners").upsert(
      {
        id: authUser.id,
        full_name: fullName,
        email,
        password_hash: "__SUPABASE_AUTH__",
        created_at: authUser.created_at ?? nowIso,
      },
      { onConflict: "id" },
    );
    ownerError = fallbackResult.error;
  }

  if (ownerError) {
    await rollbackOwnerRow();
    await rollbackAuthUser();

    if (isDuplicateEmailOwnerError(ownerError)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Este e-mail ja esta cadastrado. Tente entrar ou recuperar sua senha.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: ownerError.message || "Falha ao salvar perfil do tutor.",
      },
      { status: 500 },
    );
  }

  let { data: claimedRows, error: claimError } = await supabase
    .from("nfc_tags")
    .update({
      owner_id: authUser.id,
      updated_at: nowIso,
    })
    .eq("id", selectedTag.id)
    .is("owner_id", null)
    .select("id")
    .limit(1);

  if (claimError && isOwnerForeignKeyClaimError(claimError)) {
    // Self-healing for legacy environments where owner row may not have persisted.
    const recoveryPayload = {
      id: authUser.id,
      full_name: fullName,
      email,
      password_hash: "__SUPABASE_AUTH__",
      created_at: authUser.created_at ?? nowIso,
      lgpd_consent_at: nowIso,
      lgpd_consent_version: PRIVACY_VERSION,
      lgpd_consent_ip: requestIp,
    };

    const recoveryResult = await supabase.from("owners").upsert(recoveryPayload, {
      onConflict: "id",
    });

    if (!recoveryResult.error) {
      const retryClaim = await supabase
        .from("nfc_tags")
        .update({
          owner_id: authUser.id,
          updated_at: nowIso,
        })
        .eq("id", selectedTag.id)
        .is("owner_id", null)
        .select("id")
        .limit(1);

      claimedRows = retryClaim.data;
      claimError = retryClaim.error;
    }
  }

  if (claimError) {
    await rollbackOwnerRow();
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
    await rollbackOwnerRow();
    await rollbackAuthUser();
    return NextResponse.json(
      {
        ok: false,
        message: "Esta chave de ativacao acabou de ser usada por outra conta.",
      },
      { status: 409 },
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
