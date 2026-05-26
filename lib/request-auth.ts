import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

interface AuthenticatedUser {
  id: string;
  email: string;
}

type RequireUserResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

function getBearerToken(request: Request) {
  const rawAuth = request.headers.get("authorization") ?? "";
  if (!rawAuth.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return rawAuth.slice(7).trim();
}

function createAnonSupabaseAuthClient() {
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

export async function requireAuthenticatedUser(
  request: Request,
): Promise<RequireUserResult> {
  const token = getBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          message: "Sessao invalida. Faca login novamente.",
        },
        { status: 401 },
      ),
    };
  }

  const authClient = createAnonSupabaseAuthClient();
  if (!authClient) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          message:
            "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para validar autenticacao.",
        },
        { status: 500 },
      ),
    };
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          message: "Sessao expirou ou token invalido.",
        },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
    },
  };
}
