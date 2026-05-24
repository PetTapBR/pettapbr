import { STORAGE_KEY } from "./constants";
import { createDefaultOwnerAlerts, createDefaultOwnerSubscription } from "./owner-defaults";
import { initialState } from "./seed";
import type { AppState, NfcTag } from "./types";
import { buildGoogleMapsUrl, parseLatLngFromLocationUrl } from "./utils";

const LEGACY_DEMO_OWNER_IDS = new Set(["owner-demo"]);
const LEGACY_DEMO_OWNER_EMAILS = new Set(["demo@pettapbr.com"]);
const LEGACY_DEMO_PET_IDS = new Set(["pet-luna"]);
const LEGACY_DEMO_TAG_IDS = new Set(["tag-demo-001", "tag-demo-002"]);
const LEGACY_DEMO_TAG_CODES = new Set(["PTBR-NFC-001", "PTBR-NFC-002"]);

function normalizeNfcTags(tags: unknown): NfcTag[] {
  if (!Array.isArray(tags)) {
    return initialState.nfcTags;
  }

  const now = new Date().toISOString();

  return tags
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => {
      const tag = item as Partial<NfcTag>;

      return {
        id: tag.id ?? `tag-${Math.random().toString(36).slice(2, 10)}`,
        code: (tag.code ?? "").toUpperCase(),
        activationCode: tag.activationCode ?? "",
        ownerId: tag.ownerId ?? null,
        petId: tag.petId ?? null,
        status: tag.status ?? "unlinked",
        createdAt: tag.createdAt ?? now,
        updatedAt: tag.updatedAt ?? now,
      } as NfcTag;
    })
    .filter((tag) => Boolean(tag.code));
}

function normalizeOwners(owners: AppState["owners"]): AppState["owners"] {
  return owners.map((owner) => ({
    ...owner,
    subscription: createDefaultOwnerSubscription(owner.subscription),
    alerts: createDefaultOwnerAlerts(owner.alerts),
  }));
}

function removeLegacyDemoData(state: AppState): AppState {
  const ownerIdsToRemove = new Set(
    state.owners
      .filter(
        (owner) =>
          LEGACY_DEMO_OWNER_IDS.has(owner.id) || LEGACY_DEMO_OWNER_EMAILS.has(owner.email.toLowerCase()),
      )
      .map((owner) => owner.id),
  );

  const owners = state.owners.filter((owner) => !ownerIdsToRemove.has(owner.id));
  const pets = state.pets.filter(
    (pet) => !LEGACY_DEMO_PET_IDS.has(pet.id) && !ownerIdsToRemove.has(pet.ownerId),
  );
  const petIdsToKeep = new Set(pets.map((pet) => pet.id));

  const nfcTags = state.nfcTags.filter((tag) => {
    if (LEGACY_DEMO_TAG_IDS.has(tag.id) || LEGACY_DEMO_TAG_CODES.has(tag.code)) {
      return false;
    }

    if (tag.ownerId && ownerIdsToRemove.has(tag.ownerId)) {
      return false;
    }

    if (tag.petId && !petIdsToKeep.has(tag.petId)) {
      return false;
    }

    return true;
  });

  const scanEvents = state.scanEvents.filter(
    (event) => !ownerIdsToRemove.has(event.ownerId) && petIdsToKeep.has(event.petId),
  );

  const notifications = state.notifications.filter(
    (item) => !ownerIdsToRemove.has(item.ownerId) && petIdsToKeep.has(item.petId),
  );

  return {
    ...state,
    owners,
    pets,
    nfcTags,
    scanEvents,
    notifications,
    sessionOwnerId:
      state.sessionOwnerId && ownerIdsToRemove.has(state.sessionOwnerId) ? null : state.sessionOwnerId,
  };
}

function normalizeState(parsed: AppState): AppState {
  const sanitized = removeLegacyDemoData(parsed);

  return {
    ...sanitized,
    owners: normalizeOwners(sanitized.owners),
    nfcTags: normalizeNfcTags((sanitized as Partial<AppState>).nfcTags),
    scanEvents: sanitized.scanEvents.map((event) => ({
      ...event,
      source: event.source === "nfc" ? "nfc" : "direct",
    })),
    pets: sanitized.pets.map((pet) => {
      const parsedCoords = parseLatLngFromLocationUrl(pet.locationUrl ?? "");
      const lat = typeof pet.locationLat === "number" ? pet.locationLat : parsedCoords.lat;
      const lng = typeof pet.locationLng === "number" ? pet.locationLng : parsedCoords.lng;

      return {
        ...pet,
        locationLat: lat ?? null,
        locationLng: lng ?? null,
        locationLabel: pet.locationLabel ?? "",
        locationUrl: pet.locationUrl || buildGoogleMapsUrl(lat ?? null, lng ?? null),
      };
    }),
  };
}

export function loadState(): AppState {
  if (typeof window === "undefined") {
    return initialState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw) as AppState;

    if (!parsed || !Array.isArray(parsed.owners) || !Array.isArray(parsed.pets)) {
      return initialState;
    }

    return normalizeState(parsed);
  } catch {
    return initialState;
  }
}

export function persistState(state: AppState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
