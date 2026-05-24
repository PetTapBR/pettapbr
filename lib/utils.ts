import { STATUS_META } from "./constants";
import type { PetStatus } from "./types";

export function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  return `${prefix}-${random}`;
}

export function normalizeTagCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export function getStatusMeta(status: PetStatus) {
  return STATUS_META[status];
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatCoordinates(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return "";
  }

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function buildGoogleMapsUrl(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return "";
  }

  return `https://maps.google.com/?q=${lat},${lng}`;
}

export function parseLatLngFromLocationUrl(url: string) {
  if (!url.trim()) {
    return { lat: null, lng: null };
  }

  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get("q");

    if (!q) {
      return { lat: null, lng: null };
    }

    const [latRaw, lngRaw] = q.split(",");
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return { lat: null, lng: null };
    }

    return { lat, lng };
  } catch {
    return { lat: null, lng: null };
  }
}

export function getYouTubeEmbed(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }
    }

    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}
