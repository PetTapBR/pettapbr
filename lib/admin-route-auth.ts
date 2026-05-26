import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_COOKIE_NAME, isValidAdminSessionToken } from "@/lib/admin-auth";

export async function requireAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  if (!isValidAdminSessionToken(token)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Acesso admin nao autorizado.",
      },
      { status: 401 },
    );
  }

  return null;
}
