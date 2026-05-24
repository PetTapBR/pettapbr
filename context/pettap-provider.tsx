"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { loadState, persistState } from "@/lib/storage";
import type {
  AccessNotification,
  ActivateNfcTagPayload,
  AppState,
  NfcTag,
  NfcTagStatus,
  Owner,
  OwnerAlertSettings,
  Pet,
  PetFormSubmission,
  PetStatus,
  PlanTier,
  ScanEvent,
  ScanSource,
} from "@/lib/types";
import { initialState } from "@/lib/seed";
import { createDefaultOwnerAlerts, createDefaultOwnerSubscription, isOwnerPro } from "@/lib/owner-defaults";
import { buildGoogleMapsUrl, createId, normalizeTagCode, slugify } from "@/lib/utils";
import { hasSupabase, supabase } from "@/lib/supabase";
import { uploadPetFile } from "@/lib/supabase-media";

interface AuthResult {
  ok: boolean;
  message?: string;
  requiresEmailConfirmation?: boolean;
}

interface LostPetAlertResponse {
  ok: boolean;
  notificationsSent?: number;
  message?: string;
  diagnostics?: {
    candidates?: number;
    skippedAlertsOff?: number;
    skippedWithoutLocation?: number;
    skippedOutOfRadius?: number;
    hasOriginCoordinates?: boolean;
    pushEnabled?: boolean;
    pushSent?: number;
    pushFailed?: number;
    pushSkippedNoSubscription?: number;
  };
}

interface PetTapContextValue {
  state: AppState;
  isReady: boolean;
  currentOwner: Owner | null;
  currentOwnerPets: Pet[];
  currentOwnerTags: NfcTag[];
  unreadNotifications: AccessNotification[];
  ownerScanEvents: ScanEvent[];
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (fullName: string, email: string, password: string, activationCode: string) => Promise<AuthResult>;
  logout: () => void;
  refreshCurrentOwner: () => Promise<void>;
  addPet: (payload: PetFormSubmission) => Promise<{ ok: boolean; petId?: string; message?: string }>;
  updatePet: (petId: string, payload: PetFormSubmission) => Promise<AuthResult>;
  updatePetStatus: (petId: string, status: PetStatus, reward?: string) => Promise<AuthResult>;
  updateCurrentOwnerPlan: (tier: PlanTier) => Promise<AuthResult>;
  updateCurrentOwnerAlertSettings: (settings: Partial<OwnerAlertSettings>) => Promise<AuthResult>;
  getPetById: (petId: string) => Pet | undefined;
  getPetBySlug: (slug: string) => Pet | undefined;
  recordScan: (slug: string, source: ScanSource, viewerLocation: string) => Pet | null;
  getTagByCode: (tagCode: string) => NfcTag | undefined;
  getTagByPetId: (petId: string) => NfcTag | undefined;
  activateNfcTag: (payload: ActivateNfcTagPayload) => Promise<AuthResult>;
  createNfcTag: (payload: { code?: string; activationCode?: string }) => Promise<{ ok: boolean; message?: string; tag?: NfcTag }>;
  setNfcTagStatus: (tagId: string, status: NfcTagStatus) => Promise<AuthResult>;
  unlinkNfcTag: (tagId: string) => Promise<AuthResult>;
  recordNfcScanByTag: (tagCode: string, viewerLocation: string) => Pet | null;
  resolvePetByTagCode: (tagCode: string) => Pet | null;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
}

const PetTapContext = createContext<PetTapContextValue | undefined>(undefined);

function ensureUniqueSlug(desired: string, pets: Pet[], currentPetId?: string) {
  const base = slugify(desired) || "pet";
  let candidate = base;
  let index = 2;

  while (pets.some((pet) => pet.slug === candidate && pet.id !== currentPetId)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function generateActivationCode() {
  return `ACT-${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeActivationCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase();
}

interface NfcTagRow {
  id: string;
  code: string;
  activation_code: string;
  owner_id: string | null;
  pet_id: string | null;
  status: NfcTagStatus;
  created_at: string;
  updated_at: string;
}

interface OwnerRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  created_at: string;
  plan_tier: PlanTier | null;
  plan_status: "active" | "inactive" | null;
  plan_provider: "manual" | "asaas" | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  plan_expires_at: string | null;
  plan_updated_at: string | null;
  alerts_receive_lost: boolean | null;
  alerts_radius_km: number | null;
  alerts_location_lat: number | null;
  alerts_location_lng: number | null;
  alerts_location_label: string | null;
}

interface PetRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  bio: string;
  age: string;
  breed: string;
  weight: string;
  city: string;
  avatar_url: string;
  whatsapp: string;
  phone: string;
  location_url: string;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string;
  reward: string;
  status: "safe" | "lost" | "found";
  allergies: string;
  medications: string;
  vaccines: string;
  created_at: string;
  updated_at: string;
}

interface PetMediaRow {
  id: string;
  pet_id: string;
  media_type: "photo" | "video";
  url: string;
  caption: string;
}

interface ScanEventRow {
  id: string;
  pet_id: string;
  owner_id: string;
  source: "nfc" | "direct";
  viewer_location: string;
  accessed_at: string;
}

interface NotificationRow {
  id: string;
  owner_id: string;
  pet_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function mapNfcTagRow(row: NfcTagRow): NfcTag {
  return {
    id: row.id,
    code: row.code,
    activationCode: normalizeActivationCode(row.activation_code),
    ownerId: row.owner_id,
    petId: row.pet_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOwnerRow(row: OwnerRow): Owner {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    password: row.password_hash || "__SUPABASE_AUTH__",
    subscription: createDefaultOwnerSubscription({
      tier: row.plan_tier ?? undefined,
      status: row.plan_status ?? undefined,
      provider: row.plan_provider ?? undefined,
      asaasCustomerId: row.asaas_customer_id ?? "",
      asaasSubscriptionId: row.asaas_subscription_id ?? "",
      expiresAt: row.plan_expires_at ?? undefined,
      updatedAt: row.plan_updated_at ?? undefined,
    }),
    alerts: createDefaultOwnerAlerts({
      receiveLostAlerts: Boolean(row.alerts_receive_lost),
      radiusKm: row.alerts_radius_km ?? undefined,
      locationLat: row.alerts_location_lat,
      locationLng: row.alerts_location_lng,
      locationLabel: row.alerts_location_label ?? "",
    }),
    createdAt: row.created_at,
  };
}

function mapPetRow(row: PetRow, mediaRows: PetMediaRow[]): Pet {
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    bio: row.bio,
    age: row.age,
    breed: row.breed,
    weight: row.weight,
    city: row.city,
    avatarUrl: row.avatar_url,
    whatsapp: row.whatsapp,
    phone: row.phone,
    locationUrl: row.location_url,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    locationLabel: row.location_label,
    reward: row.reward,
    status: row.status,
    medical: {
      allergies: row.allergies,
      medications: row.medications,
      vaccines: row.vaccines,
    },
    gallery: mediaRows.map((media) => ({
      id: media.id,
      type: media.media_type,
      url: media.url,
      caption: media.caption,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScanEventRow(row: ScanEventRow, petName: string): ScanEvent {
  return {
    id: row.id,
    petId: row.pet_id,
    petName,
    ownerId: row.owner_id,
    source: row.source,
    viewerLocation: row.viewer_location,
    createdAt: row.accessed_at,
  };
}

function mapNotificationRow(row: NotificationRow): AccessNotification {
  return {
    id: row.id,
    ownerId: row.owner_id,
    petId: row.pet_id,
    message: row.message,
    read: row.is_read,
    createdAt: row.created_at,
  };
}

function isPremiumPlan(owner: Owner | null) {
  return isOwnerPro(owner);
}

function getMainContact(values: PetFormSubmission["values"]) {
  return (values.whatsapp || values.phone).trim();
}

function sanitizePetValuesByPlan(owner: Owner, payload: PetFormSubmission) {
  if (isPremiumPlan(owner)) {
    return {
      values: payload.values,
      photoFiles: payload.photoFiles,
      videoFiles: payload.videoFiles,
      existingGallery: payload.existingGallery,
    };
  }

  const contact = getMainContact(payload.values);

  return {
    values: {
      ...payload.values,
      bio: "",
      age: "",
      breed: "",
      weight: "",
      city: "",
      whatsapp: contact,
      phone: "",
      locationLat: null,
      locationLng: null,
      locationLabel: "",
      reward: "",
      status: "safe" as const,
      allergies: "",
      medications: "",
      vaccines: "",
    },
    photoFiles: [] as File[],
    videoFiles: [] as File[],
    existingGallery: [] as PetFormSubmission["existingGallery"],
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "";
}

function isDuplicateCodeError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("duplicate key value") && message.includes("nfc_tags_code_key");
}

function isDuplicateSlugError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("duplicate key value") && message.includes("pets_slug_key");
}

function generateNextTagCode(usedCodes: Set<string>) {
  let counter = 1;
  let candidate = `PTBR-NFC-${String(counter).padStart(3, "0")}`;

  while (usedCodes.has(candidate)) {
    counter += 1;
    candidate = `PTBR-NFC-${String(counter).padStart(3, "0")}`;
  }

  return candidate;
}

async function fetchPetsByOwnerFromSupabase(ownerId: string) {
  if (!supabase) {
    return null as Pet[] | null;
  }

  const { data: petRows, error: petError } = await supabase
    .from("pets")
    .select(
      "id, owner_id, slug, name, bio, age, breed, weight, city, avatar_url, whatsapp, phone, location_url, location_lat, location_lng, location_label, reward, status, allergies, medications, vaccines, created_at, updated_at",
    )
    .eq("owner_id", ownerId);

  if (petError || !petRows) {
    return null as Pet[] | null;
  }

  if (petRows.length === 0) {
    return [] as Pet[];
  }

  const petIds = petRows.map((row) => (row as PetRow).id);

  let mediaRows: PetMediaRow[] = [];
  if (petIds.length > 0) {
    const { data: mediaData, error: mediaError } = await supabase
      .from("pet_media")
      .select("id, pet_id, media_type, url, caption")
      .in("pet_id", petIds);

    if (!mediaError && mediaData) {
      mediaRows = mediaData as PetMediaRow[];
    }
  }

  return (petRows as PetRow[]).map((row) =>
    mapPetRow(
      row,
      mediaRows.filter((mediaRow) => mediaRow.pet_id === row.id),
    ),
  );
}

async function slugExistsInSupabase(slug: string, currentPetId?: string) {
  if (!supabase) {
    return false;
  }

  let query = supabase.from("pets").select("id").eq("slug", slug).limit(1);

  if (currentPetId) {
    query = query.neq("id", currentPetId);
  }

  const { data, error } = await query;
  if (error) {
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function ensureAvailableSlug(desired: string, pets: Pet[], currentPetId?: string) {
  const base = slugify(desired) || "pet";
  let candidate = ensureUniqueSlug(desired, pets, currentPetId);
  let suffix = 2;

  while (await slugExistsInSupabase(candidate, currentPetId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function requireSupabaseConfigured() {
  if (!hasSupabase || !supabase) {
    return "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para salvar no banco e fazer upload de arquivos.";
  }

  return null;
}

async function syncOwnerWithSupabase(owner: Owner) {
  if (!supabase) {
    return;
  }

  const subscription = createDefaultOwnerSubscription(owner.subscription);
  const alerts = createDefaultOwnerAlerts(owner.alerts);
  const basePayload = {
    id: owner.id,
    full_name: owner.fullName,
    email: owner.email,
    password_hash: owner.password,
    created_at: owner.createdAt,
  };
  const extendedPayload = {
    ...basePayload,
    plan_tier: subscription.tier,
    plan_status: subscription.status,
    plan_provider: subscription.provider,
    asaas_customer_id: subscription.asaasCustomerId,
    asaas_subscription_id: subscription.asaasSubscriptionId,
    plan_expires_at: subscription.expiresAt,
    plan_updated_at: subscription.updatedAt,
    alerts_receive_lost: alerts.receiveLostAlerts,
    alerts_radius_km: alerts.radiusKm,
    alerts_location_lat: alerts.locationLat,
    alerts_location_lng: alerts.locationLng,
    alerts_location_label: alerts.locationLabel,
  };

  const extendedResult = await supabase.from("owners").upsert(extendedPayload, {
    onConflict: "id",
  });

  if (!extendedResult.error) {
    return;
  }

  const message = extendedResult.error.message.toLowerCase();
  const isMissingColumn = message.includes("column") && message.includes("does not exist");
  if (!isMissingColumn) {
    throw new Error(extendedResult.error.message);
  }

  const fallbackResult = await supabase.from("owners").upsert(basePayload, {
    onConflict: "id",
  });

  if (fallbackResult.error) {
    throw new Error(fallbackResult.error.message);
  }
}

async function fetchOwnerById(ownerId: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("owners")
    .select(
      "id, full_name, email, password_hash, created_at, plan_tier, plan_status, plan_provider, asaas_customer_id, asaas_subscription_id, plan_expires_at, plan_updated_at, alerts_receive_lost, alerts_radius_km, alerts_location_lat, alerts_location_lng, alerts_location_label",
    )
    .eq("id", ownerId)
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return mapOwnerRow(data[0] as OwnerRow);
}

async function syncNfcTagWithSupabase(tag: NfcTag) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("nfc_tags").upsert(
    {
      id: tag.id,
      code: tag.code,
      activation_code: tag.activationCode,
      owner_id: tag.ownerId,
      pet_id: tag.petId,
      status: tag.status,
      created_at: tag.createdAt,
      updated_at: tag.updatedAt,
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function syncPetWithSupabase(pet: Pet) {
  if (!supabase) {
    return;
  }

  const { error: petError } = await supabase.from("pets").upsert(
    {
      id: pet.id,
      owner_id: pet.ownerId,
      slug: pet.slug,
      name: pet.name,
      bio: pet.bio,
      age: pet.age,
      breed: pet.breed,
      weight: pet.weight,
      city: pet.city,
      avatar_url: pet.avatarUrl,
      whatsapp: pet.whatsapp,
      phone: pet.phone,
      location_url: pet.locationUrl,
      location_lat: pet.locationLat,
      location_lng: pet.locationLng,
      location_label: pet.locationLabel,
      reward: pet.reward,
      status: pet.status,
      allergies: pet.medical.allergies,
      medications: pet.medical.medications,
      vaccines: pet.medical.vaccines,
      created_at: pet.createdAt,
      updated_at: pet.updatedAt,
    },
    {
      onConflict: "id",
    },
  );

  if (petError) {
    throw new Error(petError.message);
  }

  const { error: deleteMediaError } = await supabase.from("pet_media").delete().eq("pet_id", pet.id);

  if (deleteMediaError) {
    throw new Error(deleteMediaError.message);
  }

  if (pet.gallery.length > 0) {
    const { error: mediaError } = await supabase.from("pet_media").insert(
      pet.gallery.map((media) => ({
        id: media.id,
        pet_id: pet.id,
        media_type: media.type,
        url: media.url,
        caption: media.caption,
      })),
    );

    if (mediaError) {
      throw new Error(mediaError.message);
    }
  }
}

function usePetTapValue() {
  const [state, setState] = useState<AppState>(initialState);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadState());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    persistState(state);
  }, [isReady, state]);

  useEffect(() => {
    if (!isReady || !supabase) {
      return;
    }

    const supabaseClient = supabase;
    let isMounted = true;

    async function hydrateTagsFromSupabase() {
      const { data, error } = await supabaseClient
        .from("nfc_tags")
        .select("id, code, activation_code, owner_id, pet_id, status, created_at, updated_at");

      if (!isMounted || error || !data) {
        return;
      }

      const remoteTags = data.map((row) => mapNfcTagRow(row as NfcTagRow));

      setState((prev) => {
        const mergedById = new Map(prev.nfcTags.map((tag) => [tag.id, tag]));

        for (const tag of remoteTags) {
          mergedById.set(tag.id, tag);
        }

        return {
          ...prev,
          nfcTags: Array.from(mergedById.values()),
        };
      });
    }

    void hydrateTagsFromSupabase();

    return () => {
      isMounted = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !supabase || !state.sessionOwnerId) {
      return;
    }

    const ownerId = state.sessionOwnerId;
    let isMounted = true;

    async function hydrateOwnerPetsFromSupabase() {
      const remotePets = await fetchPetsByOwnerFromSupabase(ownerId);

      if (remotePets === null) {
        return;
      }

      if (!isMounted) {
        return;
      }

      setState((prev) => {
        if (prev.sessionOwnerId !== ownerId) {
          return prev;
        }

        const petsFromOtherOwners = prev.pets.filter((pet) => pet.ownerId !== ownerId);

        return {
          ...prev,
          pets: [...remotePets, ...petsFromOtherOwners],
        };
      });
    }

    void hydrateOwnerPetsFromSupabase();

    return () => {
      isMounted = false;
    };
  }, [isReady, state.sessionOwnerId]);

  useEffect(() => {
    if (!isReady || !supabase || !state.sessionOwnerId) {
      return;
    }

    const supabaseClient = supabase;
    const ownerId = state.sessionOwnerId;
    let isMounted = true;

    async function hydrateOwnerActivityFromSupabase() {
      const [scanEventsResult, notificationsResult] = await Promise.all([
        supabaseClient
          .from("scan_events")
          .select("id, pet_id, owner_id, source, viewer_location, accessed_at")
          .eq("owner_id", ownerId)
          .order("accessed_at", { ascending: false }),
        supabaseClient
          .from("notifications")
          .select("id, owner_id, pet_id, message, is_read, created_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      const scanRows = (scanEventsResult.data ?? []) as ScanEventRow[];
      const notificationRows = (notificationsResult.data ?? []) as NotificationRow[];

      let petNamesById = new Map<string, string>();
      if (scanRows.length > 0) {
        const petIds = Array.from(new Set(scanRows.map((row) => row.pet_id).filter(Boolean)));

        if (petIds.length > 0) {
          const { data: petNameRows } = await supabaseClient
            .from("pets")
            .select("id, name")
            .in("id", petIds);

          petNamesById = new Map(
            (petNameRows ?? []).map((row) => [
              (row as { id: string }).id,
              (row as { name: string }).name,
            ]),
          );
        }
      }

      const remoteScanEvents = scanRows.map((row) =>
        mapScanEventRow(row, petNamesById.get(row.pet_id) ?? "Pet"),
      );
      const remoteNotifications = notificationRows.map((row) => mapNotificationRow(row));

      setState((prev) => {
        if (prev.sessionOwnerId !== ownerId) {
          return prev;
        }

        const scanEventsFromOtherOwners = prev.scanEvents.filter((event) => event.ownerId !== ownerId);
        const notificationsFromOtherOwners = prev.notifications.filter(
          (notification) => notification.ownerId !== ownerId,
        );

        return {
          ...prev,
          scanEvents: [...remoteScanEvents, ...scanEventsFromOtherOwners],
          notifications: [...remoteNotifications, ...notificationsFromOtherOwners],
        };
      });
    }

    const refreshOwnerActivity = () => {
      void hydrateOwnerActivityFromSupabase();
    };

    refreshOwnerActivity();

    const intervalId = window.setInterval(refreshOwnerActivity, 12000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshOwnerActivity();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      isMounted = false;
    };
  }, [isReady, state.sessionOwnerId]);
  const currentOwner = useMemo(
    () => state.owners.find((owner) => owner.id === state.sessionOwnerId) ?? null,
    [state.owners, state.sessionOwnerId],
  );

  const currentOwnerPets = useMemo(() => {
    if (!currentOwner) {
      return [];
    }

    return state.pets.filter((pet) => pet.ownerId === currentOwner.id);
  }, [currentOwner, state.pets]);

  const currentOwnerTags = useMemo(() => {
    if (!currentOwner) {
      return [];
    }

    return state.nfcTags.filter((tag) => tag.ownerId === currentOwner.id);
  }, [currentOwner, state.nfcTags]);

  const unreadNotifications = useMemo(() => {
    if (!currentOwner) {
      return [];
    }

    return state.notifications.filter(
      (notification) => notification.ownerId === currentOwner.id && !notification.read,
    );
  }, [currentOwner, state.notifications]);

  const ownerScanEvents = useMemo(() => {
    if (!currentOwner) {
      return [];
    }

    return state.scanEvents
      .filter((event) => event.ownerId === currentOwner.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [currentOwner, state.scanEvents]);

  const refreshCurrentOwner = useCallback(async () => {
    if (!currentOwner || !supabase) {
      return;
    }

    const remoteOwner = await fetchOwnerById(currentOwner.id);
    if (!remoteOwner) {
      return;
    }

    setState((prev) => ({
      ...prev,
      owners: prev.owners.map((owner) => (owner.id === remoteOwner.id ? remoteOwner : owner)),
    }));
  }, [currentOwner]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const normalized = email.trim().toLowerCase();

      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalized,
          password,
        });

        if (error) {
          return {
            ok: false,
            message: error.message || "Credenciais invalidas.",
          };
        }

        const authUser = data.user;
        if (!authUser) {
          return {
            ok: false,
            message: "Nao foi possivel concluir o login.",
          };
        }

        const localOwner = state.owners.find((owner) => owner.id === authUser.id);
        const remoteOwner = await fetchOwnerById(authUser.id);
        const fallbackName = normalized.split("@")[0] || "Tutor";
        const fullNameFromMetadata =
          typeof authUser.user_metadata?.full_name === "string"
            ? authUser.user_metadata.full_name
            : null;

        const owner: Owner = {
          id: authUser.id,
          fullName:
            remoteOwner?.fullName ??
            localOwner?.fullName ??
            fullNameFromMetadata ??
            fallbackName,
          email: normalized,
          password: localOwner?.password ?? remoteOwner?.password ?? "__SUPABASE_AUTH__",
          subscription: createDefaultOwnerSubscription(
            remoteOwner?.subscription ?? localOwner?.subscription,
          ),
          alerts: createDefaultOwnerAlerts(remoteOwner?.alerts ?? localOwner?.alerts),
          createdAt:
            remoteOwner?.createdAt ??
            localOwner?.createdAt ??
            authUser.created_at ??
            new Date().toISOString(),
        };

        try {
          await syncOwnerWithSupabase(owner);
        } catch (syncError) {
          return {
            ok: false,
            message:
              syncError instanceof Error
                ? syncError.message
                : "Falha ao sincronizar conta no banco.",
          };
        }

        setState((prev) => ({
          ...prev,
          owners: prev.owners.some((candidate) => candidate.id === owner.id)
            ? prev.owners.map((candidate) => (candidate.id === owner.id ? owner : candidate))
            : [...prev.owners, owner],
          sessionOwnerId: owner.id,
        }));

        return { ok: true };
      }

      const found = state.owners.find(
        (owner) => owner.email.toLowerCase() === normalized && owner.password === password,
      );

      if (!found) {
        return {
          ok: false,
          message: "Credenciais invalidas.",
        };
      }

      setState((prev) => ({
        ...prev,
        sessionOwnerId: found.id,
      }));

      return { ok: true };
    },
    [state.owners],
  );

  const register = useCallback(
    async (
      fullName: string,
      email: string,
      password: string,
      activationCodeInput: string,
    ): Promise<AuthResult> => {
      const normalized = email.trim().toLowerCase();
      const activationCode = normalizeActivationCode(activationCodeInput);

      if (!activationCode) {
        return {
          ok: false,
          message: "Informe a chave de ativacao enviada com a tag NFC.",
        };
      }

      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      if (!supabase) {
        return {
          ok: false,
          message: "Supabase indisponivel no momento.",
        };
      }

      const { data: existingOwners, error: lookupError } = await supabase
        .from("owners")
        .select("id")
        .eq("email", normalized)
        .limit(1);

      if (lookupError) {
        return {
          ok: false,
          message: lookupError.message || "Falha ao validar e-mail.",
        };
      }

      if ((existingOwners ?? []).length > 0) {
        return {
          ok: false,
          message: "Este e-mail ja esta cadastrado.",
        };
      }

      const { data: tagRows, error: tagLookupError } = await supabase
        .from("nfc_tags")
        .select("id, code, activation_code, owner_id, pet_id, status, created_at, updated_at")
        .eq("activation_code", activationCode)
        .limit(2);

      if (tagLookupError) {
        return {
          ok: false,
          message: tagLookupError.message || "Falha ao validar chave de ativacao.",
        };
      }

      if (!tagRows || tagRows.length === 0) {
        return {
          ok: false,
          message: "Chave de ativacao invalida.",
        };
      }

      if (tagRows.length > 1) {
        return {
          ok: false,
          message: "Chave de ativacao duplicada. Contate o suporte para regularizar esta tag.",
        };
      }

      const selectedTag = tagRows[0] as NfcTagRow;

      if (selectedTag.status === "disabled") {
        return {
          ok: false,
          message: "Esta tag esta desativada. Contate o suporte.",
        };
      }

      if (selectedTag.owner_id) {
        return {
          ok: false,
          message: "Esta chave de ativacao ja foi utilizada.",
        };
      }

      const emailRedirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo,
        },
      });

      if (signUpError) {
        return {
          ok: false,
          message: signUpError.message || "Falha ao criar conta.",
        };
      }

      const authUser = signUpData.user;
      if (!authUser) {
        return {
          ok: false,
          message: "Nao foi possivel criar o usuario de autenticacao.",
        };
      }

      const newOwner: Owner = {
        id: authUser.id,
        fullName: fullName.trim(),
        email: normalized,
        password: "__SUPABASE_AUTH__",
        subscription: createDefaultOwnerSubscription(),
        alerts: createDefaultOwnerAlerts(),
        createdAt: authUser.created_at ?? new Date().toISOString(),
      };

      try {
        await syncOwnerWithSupabase(newOwner);
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao salvar dono no banco.",
        };
      }

      const tagUpdatedAt = new Date().toISOString();
      const { data: claimedRows, error: claimError } = await supabase
        .from("nfc_tags")
        .update({
          owner_id: newOwner.id,
          updated_at: tagUpdatedAt,
        })
        .eq("id", selectedTag.id)
        .is("owner_id", null)
        .select("id, code, activation_code, owner_id, pet_id, status, created_at, updated_at")
        .limit(1);

      if (claimError) {
        return {
          ok: false,
          message: claimError.message || "Conta criada, mas falhou ao vincular a chave de ativacao.",
        };
      }

      if (!claimedRows || claimedRows.length === 0) {
        return {
          ok: false,
          message:
            "Esta chave de ativacao acabou de ser utilizada por outra conta. Tente outra chave.",
        };
      }

      const linkedTag = mapNfcTagRow(claimedRows[0] as NfcTagRow);

      const isConfirmed = Boolean(signUpData.session);

      setState((prev) => ({
        ...prev,
        owners: prev.owners.some((owner) => owner.id === newOwner.id)
          ? prev.owners.map((owner) => (owner.id === newOwner.id ? newOwner : owner))
          : [...prev.owners, newOwner],
        nfcTags: prev.nfcTags.some((tag) => tag.id === linkedTag.id)
          ? prev.nfcTags.map((tag) => (tag.id === linkedTag.id ? linkedTag : tag))
          : [linkedTag, ...prev.nfcTags],
        sessionOwnerId: isConfirmed ? newOwner.id : prev.sessionOwnerId,
      }));

      if (!isConfirmed) {
        return {
          ok: true,
          requiresEmailConfirmation: true,
          message:
            "Conta criada e chave vinculada. Verifique seu e-mail para confirmar antes de entrar.",
        };
      }

      return { ok: true, message: "Conta criada com sucesso e chave NFC vinculada." };
    },
    [],
  );

  const logout = useCallback(() => {
    if (supabase) {
      void supabase.auth.signOut();
    }

    setState((prev) => ({
      ...prev,
      sessionOwnerId: null,
    }));
  }, []);

  const updateCurrentOwnerPlan = useCallback(
    async (tier: PlanTier): Promise<AuthResult> => {
      if (!currentOwner) {
        return {
          ok: false,
          message: "Login necessario.",
        };
      }

      const nextOwner: Owner = {
        ...currentOwner,
        subscription: createDefaultOwnerSubscription({
          ...currentOwner.subscription,
          tier,
          status: "active",
          provider: tier === "pro" ? "asaas" : "manual",
          expiresAt: tier === "pro" ? currentOwner.subscription.expiresAt : null,
          updatedAt: new Date().toISOString(),
        }),
      };

      try {
        await syncOwnerWithSupabase(nextOwner);

        setState((prev) => ({
          ...prev,
          owners: prev.owners.map((owner) => (owner.id === nextOwner.id ? nextOwner : owner)),
        }));

        return {
          ok: true,
          message:
            tier === "pro"
              ? "Plano Pro ativado com sucesso."
              : "Plano Start ativado com sucesso.",
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao atualizar plano.",
        };
      }
    },
    [currentOwner],
  );

  const updateCurrentOwnerAlertSettings = useCallback(
    async (settings: Partial<OwnerAlertSettings>): Promise<AuthResult> => {
      if (!currentOwner) {
        return {
          ok: false,
          message: "Login necessario.",
        };
      }

      const nextOwner: Owner = {
        ...currentOwner,
        alerts: createDefaultOwnerAlerts({
          ...currentOwner.alerts,
          ...settings,
        }),
      };

      try {
        await syncOwnerWithSupabase(nextOwner);

        setState((prev) => ({
          ...prev,
          owners: prev.owners.map((owner) => (owner.id === nextOwner.id ? nextOwner : owner)),
        }));

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao atualizar alertas.",
        };
      }
    },
    [currentOwner],
  );

  const notifyNearbyTutorsAboutLostPet = useCallback(
    async (pet: Pet, owner: Owner): Promise<{ count: number; warning?: string }> => {
      try {
        const response = await fetch("/api/alerts/lost-pet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerId: owner.id,
            petId: pet.id,
          }),
        });

        const payload = (await response.json()) as LostPetAlertResponse;
        if (response.ok && payload.ok) {
          return {
            count: payload.notificationsSent ?? 0,
          };
        }

        const diagnostics = payload.diagnostics
          ? ` (candidatos=${payload.diagnostics.candidates ?? 0}, sem-alerta=${payload.diagnostics.skippedAlertsOff ?? 0}, sem-local=${payload.diagnostics.skippedWithoutLocation ?? 0}, fora-raio=${payload.diagnostics.skippedOutOfRadius ?? 0}, push-ativo=${payload.diagnostics.pushEnabled ? "sim" : "nao"}, push-enviado=${payload.diagnostics.pushSent ?? 0}, push-falhou=${payload.diagnostics.pushFailed ?? 0})`
          : "";
        return {
          count: 0,
          warning: (payload.message ?? "Falha ao enviar alertas de proximidade.") + diagnostics,
        };
      } catch {
        return {
          count: 0,
          warning: "Falha de conexao ao enviar alertas de proximidade.",
        };
      }
    },
    [],
  );

  const addPet = useCallback(
    async (payload: PetFormSubmission) => {
      if (!currentOwner) {
        return {
          ok: false,
          message: "Login necessario.",
        };
      }

      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      try {
        await syncOwnerWithSupabase(currentOwner);
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao sincronizar dono.",
        };
      }

      const normalizedPayload = sanitizePetValuesByPlan(currentOwner, payload);
      const contact = getMainContact(normalizedPayload.values);

      if (!normalizedPayload.values.name.trim() || !contact) {
        return {
          ok: false,
          message: "Preencha nome do pet e um contato principal.",
        };
      }

      const now = new Date().toISOString();
      const id = createId("pet");
      const slug = await ensureAvailableSlug(normalizedPayload.values.name, state.pets);

      if (!payload.avatarFile) {
        return {
          ok: false,
          message: "Envie uma foto principal.",
        };
      }

      try {
        const avatar = await uploadPetFile({
          ownerId: currentOwner.id,
          petId: id,
          file: payload.avatarFile,
          mediaFolder: "avatar",
        });

        const uploadedPhotos = await Promise.all(
          normalizedPayload.photoFiles.map(async (file) => {
            const result = await uploadPetFile({
              ownerId: currentOwner.id,
              petId: id,
              file,
              mediaFolder: "photos",
            });

            return {
              id: createId("media"),
              type: "photo" as const,
              url: result.publicUrl,
              caption: file.name || "Foto",
            };
          }),
        );

        const uploadedVideos = await Promise.all(
          normalizedPayload.videoFiles.map(async (file) => {
            const result = await uploadPetFile({
              ownerId: currentOwner.id,
              petId: id,
              file,
              mediaFolder: "videos",
            });

            return {
              id: createId("media"),
              type: "video" as const,
              url: result.publicUrl,
              caption: file.name || "Video",
            };
          }),
        );

        let pet: Pet = {
          id,
          ownerId: currentOwner.id,
          slug,
          name: normalizedPayload.values.name.trim(),
          bio: normalizedPayload.values.bio.trim(),
          age: normalizedPayload.values.age.trim(),
          breed: normalizedPayload.values.breed.trim(),
          weight: normalizedPayload.values.weight.trim(),
          city: normalizedPayload.values.city.trim(),
          avatarUrl: avatar.publicUrl,
          whatsapp: contact,
          phone: normalizedPayload.values.phone.trim(),
          locationUrl: buildGoogleMapsUrl(
            normalizedPayload.values.locationLat,
            normalizedPayload.values.locationLng,
          ),
          locationLat: normalizedPayload.values.locationLat,
          locationLng: normalizedPayload.values.locationLng,
          locationLabel: normalizedPayload.values.locationLabel.trim(),
          reward: normalizedPayload.values.reward.trim(),
          status: normalizedPayload.values.status,
          medical: {
            allergies: normalizedPayload.values.allergies.trim(),
            medications: normalizedPayload.values.medications.trim(),
            vaccines: normalizedPayload.values.vaccines.trim(),
          },
          gallery: [...uploadedPhotos, ...uploadedVideos],
          createdAt: now,
          updatedAt: now,
        };

        try {
          await syncPetWithSupabase(pet);
        } catch (error) {
          if (!isDuplicateSlugError(error)) {
            throw error;
          }

          const retrySlug = await ensureAvailableSlug(
            `${normalizedPayload.values.name}-${Date.now()}`,
            state.pets,
          );

          pet = {
            ...pet,
            slug: retrySlug,
            updatedAt: new Date().toISOString(),
          };

          await syncPetWithSupabase(pet);
        }

        setState((prev) => ({
          ...prev,
          pets: [pet, ...prev.pets],
        }));

        return {
          ok: true,
          petId: id,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao salvar pet.",
        };
      }
    },
    [currentOwner, state.pets],
  );

  const updatePet = useCallback(
    async (petId: string, payload: PetFormSubmission): Promise<AuthResult> => {
      const target = state.pets.find((pet) => pet.id === petId);

      if (!target) {
        return {
          ok: false,
          message: "Pet nao encontrado.",
        };
      }

      if (!currentOwner || target.ownerId !== currentOwner.id) {
        return {
          ok: false,
          message: "Sem permissao para editar este pet.",
        };
      }

      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      const normalizedPayload = sanitizePetValuesByPlan(currentOwner, payload);
      const contact = getMainContact(normalizedPayload.values);

      if (!normalizedPayload.values.name.trim() || !contact) {
        return {
          ok: false,
          message: "Preencha nome do pet e um contato principal.",
        };
      }

      const nextSlug = await ensureAvailableSlug(normalizedPayload.values.name, state.pets, petId);

      try {
        let avatarUrl = payload.existingAvatarUrl || target.avatarUrl;

        if (payload.avatarFile) {
          const avatar = await uploadPetFile({
            ownerId: currentOwner.id,
            petId,
            file: payload.avatarFile,
            mediaFolder: "avatar",
          });
          avatarUrl = avatar.publicUrl;
        }

        const uploadedPhotos = await Promise.all(
          normalizedPayload.photoFiles.map(async (file) => {
            const result = await uploadPetFile({
              ownerId: currentOwner.id,
              petId,
              file,
              mediaFolder: "photos",
            });

            return {
              id: createId("media"),
              type: "photo" as const,
              url: result.publicUrl,
              caption: file.name || "Foto",
            };
          }),
        );

        const uploadedVideos = await Promise.all(
          normalizedPayload.videoFiles.map(async (file) => {
            const result = await uploadPetFile({
              ownerId: currentOwner.id,
              petId,
              file,
              mediaFolder: "videos",
            });

            return {
              id: createId("media"),
              type: "video" as const,
              url: result.publicUrl,
              caption: file.name || "Video",
            };
          }),
        );

        const updatedPet: Pet = {
          ...target,
          slug: nextSlug,
          name: normalizedPayload.values.name.trim(),
          bio: normalizedPayload.values.bio.trim(),
          age: normalizedPayload.values.age.trim(),
          breed: normalizedPayload.values.breed.trim(),
          weight: normalizedPayload.values.weight.trim(),
          city: normalizedPayload.values.city.trim(),
          avatarUrl,
          whatsapp: contact,
          phone: normalizedPayload.values.phone.trim(),
          locationUrl: buildGoogleMapsUrl(
            normalizedPayload.values.locationLat,
            normalizedPayload.values.locationLng,
          ),
          locationLat: normalizedPayload.values.locationLat,
          locationLng: normalizedPayload.values.locationLng,
          locationLabel: normalizedPayload.values.locationLabel.trim(),
          reward: normalizedPayload.values.reward.trim(),
          status: normalizedPayload.values.status,
          medical: {
            allergies: normalizedPayload.values.allergies.trim(),
            medications: normalizedPayload.values.medications.trim(),
            vaccines: normalizedPayload.values.vaccines.trim(),
          },
          gallery: [...normalizedPayload.existingGallery, ...uploadedPhotos, ...uploadedVideos],
          updatedAt: new Date().toISOString(),
        };

        try {
          await syncPetWithSupabase(updatedPet);
        } catch (error) {
          if (!isDuplicateSlugError(error)) {
            throw error;
          }

          const retrySlug = await ensureAvailableSlug(
            `${normalizedPayload.values.name}-${Date.now()}`,
            state.pets,
            petId,
          );

          const retryPet: Pet = {
            ...updatedPet,
            slug: retrySlug,
            updatedAt: new Date().toISOString(),
          };

          await syncPetWithSupabase(retryPet);
          updatedPet.slug = retryPet.slug;
          updatedPet.updatedAt = retryPet.updatedAt;
        }

        setState((prev) => ({
          ...prev,
          pets: prev.pets.map((pet) => (pet.id === petId ? updatedPet : pet)),
        }));

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao atualizar pet.",
        };
      }
    },
    [currentOwner, state.pets],
  );

  const updatePetStatus = useCallback(
    async (petId: string, status: PetStatus, reward = ""): Promise<AuthResult> => {
      const target = state.pets.find((pet) => pet.id === petId);

      if (!target) {
        return {
          ok: false,
          message: "Pet nao encontrado.",
        };
      }

      if (!currentOwner || target.ownerId !== currentOwner.id) {
        return {
          ok: false,
          message: "Sem permissao para alterar este pet.",
        };
      }

      if (!isPremiumPlan(currentOwner)) {
        return {
          ok: false,
          message: "Modo perdido e status avancado estao disponiveis apenas no Plano Pro.",
        };
      }

      const updatedPet: Pet = {
        ...target,
        status,
        reward: status === "lost" ? reward || target.reward : "",
        updatedAt: new Date().toISOString(),
      };

      if (supabase) {
        const { error } = await supabase
          .from("pets")
          .update({
            status: updatedPet.status,
            reward: updatedPet.reward,
            updated_at: updatedPet.updatedAt,
          })
          .eq("id", petId);

        if (error) {
          return {
            ok: false,
            message: error.message || "Falha ao atualizar status do pet.",
          };
        }
      }

      setState((prev) => ({
        ...prev,
        pets: prev.pets.map((pet) => (pet.id === petId ? updatedPet : pet)),
      }));

      if (status !== "lost") {
        return { ok: true };
      }

      const alertResult = await notifyNearbyTutorsAboutLostPet(updatedPet, currentOwner);
      if (alertResult.count > 0) {
        return {
          ok: true,
          message: `Pet marcado como perdido. Alerta enviado para ${alertResult.count} tutor(es) proximos.`,
        };
      }

      return {
        ok: true,
        message: alertResult.warning
          ? `Pet marcado como perdido, mas houve problema no envio dos alertas: ${alertResult.warning}`
          : "Pet marcado como perdido. Nenhum tutor proximo com alerta ativo e localizacao configurada foi encontrado.",
      };
    },
    [currentOwner, notifyNearbyTutorsAboutLostPet, state.pets],
  );

  const getPetById = useCallback(
    (petId: string) => state.pets.find((pet) => pet.id === petId),
    [state.pets],
  );

  const getPetBySlug = useCallback(
    (slug: string) => state.pets.find((pet) => pet.slug === slug),
    [state.pets],
  );

  const getTagByCode = useCallback(
    (tagCode: string) => {
      const normalized = normalizeTagCode(tagCode);
      return state.nfcTags.find((tag) => tag.code === normalized);
    },
    [state.nfcTags],
  );

  const getTagByPetId = useCallback(
    (petId: string) => state.nfcTags.find((tag) => tag.petId === petId && tag.status === "active"),
    [state.nfcTags],
  );

  const resolvePetByTagCode = useCallback(
    (tagCode: string) => {
      const tag = getTagByCode(tagCode);

      if (!tag || tag.status !== "active" || !tag.petId) {
        return null;
      }

      return state.pets.find((pet) => pet.id === tag.petId) ?? null;
    },
    [getTagByCode, state.pets],
  );

  const activateNfcTag = useCallback(
    async (payload: ActivateNfcTagPayload): Promise<AuthResult> => {
      if (!currentOwner) {
        return {
          ok: false,
          message: "Login necessario para ativar tag NFC.",
        };
      }

      const normalizedTagCode = normalizeTagCode(payload.tagCode);
      const providedTagCode = normalizeTagCode(payload.activationCode);

      const tag = state.nfcTags.find((item) => item.code === normalizedTagCode);
      if (!tag) {
        return {
          ok: false,
          message: "Tag NFC nao encontrada.",
        };
      }

      if (tag.status === "disabled") {
        return {
          ok: false,
          message: "Esta tag esta desativada.",
        };
      }

      if (!providedTagCode) {
        return {
          ok: false,
          message: "Informe o Codigo NFC da tag.",
        };
      }

      if (providedTagCode !== normalizedTagCode) {
        return {
          ok: false,
          message: "Codigo NFC informado nao confere com esta tag.",
        };
      }

      if (tag.ownerId && tag.ownerId !== currentOwner.id) {
        return {
          ok: false,
          message: "Esta tag ja pertence a outro tutor.",
        };
      }

      const pet = state.pets.find((item) => item.id === payload.petId);
      if (!pet) {
        return {
          ok: false,
          message: "Pet nao encontrado.",
        };
      }

      if (pet.ownerId !== currentOwner.id) {
        return {
          ok: false,
          message: "Voce so pode vincular tags aos seus pets.",
        };
      }

      const existingTagForPet = state.nfcTags.find(
        (item) => item.petId === payload.petId && item.id !== tag.id,
      );
      if (existingTagForPet) {
        return {
          ok: false,
          message: `Este pet ja possui uma tag NFC vinculada (${existingTagForPet.code}).`,
        };
      }

      if (tag.ownerId === currentOwner.id && tag.petId === payload.petId && tag.status === "active") {
        return {
          ok: true,
          message: "Esta tag ja esta vinculada a este pet.",
        };
      }

      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      const updatedTag: NfcTag = {
        ...tag,
        ownerId: currentOwner.id,
        petId: payload.petId,
        status: "active",
        updatedAt: new Date().toISOString(),
      };

      try {
        await syncNfcTagWithSupabase(updatedTag);

        setState((prev) => ({
          ...prev,
          nfcTags: prev.nfcTags.map((item) => (item.id === updatedTag.id ? updatedTag : item)),
        }));

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao ativar tag NFC.",
        };
      }
    },
    [currentOwner, state.nfcTags, state.pets],
  );

  const createNfcTag = useCallback(
    async (payload: { code?: string; activationCode?: string }) => {
      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      if (!supabase) {
        return {
          ok: false,
          message: "Supabase indisponivel no momento.",
        };
      }

      const requestedCode = normalizeTagCode(payload.code ?? "");
      const requestedActivationCode = normalizeActivationCode(payload.activationCode);
      const maxAttempts = requestedCode ? 1 : 10;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        let code = requestedCode;

        if (!requestedCode) {
          const { data: existingTagCodeRows, error: existingTagCodeError } = await supabase
            .from("nfc_tags")
            .select("code");

          if (existingTagCodeError) {
            return {
              ok: false,
              message: existingTagCodeError.message || "Falha ao listar codigos de tags existentes.",
            };
          }

          const usedCodes = new Set<string>(state.nfcTags.map((tag) => tag.code));

          for (const row of existingTagCodeRows ?? []) {
            const codeFromRow = normalizeTagCode((row as { code?: string }).code ?? "");
            if (codeFromRow) {
              usedCodes.add(codeFromRow);
            }
          }

          code = generateNextTagCode(usedCodes);
        }

        if (state.nfcTags.some((tag) => tag.code === code)) {
          if (!requestedCode) {
            continue;
          }

          return {
            ok: false,
            message: "Ja existe uma tag com este codigo.",
          };
        }

        const activationCode = requestedActivationCode || generateActivationCode();

        if (
          state.nfcTags.some(
            (tag) =>
              normalizeActivationCode(tag.activationCode) ===
              normalizeActivationCode(activationCode),
          )
        ) {
          if (!requestedActivationCode) {
            continue;
          }

          return {
            ok: false,
            message: "Ja existe uma tag com esta chave de ativacao.",
          };
        }

        const { data: existingCodeRows, error: existingCodeError } = await supabase
          .from("nfc_tags")
          .select("id")
          .eq("code", code)
          .limit(1);

        if (existingCodeError) {
          return {
            ok: false,
            message: existingCodeError.message || "Falha ao validar codigo da tag.",
          };
        }

        if ((existingCodeRows ?? []).length > 0) {
          if (!requestedCode) {
            continue;
          }

          return {
            ok: false,
            message: "Ja existe uma tag com este codigo.",
          };
        }

        const { data: existingActivationRows, error: existingActivationError } = await supabase
          .from("nfc_tags")
          .select("id")
          .eq("activation_code", activationCode)
          .limit(1);

        if (existingActivationError) {
          return {
            ok: false,
            message: existingActivationError.message || "Falha ao validar chave de ativacao.",
          };
        }

        if ((existingActivationRows ?? []).length > 0) {
          if (!requestedActivationCode) {
            continue;
          }

          return {
            ok: false,
            message: "Ja existe uma tag com esta chave de ativacao.",
          };
        }

        const now = new Date().toISOString();
        const tag: NfcTag = {
          id: createId("tag"),
          code,
          activationCode,
          ownerId: null,
          petId: null,
          status: "unlinked",
          createdAt: now,
          updatedAt: now,
        };

        try {
          await syncNfcTagWithSupabase(tag);
          setState((prev) => ({
            ...prev,
            nfcTags: [tag, ...prev.nfcTags],
          }));

          return {
            ok: true,
            tag,
          };
        } catch (error) {
          if (isDuplicateCodeError(error) && !requestedCode) {
            continue;
          }

          if (isDuplicateCodeError(error)) {
            return {
              ok: false,
              message: "Ja existe uma tag com este codigo.",
            };
          }

          return {
            ok: false,
            message: getErrorMessage(error) || "Falha ao criar tag NFC.",
          };
        }
      }

      return {
        ok: false,
        message: "Nao foi possivel gerar um codigo NFC unico. Tente novamente.",
      };
    },
    [state.nfcTags],
  );

  const setNfcTagStatus = useCallback(
    async (tagId: string, status: NfcTagStatus): Promise<AuthResult> => {
      const tag = state.nfcTags.find((item) => item.id === tagId);
      if (!tag) {
        return {
          ok: false,
          message: "Tag nao encontrada.",
        };
      }

      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      const updatedTag: NfcTag = {
        ...tag,
        status,
        updatedAt: new Date().toISOString(),
      };

      try {
        await syncNfcTagWithSupabase(updatedTag);
        setState((prev) => ({
          ...prev,
          nfcTags: prev.nfcTags.map((item) => (item.id === tagId ? updatedTag : item)),
        }));

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao atualizar status da tag.",
        };
      }
    },
    [state.nfcTags],
  );

  const unlinkNfcTag = useCallback(
    async (tagId: string): Promise<AuthResult> => {
      const tag = state.nfcTags.find((item) => item.id === tagId);
      if (!tag) {
        return {
          ok: false,
          message: "Tag nao encontrada.",
        };
      }

      const supabaseErrorMessage = requireSupabaseConfigured();
      if (supabaseErrorMessage) {
        return {
          ok: false,
          message: supabaseErrorMessage,
        };
      }

      const updatedTag: NfcTag = {
        ...tag,
        ownerId: null,
        petId: null,
        status: "unlinked",
        updatedAt: new Date().toISOString(),
      };

      try {
        await syncNfcTagWithSupabase(updatedTag);
        setState((prev) => ({
          ...prev,
          nfcTags: prev.nfcTags.map((item) => (item.id === tagId ? updatedTag : item)),
        }));

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao desvincular tag.",
        };
      }
    },
    [state.nfcTags],
  );

  const recordScan = useCallback(
    (slug: string, source: ScanSource, viewerLocation: string) => {
      const pet = state.pets.find((candidate) => candidate.slug === slug);

      if (!pet) {
        return null;
      }

      const event: ScanEvent = {
        id: createId("scan"),
        petId: pet.id,
        petName: pet.name,
        ownerId: pet.ownerId,
        source,
        viewerLocation,
        createdAt: new Date().toISOString(),
      };

      const notification: AccessNotification = {
        id: createId("notification"),
        ownerId: pet.ownerId,
        petId: pet.id,
        message: `${pet.name} recebeu um acesso via ${source.toUpperCase()} (${viewerLocation || "local nao informado"}).`,
        read: false,
        createdAt: event.createdAt,
      };

      setState((prev) => ({
        ...prev,
        scanEvents: [event, ...prev.scanEvents],
        notifications: [notification, ...prev.notifications],
      }));

      if (supabase) {
        void supabase.from("scan_events").insert({
          id: event.id,
          pet_id: pet.id,
          owner_id: pet.ownerId,
          source,
          viewer_location: viewerLocation,
          accessed_at: event.createdAt,
        });
      }

      return pet;
    },
    [state.pets],
  );

  const recordNfcScanByTag = useCallback(
    (tagCode: string, viewerLocation: string) => {
      const pet = resolvePetByTagCode(tagCode);

      if (!pet) {
        return null;
      }

      return recordScan(pet.slug, "nfc", viewerLocation);
    },
    [recordScan, resolvePetByTagCode],
  );

  const markNotificationRead = useCallback((notificationId: string) => {
    if (!currentOwner) {
      return;
    }

    const ownerId = currentOwner.id;

    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((notification) => notification.id !== notificationId),
    }));

    void fetch("/api/notifications/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        ownerId,
        notificationId,
      }),
    });
  }, [currentOwner]);

  const markAllNotificationsRead = useCallback(() => {
    if (!currentOwner) {
      return;
    }

    const ownerId = currentOwner.id;

    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((notification) => notification.ownerId !== ownerId),
    }));

    void fetch("/api/notifications/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        ownerId,
      }),
    });
  }, [currentOwner]);

  return {
    state,
    isReady,
    currentOwner,
    currentOwnerPets,
    currentOwnerTags,
    unreadNotifications,
    ownerScanEvents,
    login,
    register,
    logout,
    refreshCurrentOwner,
    updateCurrentOwnerPlan,
    updateCurrentOwnerAlertSettings,
    addPet,
    updatePet,
    updatePetStatus,
    getPetById,
    getPetBySlug,
    recordScan,
    getTagByCode,
    getTagByPetId,
    activateNfcTag,
    createNfcTag,
    setNfcTagStatus,
    unlinkNfcTag,
    recordNfcScanByTag,
    resolvePetByTagCode,
    markNotificationRead,
    markAllNotificationsRead,
  };
}

export function PetTapProvider({ children }: { children: React.ReactNode }) {
  const value = usePetTapValue();

  return <PetTapContext.Provider value={value}>{children}</PetTapContext.Provider>;
}

export function usePetTap() {
  const context = useContext(PetTapContext);

  if (!context) {
    throw new Error("usePetTap precisa ser usado dentro de PetTapProvider");
  }

  return context;
}
