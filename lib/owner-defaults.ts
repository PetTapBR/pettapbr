import type { OwnerAlertSettings, OwnerSubscription, PlanProvider, PlanStatus, PlanTier } from "./types";

const DEFAULT_PLAN_TIER: PlanTier = "start";
const DEFAULT_PLAN_STATUS: PlanStatus = "active";
const DEFAULT_PLAN_PROVIDER: PlanProvider = "manual";
const DEFAULT_ALERT_RADIUS_KM = 5;

function normalizePlanTier(value: unknown): PlanTier {
  return value === "pro" ? "pro" : DEFAULT_PLAN_TIER;
}

function normalizePlanStatus(value: unknown): PlanStatus {
  return value === "inactive" ? "inactive" : DEFAULT_PLAN_STATUS;
}

function normalizePlanProvider(value: unknown): PlanProvider {
  if (value === "asaas") {
    return "asaas";
  }

  return DEFAULT_PLAN_PROVIDER;
}

function normalizeRadiusKm(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_ALERT_RADIUS_KM;
  }

  return Math.min(50, Math.max(1, Math.round(value)));
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

export function createDefaultOwnerSubscription(
  input?: Partial<OwnerSubscription>,
): OwnerSubscription {
  return {
    tier: normalizePlanTier(input?.tier),
    status: normalizePlanStatus(input?.status),
    provider: normalizePlanProvider(input?.provider),
    asaasCustomerId: (input?.asaasCustomerId ?? "").trim(),
    asaasSubscriptionId: (input?.asaasSubscriptionId ?? "").trim(),
    expiresAt: normalizeIsoDate(input?.expiresAt),
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  };
}

export function createDefaultOwnerAlerts(input?: Partial<OwnerAlertSettings>): OwnerAlertSettings {
  return {
    receiveLostAlerts: Boolean(input?.receiveLostAlerts),
    radiusKm: normalizeRadiusKm(input?.radiusKm),
    locationLat: typeof input?.locationLat === "number" ? input.locationLat : null,
    locationLng: typeof input?.locationLng === "number" ? input.locationLng : null,
    locationLabel: (input?.locationLabel ?? "").trim(),
  };
}

export function isOwnerPro(
  owner: {
    subscription?: Partial<OwnerSubscription> | null;
  } | null | undefined,
) {
  if (!owner?.subscription) {
    return false;
  }

  if (owner.subscription.tier !== "pro" || owner.subscription.status !== "active") {
    return false;
  }

  const expiresAt = normalizeIsoDate(owner.subscription.expiresAt);
  if (!expiresAt) {
    return true;
  }

  return new Date(expiresAt).getTime() > Date.now();
}
