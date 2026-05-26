import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "pettapbr_admin";

const SESSION_TTL_DAYS = 7;
const MIN_SECRET_LENGTH = 24;

function getAdminSecret() {
  return (process.env.PETTAPBR_ADMIN_SECRET ?? "").trim();
}

export function getAdminCredentials() {
  const email = (process.env.PETTAPBR_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.PETTAPBR_ADMIN_PASSWORD ?? "";

  return {
    email,
    password,
  };
}

function signPayload(payload: string) {
  return createHmac("sha256", getAdminSecret()).update(payload).digest("hex");
}

export function getAdminAuthConfigError() {
  const { email, password } = getAdminCredentials();
  const secret = getAdminSecret();

  if (!email || !password || !secret) {
    return "Configure PETTAPBR_ADMIN_EMAIL, PETTAPBR_ADMIN_PASSWORD e PETTAPBR_ADMIN_SECRET.";
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    return `PETTAPBR_ADMIN_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`;
  }

  return null;
}

export function createAdminSessionToken() {
  const configError = getAdminAuthConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const issuedAt = Date.now().toString();
  const payload = `admin|${issuedAt}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function isValidAdminSessionToken(token: string | undefined) {
  if (getAdminAuthConfigError()) {
    return false;
  }

  if (!token) {
    return false;
  }

  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) {
    return false;
  }

  const expectedSignature = signPayload(payload);

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return false;
  }

  const parts = payload.split("|");
  if (parts.length !== 2 || parts[0] !== "admin") {
    return false;
  }

  const issuedAt = Number(parts[1]);
  if (Number.isNaN(issuedAt)) {
    return false;
  }

  const maxAgeMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - issuedAt <= maxAgeMs;
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
