interface ReverseGeocodeResponse {
  ok?: boolean;
  label?: string;
}

export async function reverseGeocodeLabel(lat: number, lng: number) {
  const query = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });

  try {
    const response = await fetch(`/api/geocode/reverse?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ReverseGeocodeResponse;
    const label = payload.label?.trim();

    return payload.ok && label ? label : null;
  } catch {
    return null;
  }
}

export function formatViewerGpsLocation(lat: number, lng: number) {
  return `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
