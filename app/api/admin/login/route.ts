import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminAuthConfigError,
  getAdminCookieOptions,
  getAdminCredentials,
} from "@/lib/admin-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp, requireSameOrigin } from "@/lib/request-security";

interface LoginBody {
  email?: string;
  password?: string;
}

function safeTextCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: Request) {
  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const rateLimit = consumeRateLimit({
    key: `admin-login:${getRequestIp(request)}`,
    maxRequests: 8,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas tentativas de login admin. Tente novamente em instantes.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const configError = getAdminAuthConfigError();
  if (configError) {
    return NextResponse.json(
      {
        ok: false,
        message: configError,
      },
      { status: 500 },
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const credentials = getAdminCredentials();

  const isValidEmail = safeTextCompare(email, credentials.email);
  const isValidPassword = safeTextCompare(password, credentials.password);

  if (!isValidEmail || !isValidPassword) {
    return NextResponse.json(
      {
        ok: false,
        message: "Credenciais de admin invalidas.",
      },
      { status: 401 },
    );
  }

  const token = createAdminSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, getAdminCookieOptions());

  return NextResponse.json({ ok: true });
}
