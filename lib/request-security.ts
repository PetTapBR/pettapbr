import "server-only";

import { NextResponse } from "next/server";

function normalizeHost(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseHostFromHeader(headerValue: string | null) {
  const normalized = normalizeHost(headerValue);
  if (!normalized) {
    return "";
  }

  return normalized.split(",")[0]?.trim() ?? "";
}

function parseHostFromUrl(rawUrl: string | null) {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    return normalizeHost(parsed.host);
  } catch {
    return "";
  }
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) {
    return realIp.trim();
  }

  return "unknown-ip";
}

export function requireSameOrigin(request: Request) {
  const host =
    parseHostFromHeader(request.headers.get("x-forwarded-host")) ||
    parseHostFromHeader(request.headers.get("host"));

  if (!host) {
    return NextResponse.json(
      {
        ok: false,
        message: "Host da requisicao ausente.",
      },
      { status: 403 },
    );
  }

  const originHost = parseHostFromUrl(request.headers.get("origin"));
  const refererHost = parseHostFromUrl(request.headers.get("referer"));
  const sourceHost = originHost || refererHost;

  if (!sourceHost) {
    return NextResponse.json(
      {
        ok: false,
        message: "Origem da requisicao nao validada.",
      },
      { status: 403 },
    );
  }

  if (sourceHost !== host) {
    return NextResponse.json(
      {
        ok: false,
        message: "Origem nao autorizada.",
      },
      { status: 403 },
    );
  }

  return null;
}
