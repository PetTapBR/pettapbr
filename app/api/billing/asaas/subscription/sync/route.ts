import { NextResponse } from "next/server";

import {
  getAsaasPayment,
  listAsaasSubscriptionPayments,
  listAsaasSubscriptionPaymentsByStatus,
  type AsaasPayment,
} from "@/lib/asaas";
import {
  calculateNextPlanExpiration,
  isAsaasPaymentSettled,
  resolveRenewalMonths,
} from "@/lib/plan-billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/request-auth";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface OwnerPlanRow {
  id: string;
  plan_tier: "start" | "pro" | null;
  plan_status: "active" | "inactive" | null;
  plan_expires_at: string | null;
  asaas_subscription_id: string;
  asaas_customer_id: string;
  asaas_last_payment_id: string;
  asaas_last_payment_url: string;
  asaas_last_processed_payment_id: string;
  asaas_pending_months: number | null;
}

function pickPaymentUrl(payment: AsaasPayment | null | undefined) {
  if (!payment) {
    return "";
  }

  return payment.invoiceUrl || payment.bankSlipUrl || payment.transactionReceiptUrl || "";
}

interface ApplyPaidPlanResult {
  ok: boolean;
  message: string;
  expiresAt: string | null;
}

async function applyPaidPlan(
  owner: OwnerPlanRow,
  payment: AsaasPayment,
): Promise<ApplyPaidPlanResult> {
  const paymentId = (payment.id ?? "").trim();
  if (!paymentId) {
    return {
      ok: false,
      message: "Pagamento confirmado sem identificador no Asaas.",
      expiresAt: owner.plan_expires_at,
    };
  }

  if (paymentId === (owner.asaas_last_processed_payment_id ?? "").trim()) {
    return {
      ok: true,
      message: "Pagamento ja processado anteriormente.",
      expiresAt: owner.plan_expires_at,
    };
  }

  const monthsToRenew = resolveRenewalMonths(
    payment.externalReference,
    owner.asaas_pending_months ?? 1,
    owner.id,
  );
  const nextExpiresAt = calculateNextPlanExpiration(owner.plan_expires_at, monthsToRenew);
  const nowIso = new Date().toISOString();
  const supabase = createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("owners")
    .update({
      plan_tier: "pro",
      plan_status: "active",
      plan_provider: "asaas",
      asaas_customer_id: (payment.customer ?? "").trim() || owner.asaas_customer_id,
      asaas_subscription_id: (payment.subscription ?? "").trim() || owner.asaas_subscription_id,
      asaas_last_payment_id: paymentId,
      asaas_last_payment_url: pickPaymentUrl(payment) || owner.asaas_last_payment_url,
      asaas_last_processed_payment_id: paymentId,
      asaas_pending_months: 0,
      plan_expires_at: nextExpiresAt,
      plan_updated_at: nowIso,
    })
    .eq("id", owner.id);

  if (updateError) {
    return {
      ok: false,
      message: updateError.message,
      expiresAt: owner.plan_expires_at,
    };
  }

  return {
    ok: true,
    message: `Pagamento confirmado. Plano Pro renovado por ${monthsToRenew} mes(es).`,
    expiresAt: nextExpiresAt,
  };
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

  const ownerId = auth.user.id;
  const rateLimit = consumeRateLimit({
    key: `billing-sync:${ownerId}:${getRequestIp(request)}`,
    maxRequests: 80,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas verificacoes de pagamento em pouco tempo. Aguarde e tente novamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: ownerData, error: ownerError } = await supabase
    .from("owners")
    .select(
      "id, plan_tier, plan_status, plan_expires_at, asaas_subscription_id, asaas_customer_id, asaas_last_payment_id, asaas_last_payment_url, asaas_last_processed_payment_id, asaas_pending_months",
    )
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
  const pendingPaymentId = (owner.asaas_last_payment_id ?? "").trim();
  const subscriptionId = (owner.asaas_subscription_id ?? "").trim();

  if (!pendingPaymentId && !subscriptionId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Nenhuma cobranca Asaas foi vinculada para este tutor.",
      },
      { status: 400 },
    );
  }

  try {
    if (pendingPaymentId) {
      const payment = await getAsaasPayment(pendingPaymentId);
      if (isAsaasPaymentSettled(payment.status)) {
        const applyResult = await applyPaidPlan(owner, payment);
        if (!applyResult.ok) {
          return NextResponse.json(
            {
              ok: false,
              message: applyResult.message,
            },
            { status: 500 },
          );
        }

        return NextResponse.json({
          ok: true,
          status: "active",
          expiresAt: applyResult.expiresAt,
          message: applyResult.message,
        });
      }

      return NextResponse.json({
        ok: true,
        status: "pending",
        paymentStatus: payment.status ?? "PENDING",
        paymentUrl: pickPaymentUrl(payment) || owner.asaas_last_payment_url,
        message: "Pagamento ainda nao confirmado no Asaas.",
      });
    }

    const [receivedList, confirmedList, allPaymentsList] = await Promise.all([
      listAsaasSubscriptionPaymentsByStatus(subscriptionId, "RECEIVED"),
      listAsaasSubscriptionPaymentsByStatus(subscriptionId, "CONFIRMED"),
      listAsaasSubscriptionPayments(subscriptionId),
    ]);

    const settledPayment = (receivedList.data ?? [])[0] ?? (confirmedList.data ?? [])[0] ?? null;
    const latestPayment = (allPaymentsList.data ?? [])[0] ?? null;

    if (settledPayment && isAsaasPaymentSettled(settledPayment.status)) {
      const applyResult = await applyPaidPlan(owner, settledPayment);
      if (!applyResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: applyResult.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        status: "active",
        expiresAt: applyResult.expiresAt,
        message: applyResult.message,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "pending",
      paymentStatus: latestPayment?.status ?? "PENDING",
      paymentUrl: pickPaymentUrl(latestPayment) || owner.asaas_last_payment_url,
      message: "Pagamento ainda nao confirmado no Asaas.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao sincronizar assinatura com Asaas.",
      },
      { status: 500 },
    );
  }
}
