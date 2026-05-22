import { NextResponse } from "next/server";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_TIMEOUT_MS = 9000;

function parseCoordinate(
  rawValue: string | null,
  { min, max }: { min: number; max: number },
) {
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = parseCoordinate(url.searchParams.get("lat"), { min: -90, max: 90 });
  const lng = parseCoordinate(url.searchParams.get("lng"), { min: -180, max: 180 });

  if (lat === null || lng === null) {
    return NextResponse.json(
      {
        ok: false,
        message: "Coordenadas invalidas.",
      },
      { status: 400 },
    );
  }

  const reverseUrl = new URL(NOMINATIM_ENDPOINT);
  reverseUrl.searchParams.set("format", "jsonv2");
  reverseUrl.searchParams.set("lat", String(lat));
  reverseUrl.searchParams.set("lon", String(lng));
  reverseUrl.searchParams.set("addressdetails", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(reverseUrl.toString(), {
      method: "GET",
      headers: {
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        "User-Agent": "PETTAPBR/1.0 (contato@pettapbr.com)",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "Servico de geolocalizacao indisponivel.",
        },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      display_name?: string;
      error?: string;
    };

    const label = payload.display_name?.trim();
    if (!label) {
      return NextResponse.json(
        {
          ok: false,
          message: payload.error ?? "Endereco nao encontrado para este ponto.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      label,
    });
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === "AbortError";

    return NextResponse.json(
      {
        ok: false,
        message: isAbortError ? "Tempo limite ao consultar localizacao." : "Falha ao consultar localizacao.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
