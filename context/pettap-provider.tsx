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
  Pet,
  PetFormSubmission,
  PetStatus,
  ScanEvent,
  ScanSource,
} from "@/lib/types";
import { initialState } from "@/lib/seed";
import { buildGoogleMapsUrl, createId, normalizeTagCode, slugify } from "@/lib/utils";
import { hasSupabase, supabase } from "@/lib/supabase";
import { uploadPetFile } from "@/lib/supabase-media";

interface AuthResult {
  ok: boolean;
  message?: string;
  requiresEmailConfirmation?: boolean;
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
  addPet: (payload: PetFormSubmission) => Promise<{ ok: boolean; petId?: string; message?: string }>;
  updatePet: (petId: string, payload: PetFormSubmission) => Promise<AuthResult>;
  updatePetStatus: (petId: string, status: PetStatus, reward?: string) => void;
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

function generateNextTagCode(usedCodes: Set<string>) {
  let counter = 1;
  let candidate = `PTBR-NFC-${String(counter).padStart(3, "0")}`;

  while (usedCodes.has(candidate)) {
    counter += 1;
    candidate = `PTBR-NFC-${String(counter).padStart(3, "0")}`;
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

  const { error } = await supabase.from("owners").upsert(
    {
      id: owner.id,
      full_name: owner.fullName,
      email: owner.email,
      password_hash: owner.password,
      created_at: owner.createdAt,
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
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
        const fallbackName = normalized.split("@")[0] || "Tutor";
        const fullNameFromMetadata =
          typeof authUser.user_metadata?.full_name === "string"
            ? authUser.user_metadata.full_name
            : null;

        const owner: Owner = {
          id: authUser.id,
          fullName: localOwner?.fullName ?? fullNameFromMetadata ?? fallbackName,
          email: normalized,
          password: localOwner?.password ?? "__SUPABASE_AUTH__",
          createdAt: localOwner?.createdAt ?? authUser.created_at ?? new Date().toISOString(),
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

      const now = new Date().toISOString();
      const id = createId("pet");
      const slug = ensureUniqueSlug(payload.values.name, state.pets);

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
          payload.photoFiles.map(async (file) => {
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
          payload.videoFiles.map(async (file) => {
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

        const pet: Pet = {
          id,
          ownerId: currentOwner.id,
          slug,
          name: payload.values.name.trim(),
          bio: payload.values.bio.trim(),
          age: payload.values.age.trim(),
          breed: payload.values.breed.trim(),
          weight: payload.values.weight.trim(),
          city: payload.values.city.trim(),
          avatarUrl: avatar.publicUrl,
          whatsapp: payload.values.whatsapp.trim(),
          phone: payload.values.phone.trim(),
          locationUrl: buildGoogleMapsUrl(payload.values.locationLat, payload.values.locationLng),
          locationLat: payload.values.locationLat,
          locationLng: payload.values.locationLng,
          locationLabel: payload.values.locationLabel.trim(),
          reward: payload.values.reward.trim(),
          status: payload.values.status,
          medical: {
            allergies: payload.values.allergies.trim(),
            medications: payload.values.medications.trim(),
            vaccines: payload.values.vaccines.trim(),
          },
          gallery: [...uploadedPhotos, ...uploadedVideos],
          createdAt: now,
          updatedAt: now,
        };

        await syncPetWithSupabase(pet);

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

      const nextSlug = ensureUniqueSlug(payload.values.name, state.pets, petId);

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
          payload.photoFiles.map(async (file) => {
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
          payload.videoFiles.map(async (file) => {
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
          name: payload.values.name.trim(),
          bio: payload.values.bio.trim(),
          age: payload.values.age.trim(),
          breed: payload.values.breed.trim(),
          weight: payload.values.weight.trim(),
          city: payload.values.city.trim(),
          avatarUrl,
          whatsapp: payload.values.whatsapp.trim(),
          phone: payload.values.phone.trim(),
          locationUrl: buildGoogleMapsUrl(payload.values.locationLat, payload.values.locationLng),
          locationLat: payload.values.locationLat,
          locationLng: payload.values.locationLng,
          locationLabel: payload.values.locationLabel.trim(),
          reward: payload.values.reward.trim(),
          status: payload.values.status,
          medical: {
            allergies: payload.values.allergies.trim(),
            medications: payload.values.medications.trim(),
            vaccines: payload.values.vaccines.trim(),
          },
          gallery: [...payload.existingGallery, ...uploadedPhotos, ...uploadedVideos],
          updatedAt: new Date().toISOString(),
        };

        await syncPetWithSupabase(updatedPet);

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

  const updatePetStatus = useCallback((petId: string, status: PetStatus, reward = "") => {
    setState((prev) => ({
      ...prev,
      pets: prev.pets.map((pet) => {
        if (pet.id !== petId) {
          return pet;
        }

        const updatedPet: Pet = {
          ...pet,
          status,
          reward: status === "lost" ? reward || pet.reward : "",
          updatedAt: new Date().toISOString(),
        };

        if (supabase) {
          void supabase
            .from("pets")
            .update({
              status: updatedPet.status,
              reward: updatedPet.reward,
              updated_at: updatedPet.updatedAt,
            })
            .eq("id", petId);
        }

        return updatedPet;
      }),
    }));
  }, []);

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
      const activationCode = normalizeActivationCode(payload.activationCode);

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

      if (normalizeActivationCode(tag.activationCode) !== activationCode) {
        return {
          ok: false,
          message: "Codigo de ativacao invalido.",
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
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              read: true,
            }
          : notification,
      ),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (!currentOwner) {
      return;
    }

    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) =>
        notification.ownerId === currentOwner.id
          ? {
              ...notification,
              read: true,
            }
          : notification,
      ),
    }));
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
    throw new Error("usePetTap must be used inside PetTapProvider");
  }

  return context;
}
