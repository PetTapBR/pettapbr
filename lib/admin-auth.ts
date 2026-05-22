import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "pettapbr_admin";

const SESSION_TTL_DAYS = 7;

function getAdminSecret() {
  return process.env.PETTAPBR_ADMIN_SECRET || "pettapbr-admin-local-secret";
}

export function getAdminCredentials() {
  return {
    email: process.env.PETTAPBR_ADMIN_EMAIL || "admin@pettapbr.com",
    password: process.env.PETTAPBR_ADMIN_PASSWORD || "admin123",
  };
}

function signPayload(payload: string) {
  return createHmac("sha256", getAdminSecret()).update(payload).digest("hex");
}

export function createAdminSessionToken() {
  const issuedAt = Date.now().toString();
  const payload = `admin|${issuedAt}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function isValidAdminSessionToken(token: string | undefined) {
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
