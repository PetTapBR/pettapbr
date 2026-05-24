import { NextResponse } from "next/server";

import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/web-push";

export async function GET() {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Push web nao configurado no servidor. Defina WEB_PUSH_VAPID_PUBLIC_KEY e WEB_PUSH_VAPID_PRIVATE_KEY.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    publicKey: getWebPushPublicKey(),
  });
}
