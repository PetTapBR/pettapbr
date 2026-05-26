import { NextResponse } from "next/server";

import {
  buildNextDueDate,
  createAsaasCustomer,
  createAsaasPayment,
  getAsaasProPrice,
  sanitizeCpfCnpj,
  sanitizePhone,
  type AsaasBillingType,
} from "@/lib/asaas";
import {
  buildPlanExternalReference,
  clampRenewalMonths,
  isIsoDateInFuture,
} from "@/lib/plan-billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface StartSubscriptionBody {
  cpfCnpj?: string;
  phone?: string;
  billingType?: AsaasBillingType;
  months?: number;
}

interface OwnerPlanRow {
  id: string;
  full_name: string;
  email: string;
  asaas_customer_id: string;
  plan_tier: "start" | "pro" | null;
  plan_status: "active" | "inactive" | null;
  plan_expires_at: string | null;
}

const ALLOWED_BILLING_TYPES = new Set<AsaasBillingType>(["PIX", "BOLETO", "CREDIT_CARD"]);

function getPaymentUrl(payment: {
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
}) {
  return payment.invoiceUrl || payment.bankSlipUrl || payment.transactionReceiptUrl || "";
}

function resolveSuccessCallbackUrl() {
  const configured = process.env.ASAAS_SUCCESS_URL?.trim();
  if (configured) {
    return configured;
  }
  return "";
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (!hasSupabaseServerClient()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para continuar.",
      },
      { status: 500 },
    );
  }

  let body: StartSubscriptionBody;

  try {
    body = (await request.json()) as StartSubscriptionBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const ownerId = auth.user.id;
  const rateLimit = consumeRateLimit({
    key: `billing-start:${ownerId}:${getRequestIp(request)}`,
    maxRequests: 25,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas tentativas de gerar cobranca. Aguarde para tentar novamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const cpfCnpj = sanitizeCpfCnpj(body.cpfCnpj ?? "");
  const phone = sanitizePhone(body.phone ?? "");
  const billingType = body.billingType ?? "PIX";
  if (!ALLOWED_BILLING_TYPES.has(billingType)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Forma de cobranca invalida.",
      },
      { status: 400 },
    );
  }

  const months = clampRenewalMonths(
    typeof body.months === "number" ? body.months : Number(body.months ?? 1),
  );

  const supabase = createSupabaseServerClient();

  const { data: ownerData, error: ownerError } = await supabase
    .from("owners")
    .select("id, full_name, email, asaas_customer_id, plan_tier, plan_status, plan_expires_at")
    .eq("id", ownerId)
    .limit(1);

  if (ownerError || !ownerData || ownerData.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: ownerError?.message || "Tutor nao encontrado.",
      },
      { status: 404 },
    );
  }

  const owner = ownerData[0] as OwnerPlanRow;

  try {
    let asaasCustomerId = (owner.asaas_customer_id ?? "").trim();

    if (!asaasCustomerId) {
      if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
        return NextResponse.json(
          {
            ok: false,
            message: "Informe um CPF/CNPJ valido para criar o cliente no Asaas.",
          },
          { status: 400 },
        );
      }

      const customer = await createAsaasCustomer({
        name: owner.full_name,
        email: owner.email,
        cpfCnpj,
        mobilePhone: phone || undefined,
        externalReference: owner.id,
      });

      asaasCustomerId = customer.id;
    }

    const now = Date.now();
    const callbackSuccessUrl = resolveSuccessCallbackUrl();
    const paymentPayload = {
      customer: asaasCustomerId,
      billingType,
      value: Math.round(getAsaasProPrice() * months * 100) / 100,
      dueDate: buildNextDueDate(1),
      description: `PetTapBR Plano Pro - ${months} mes(es)`,
      externalReference: buildPlanExternalReference(owner.id, months, now),
    };

    const payloadWithCallback = callbackSuccessUrl
      ? {
          ...paymentPayload,
          callback: {
            successUrl: callbackSuccessUrl,
            autoRedirect: true,
          },
        }
      : paymentPayload;

    const payment = await createAsaasPayment(payloadWithCallback);
    const paymentUrl = getPaymentUrl(payment);

    const nowIso = new Date().toISOString();
    const keepActive =
      owner.plan_tier === "pro" &&
      owner.plan_status === "active" &&
      isIsoDateInFuture(owner.plan_expires_at);

    const { error: updateOwnerError } = await supabase
      .from("owners")
      .update({
        plan_tier: "pro",
        plan_status: keepActive ? "active" : "inactive",
        plan_provider: "asaas",
        asaas_customer_id: asaasCustomerId,
        asaas_last_payment_id: payment.id,
        asaas_last_payment_url: paymentUrl,
        asaas_pending_months: months,
        plan_updated_at: nowIso,
      })
      .eq("id", owner.id);

    if (updateOwnerError) {
      return NextResponse.json(
        {
          ok: false,
          message: updateOwnerError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
      pendingMonths: months,
      asaasCustomerId,
      asaasPaymentId: payment.id,
      message: paymentUrl
        ? `Cobranca de ${months} mes(es) criada. Abra a fatura para concluir o pagamento.`
        : "Cobranca criada, mas nao foi possivel localizar a URL da fatura.",
    });
  } catch (error) {
    console.error("[asaas/subscription/start] erro ao gerar cobranca", error);
    const errorMessage =
      error instanceof Error ? error.message : "Falha ao iniciar cobranca no Asaas.";
    const normalizedMessage = errorMessage.toLowerCase();
    const statusCode =
      normalizedMessage.includes("invalid_environment") ||
      normalizedMessage.includes("api key") ||
      normalizedMessage.includes("token") ||
      normalizedMessage.includes("dominio")
        ? 400
        : 500;

    return NextResponse.json(
      {
        ok: false,
        message: errorMessage,
      },
      { status: statusCode },
    );
  }
}
