import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";

interface IbgeCityRow {
  nome?: string;
}

const REQUEST_TIMEOUT_MS = 20000;

export async function GET(request: Request) {
  const rateLimit = consumeRateLimit({
    key: `ibge-cidades:${getRequestIp(request)}`,
    maxRequests: 240,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas consultas de cidades em pouco tempo.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const uf = (searchParams.get("uf") ?? "").trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(uf)) {
    return NextResponse.json(
      {
        ok: false,
        message: "UF invalida. Informe a sigla com 2 letras.",
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
      {
        next: {
          revalidate: 60 * 60 * 24 * 30,
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "Falha ao consultar cidades no IBGE.",
        },
        { status: 502 },
      );
    }

    const rows = (await response.json()) as IbgeCityRow[];
    const cities = rows
      .map((row) => (row.nome ?? "").trim())
      .filter((name) => name.length > 0)
      .sort((first, second) => first.localeCompare(second, "pt-BR"));

    return NextResponse.json({
      ok: true,
      uf,
      cities,
      source: "ibge",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Nao foi possivel consultar cidades no momento.",
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
