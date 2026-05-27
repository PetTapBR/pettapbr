import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-route-auth";
import {
  buildLabelsPdfBuffer,
  clampInteger,
  formatTagCode,
  generateActivationCode,
  sanitizeDomain,
  type LabelPdfItem,
} from "@/lib/admin-tag-labels";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp, requireSameOrigin } from "@/lib/request-security";

interface PreviewLabelsBody {
  quantity?: number;
  startNumber?: number;
  domain?: string;
}

function buildPreviewLabels(quantity: number, startNumber: number, domain: string) {
  const labels: LabelPdfItem[] = [];

  for (let offset = 0; offset < quantity; offset += 1) {
    const code = formatTagCode(startNumber + offset);
    labels.push({
      code,
      activationCode: generateActivationCode(),
      siteDomain: domain,
    });
  }

  return labels;
}

export async function POST(request: Request) {
  const adminAuthError = await requireAdminSession();
  if (adminAuthError) {
    return adminAuthError;
  }

  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const rateLimit = consumeRateLimit({
    key: `admin-tags-labels-preview:${getRequestIp(request)}`,
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas geracoes de PDF em pouco tempo.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let body: PreviewLabelsBody;
  try {
    body = (await request.json()) as PreviewLabelsBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const quantity = clampInteger(body.quantity, 1, 200, 20);
  const startNumber = clampInteger(body.startNumber, 1, 999999, 1);
  const domain = sanitizeDomain(body.domain);
  const labels = buildPreviewLabels(quantity, startNumber, domain);

  const pdfBytes = await buildLabelsPdfBuffer(labels);
  const filename = `etiquetas-previa-${quantity}-tags.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
      "X-Preview-Quantity": String(quantity),
      "X-Preview-Start-Number": String(startNumber),
    },
  });
}
