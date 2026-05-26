import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { getAsaasPayment, type AsaasPayment } from "@/lib/asaas";
import {
  calculateNextPlanExpiration,
  isAsaasPaymentSettled,
  resolveRenewalMonths,
} from "@/lib/plan-billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-security";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";

interface AsaasWebhookPayment {
  id?: string;
  status?: string;
  subscription?: string | null;
  customer?: string | null;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
}

interface AsaasWebhookSubscription {
  id?: string;
  status?: string;
  customer?: string | null;
}

interface AsaasWebhookCheckout {
  id?: string;
  status?: string;
  customer?: string | null;
}

interface AsaasWebhookPayload {
  event?: string;
  payment?: AsaasWebhookPayment;
  subscription?: AsaasWebhookSubscription;
  checkout?: AsaasWebhookCheckout;
}

interface OwnerLookupRow {
  id: string;
  plan_expires_at: string | null;
  asaas_customer_id: string;
  asaas_subscription_id: string;
  asaas_last_payment_id: string;
  asaas_last_payment_url: string;
  asaas_last_processed_payment_id: string;
  asaas_pending_months: number | null;
}

interface ApplyPaidPlanResult {
  ok: boolean;
  message: string;
  expiresAt: string | null;
}

const ACTIVATION_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "CHECKOUT_PAID"]);
const INACTIVATION_EVENTS = new Set(["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"]);

function normalize(value: string | null | undefined) {
  return (value ?? "").trim();
}

function safeTokenCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function pickPaymentUrl(payment: {
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
}) {
  return payment.invoiceUrl || payment.bankSlipUrl || payment.transactionReceiptUrl || "";
}

function isInactiveSubscriptionEvent(event: string, payload: AsaasWebhookPayload) {
  if (INACTIVATION_EVENTS.has(event)) {
    return true;
  }

  if (event === "SUBSCRIPTION_UPDATED") {
    return normalize(payload.subscription?.status).toUpperCase() === "INACTIVE";
  }

  return false;
}

async function resolveOwner(
  subscriptionId: string,
  customerId: string,
): Promise<{ owner: OwnerLookupRow | null; matchBy: "subscription" | "customer" | "none" }> {
  if (!hasSupabaseServerClient()) {
    return { owner: null, matchBy: "none" };
  }

  const supabase = createSupabaseServerClient();
  const selectQuery =
    "id, plan_expires_at, asaas_customer_id, asaas_subscription_id, asaas_last_payment_id, asaas_last_payment_url, asaas_last_processed_payment_id, asaas_pending_months";

  if (subscriptionId) {
    const { data } = await supabase
      .from("owners")
      .select(selectQuery)
      .eq("asaas_subscription_id", subscriptionId)
      .limit(1);

    if (data && data.length > 0) {
      return { owner: data[0] as OwnerLookupRow, matchBy: "subscription" };
    }
  }

  if (customerId) {
    const { data } = await supabase
      .from("owners")
      .select(selectQuery)
      .eq("asaas_customer_id", customerId)
      .limit(1);

    if (data && data.length > 0) {
      return { owner: data[0] as OwnerLookupRow, matchBy: "customer" };
    }
  }

  return { owner: null, matchBy: "none" };
}

async function applyPaidPlan(
  owner: OwnerLookupRow,
  payment: AsaasPayment,
): Promise<ApplyPaidPlanResult> {
  const paymentId = normalize(payment.id);
  if (!paymentId) {
    return {
      ok: false,
      message: "Evento pago sem id de pagamento no Asaas.",
      expiresAt: owner.plan_expires_at,
    };
  }

  if (paymentId === normalize(owner.asaas_last_processed_payment_id)) {
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

  const { error } = await supabase
    .from("owners")
    .update({
      plan_tier: "pro",
      plan_status: "active",
      plan_provider: "asaas",
      asaas_customer_id: normalize(payment.customer) || owner.asaas_customer_id,
      asaas_subscription_id: normalize(payment.subscription) || owner.asaas_subscription_id,
      asaas_last_payment_id: paymentId,
      asaas_last_payment_url: pickPaymentUrl(payment) || owner.asaas_last_payment_url,
      asaas_last_processed_payment_id: paymentId,
      asaas_pending_months: 0,
      plan_expires_at: nextExpiresAt,
      plan_updated_at: nowIso,
    })
    .eq("id", owner.id);

  if (error) {
    return {
      ok: false,
      message: error.message,
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
  const rateLimit = consumeRateLimit({
    key: `asaas-webhook:${getRequestIp(request)}`,
    maxRequests: 1200,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Muitas chamadas de webhook em pouco tempo.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!webhookToken) {
    return NextResponse.json(
      {
        ok: false,
        message: "Configure ASAAS_WEBHOOK_TOKEN para validar eventos do webhook.",
      },
      { status: 500 },
    );
  }

  if (!hasSupabaseServerClient()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para processar webhooks.",
      },
      { status: 500 },
    );
  }

  const providedToken = normalize(request.headers.get("asaas-access-token"));
  if (!providedToken || !safeTokenCompare(providedToken, webhookToken)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Token de webhook invalido.",
      },
      { status: 401 },
    );
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = (await request.json()) as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = normalize(payload.event).toUpperCase();
  const subscriptionId =
    normalize(payload.payment?.subscription) || normalize(payload.subscription?.id);
  const customerId =
    normalize(payload.payment?.customer) ||
    normalize(payload.checkout?.customer) ||
    normalize(payload.subscription?.customer);

  const { owner, matchBy } = await resolveOwner(subscriptionId, customerId);
  if (!owner) {
    return NextResponse.json({ ok: true, ignored: true, reason: "owner_not_found" });
  }

  const supabase = createSupabaseServerClient();

  if (ACTIVATION_EVENTS.has(event)) {
    const isCheckoutPaidEvent = event === "CHECKOUT_PAID";
    let paymentId = normalize(payload.payment?.id);
    let payment: AsaasPayment | null = null;

    if (paymentId) {
      payment = {
        id: paymentId,
        status: normalize(payload.payment?.status) || "CONFIRMED",
        subscription: normalize(payload.payment?.subscription) || null,
        customer: normalize(payload.payment?.customer) || null,
        externalReference: normalize(payload.payment?.externalReference) || null,
        invoiceUrl: payload.payment?.invoiceUrl ?? null,
        bankSlipUrl: payload.payment?.bankSlipUrl ?? null,
        transactionReceiptUrl: payload.payment?.transactionReceiptUrl ?? null,
      };

      if (!isAsaasPaymentSettled(payment.status)) {
        try {
          const fetchedPayment = await getAsaasPayment(paymentId);
          payment = fetchedPayment;
        } catch {
          // Fall back to webhook payload if detailed lookup fails.
        }
      }
    } else if (owner.asaas_last_payment_id) {
      paymentId = normalize(owner.asaas_last_payment_id);
      if (paymentId) {
        try {
          payment = await getAsaasPayment(paymentId);
        } catch {
          payment = null;
        }
      }
    }

    if (payment && isAsaasPaymentSettled(payment.status)) {
      const applyResult = await applyPaidPlan(owner, payment);
      if (!applyResult.ok) {
        return NextResponse.json({ ok: false, message: applyResult.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        action: "activated",
        matchBy,
        expiresAt: applyResult.expiresAt,
      });
    }

    if (!isCheckoutPaidEvent) {
      return NextResponse.json({
        ok: true,
        action: "awaiting_payment_confirmation",
        matchBy,
      });
    }

    const nowIso = new Date().toISOString();
    const nextSubscriptionId = subscriptionId || owner.asaas_subscription_id;
    const nextCustomerId = customerId || owner.asaas_customer_id;

    const { error } = await supabase
      .from("owners")
      .update({
        plan_tier: "pro",
        plan_status: "active",
        plan_provider: "asaas",
        asaas_customer_id: nextCustomerId,
        asaas_subscription_id: nextSubscriptionId,
        plan_updated_at: nowIso,
      })
      .eq("id", owner.id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "activated_without_payment", matchBy });
  }

  if (isInactiveSubscriptionEvent(event, payload)) {
    const nowIso = new Date().toISOString();
    const nextSubscriptionId = subscriptionId || owner.asaas_subscription_id;
    const nextCustomerId = customerId || owner.asaas_customer_id;

    const { error } = await supabase
      .from("owners")
      .update({
        plan_tier: "pro",
        plan_status: "inactive",
        plan_provider: "asaas",
        asaas_customer_id: nextCustomerId,
        asaas_subscription_id: nextSubscriptionId,
        plan_updated_at: nowIso,
      })
      .eq("id", owner.id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "inactivated", matchBy });
  }

  if (subscriptionId || customerId) {
    const nowIso = new Date().toISOString();
    const nextSubscriptionId = subscriptionId || owner.asaas_subscription_id;
    const nextCustomerId = customerId || owner.asaas_customer_id;

    const { error } = await supabase
      .from("owners")
      .update({
        asaas_customer_id: nextCustomerId,
        asaas_subscription_id: nextSubscriptionId,
        plan_provider: "asaas",
        plan_updated_at: nowIso,
      })
      .eq("id", owner.id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, ignored: true, matchBy });
}
