export type PetStatus = "safe" | "lost" | "found";

export type ScanSource = "nfc" | "direct";

export type MediaType = "photo" | "video";

export type NfcTagStatus = "unlinked" | "active" | "disabled";

export type PlanTier = "start" | "pro";

export type PlanStatus = "active" | "inactive";

export type PlanProvider = "manual" | "asaas";

export interface OwnerSubscription {
  tier: PlanTier;
  status: PlanStatus;
  provider: PlanProvider;
  asaasCustomerId: string;
  asaasSubscriptionId: string;
  expiresAt: string | null;
  updatedAt: string;
}

export interface OwnerAlertSettings {
  receiveLostAlerts: boolean;
  radiusKm: number;
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string;
}

export interface Owner {
  id: string;
  fullName: string;
  email: string;
  password: string;
  subscription: OwnerSubscription;
  alerts: OwnerAlertSettings;
  createdAt: string;
}

export interface PetMedicalInfo {
  allergies: string;
  medications: string;
  vaccines: string;
}

export interface PetMedia {
  id: string;
  type: MediaType;
  url: string;
  caption: string;
}

export interface Pet {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  bio: string;
  age: string;
  breed: string;
  weight: string;
  city: string;
  avatarUrl: string;
  whatsapp: string;
  phone: string;
  locationUrl: string;
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string;
  reward: string;
  status: PetStatus;
  isPublicProfile: boolean;
  medical: PetMedicalInfo;
  gallery: PetMedia[];
  createdAt: string;
  updatedAt: string;
}

export interface NfcTag {
  id: string;
  code: string;
  activationCode: string;
  ownerId: string | null;
  petId: string | null;
  status: NfcTagStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ScanEvent {
  id: string;
  petId: string;
  petName: string;
  ownerId: string;
  source: ScanSource;
  viewerLocation: string;
  createdAt: string;
}

export interface AccessNotification {
  id: string;
  ownerId: string;
  petId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface AppState {
  owners: Owner[];
  pets: Pet[];
  nfcTags: NfcTag[];
  scanEvents: ScanEvent[];
  notifications: AccessNotification[];
  sessionOwnerId: string | null;
}

export interface PetFormValues {
  name: string;
  bio: string;
  age: string;
  breed: string;
  weight: string;
  city: string;
  whatsapp: string;
  phone: string;
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string;
  reward: string;
  status: PetStatus;
  isPublicProfile: boolean;
  allergies: string;
  medications: string;
  vaccines: string;
}

export interface PetFormSubmission {
  values: PetFormValues;
  avatarFile: File | null;
  existingAvatarUrl: string;
  photoFiles: File[];
  videoFiles: File[];
  existingGallery: PetMedia[];
}

export interface ActivateNfcTagPayload {
  tagCode: string;
  activationCode: string;
  petId: string;
}
