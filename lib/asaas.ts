import "server-only";

const DEFAULT_ASAAS_BASE_URL = "https://api-sandbox.asaas.com/v3";

export type AsaasBillingType = "UNDEFINED" | "BOLETO" | "CREDIT_CARD" | "PIX";

type AsaasMethod = "GET" | "POST" | "PUT" | "DELETE";

interface AsaasErrorItem {
  code?: string;
  description?: string;
}

interface AsaasErrorPayload {
  errors?: AsaasErrorItem[];
  message?: string;
}

interface AsaasCustomerRequest {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference?: string;
}

interface AsaasCustomerResponse {
  id: string;
}

interface AsaasSubscriptionRequest {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  cycle: "MONTHLY";
  description: string;
  externalReference?: string;
  callback?: {
    successUrl: string;
    autoRedirect?: boolean;
  };
}

interface AsaasPaymentRequest {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  description: string;
  externalReference?: string;
  callback?: {
    successUrl: string;
    autoRedirect?: boolean;
  };
}

export interface AsaasSubscriptionResponse {
  id: string;
  customer?: string;
  status?: string;
  checkoutSession?: string | null;
}

export interface AsaasPayment {
  id: string;
  status?: string;
  subscription?: string | null;
  customer?: string | null;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
}

interface AsaasListResponse<T> {
  data?: T[];
}

function getAsaasApiKey() {
  const key = process.env.ASAAS_API_KEY?.trim();
  if (!key) {
    throw new Error("Configure ASAAS_API_KEY para usar cobrancas no Asaas.");
  }

  return key;
}

export function getAsaasBaseUrl() {
  return process.env.ASAAS_BASE_URL?.trim() || DEFAULT_ASAAS_BASE_URL;
}

export function getAsaasProPrice() {
  const raw = process.env.ASAAS_PRO_MONTHLY_PRICE?.trim();
  if (!raw) {
    return 29.9;
  }

  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 29.9;
  }

  return Math.round(parsed * 100) / 100;
}

function parseAsaasError(payload: AsaasErrorPayload | null | undefined) {
  if (!payload) {
    return "Falha ao comunicar com o Asaas.";
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((item) => item.description || item.code || "Erro desconhecido")
      .join(" | ");
  }

  if (payload.message) {
    return payload.message;
  }

  return "Falha ao comunicar com o Asaas.";
}

async function asaasRequest<TResponse>(
  path: string,
  method: AsaasMethod,
  body?: unknown,
): Promise<TResponse> {
  const key = getAsaasApiKey();
  const baseUrl = getAsaasBaseUrl();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "PetTapBR/1.0.0",
      access_token: key,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: AsaasErrorPayload | null = null;

    try {
      payload = (await response.json()) as AsaasErrorPayload;
    } catch {
      payload = null;
    }

    throw new Error(parseAsaasError(payload));
  }

  if (response.status === 204) {
    return {} as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function sanitizeCpfCnpj(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function sanitizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

export function buildNextDueDate(daysAhead = 1) {
  const today = new Date();
  today.setDate(today.getDate() + daysAhead);

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function createAsaasCustomer(payload: AsaasCustomerRequest) {
  return asaasRequest<AsaasCustomerResponse>("/customers", "POST", payload);
}

export async function createAsaasSubscription(payload: AsaasSubscriptionRequest) {
  return asaasRequest<AsaasSubscriptionResponse>("/subscriptions", "POST", payload);
}

export async function createAsaasPayment(payload: AsaasPaymentRequest) {
  return asaasRequest<AsaasPayment>("/payments", "POST", payload);
}

export async function getAsaasPayment(paymentId: string) {
  return asaasRequest<AsaasPayment>(`/payments/${encodeURIComponent(paymentId)}`, "GET");
}

export async function listAsaasSubscriptionPayments(subscriptionId: string) {
  return asaasRequest<AsaasListResponse<AsaasPayment>>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    "GET",
  );
}

export async function listAsaasSubscriptionPaymentsByStatus(
  subscriptionId: string,
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE",
) {
  return asaasRequest<AsaasListResponse<AsaasPayment>>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?status=${encodeURIComponent(status)}`,
    "GET",
  );
}
