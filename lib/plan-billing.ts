const PLAN_REFERENCE_PREFIX = "pettapbr-pro";

export function clampRenewalMonths(value: unknown, fallback = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  if (normalized < 1) {
    return 1;
  }

  if (normalized > 24) {
    return 24;
  }

  return normalized;
}

export function buildPlanExternalReference(ownerId: string, months: number, nonce = Date.now()) {
  return `${PLAN_REFERENCE_PREFIX}:${ownerId}:${clampRenewalMonths(months)}:${nonce}`;
}

export function extractPlanMonthsFromExternalReference(
  externalReference: string | null | undefined,
  ownerId?: string,
) {
  const raw = (externalReference ?? "").trim();
  if (!raw) {
    return null;
  }

  const [prefix, ownerPart, monthsPart] = raw.split(":");
  if (prefix !== PLAN_REFERENCE_PREFIX) {
    return null;
  }

  if (ownerId && ownerPart !== ownerId) {
    return null;
  }

  const months = Number.parseInt(monthsPart ?? "", 10);
  if (!Number.isFinite(months) || months < 1) {
    return null;
  }

  return clampRenewalMonths(months);
}

export function resolveRenewalMonths(
  externalReference: string | null | undefined,
  fallbackMonths: number,
  ownerId?: string,
) {
  return (
    extractPlanMonthsFromExternalReference(externalReference, ownerId) ??
    clampRenewalMonths(fallbackMonths)
  );
}

export function isIsoDateInFuture(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return false;
  }

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp > Date.now();
}

export function calculateNextPlanExpiration(
  currentExpiresAt: string | null | undefined,
  monthsToAdd: number,
) {
  const normalizedMonths = clampRenewalMonths(monthsToAdd);
  const currentExpiresAtMs = Date.parse((currentExpiresAt ?? "").trim());
  const nowMs = Date.now();
  const baseMs =
    Number.isFinite(currentExpiresAtMs) && currentExpiresAtMs > nowMs ? currentExpiresAtMs : nowMs;

  const nextDate = new Date(baseMs);
  nextDate.setMonth(nextDate.getMonth() + normalizedMonths);

  return nextDate.toISOString();
}

export function isAsaasPaymentSettled(status: string | null | undefined) {
  if (!status) {
    return false;
  }

  return status === "RECEIVED" || status === "CONFIRMED";
}
