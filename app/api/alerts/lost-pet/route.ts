import { NextResponse } from "next/server";

import { createDefaultOwnerAlerts } from "@/lib/owner-defaults";
import { createSupabaseServerClient, hasSupabaseServerClient } from "@/lib/supabase-server";
import { calculateDistanceKm, createId } from "@/lib/utils";
import { isWebPushConfigured, sendWebPushNotification } from "@/lib/web-push";

interface LostPetAlertBody {
  ownerId?: string;
  petId?: string;
}

interface OwnerAlertRow {
  id: string;
  alerts_receive_lost: boolean | null;
  alerts_radius_km: number | null;
  alerts_location_lat: number | null;
  alerts_location_lng: number | null;
  alerts_location_label: string | null;
}

interface PetAlertRow {
  id: string;
  owner_id: string;
  slug: string | null;
  name: string;
  city: string;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string | null;
}

interface PushSubscriptionRow {
  id: string;
  owner_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
}

function isValidCoordinate(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: Request) {
  if (!hasSupabaseServerClient()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para enviar alertas de pet perdido.",
      },
      { status: 500 },
    );
  }

  let body: LostPetAlertBody;
  try {
    body = (await request.json()) as LostPetAlertBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 },
    );
  }

  const ownerId = (body.ownerId ?? "").trim();
  const petId = (body.petId ?? "").trim();

  if (!ownerId || !petId) {
    return NextResponse.json(
      {
        ok: false,
        message: "ownerId e petId sao obrigatorios.",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: petRows, error: petError } = await supabase
    .from("pets")
    .select("id, owner_id, slug, name, city, location_lat, location_lng, location_label")
    .eq("id", petId)
    .limit(1);

  if (petError || !petRows || petRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: petError?.message || "Pet nao encontrado.",
      },
      { status: 404 },
    );
  }

  const pet = petRows[0] as PetAlertRow;
  if (pet.owner_id !== ownerId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Somente o tutor do pet pode disparar este alerta.",
      },
      { status: 403 },
    );
  }

  const { data: ownerRows, error: ownerError } = await supabase
    .from("owners")
    .select(
      "id, alerts_receive_lost, alerts_radius_km, alerts_location_lat, alerts_location_lng, alerts_location_label",
    )
    .eq("id", ownerId)
    .limit(1);

  if (ownerError || !ownerRows || ownerRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: ownerError?.message || "Tutor do pet nao encontrado.",
      },
      { status: 404 },
    );
  }

  const ownerAlerts = createDefaultOwnerAlerts({
    receiveLostAlerts: ownerRows[0].alerts_receive_lost ?? false,
    radiusKm: ownerRows[0].alerts_radius_km ?? undefined,
    locationLat: ownerRows[0].alerts_location_lat,
    locationLng: ownerRows[0].alerts_location_lng,
    locationLabel: ownerRows[0].alerts_location_label ?? "",
  });

  const originLat = pet.location_lat ?? ownerAlerts.locationLat;
  const originLng = pet.location_lng ?? ownerAlerts.locationLng;
  const hasOriginCoordinates = isValidCoordinate(originLat) && isValidCoordinate(originLng);
  const originLabel =
    (pet.location_label ?? "").trim() ||
    ownerAlerts.locationLabel.trim() ||
    pet.city.trim() ||
    "sua regiao";

  const { data: candidateRows, error: candidateError } = await supabase
    .from("owners")
    .select(
      "id, alerts_receive_lost, alerts_radius_km, alerts_location_lat, alerts_location_lng, alerts_location_label",
    )
    .neq("id", ownerId);

  if (candidateError) {
    return NextResponse.json(
      {
        ok: false,
        message: candidateError.message || "Falha ao listar tutores para notificar.",
      },
      { status: 500 },
    );
  }

  let skippedAlertsOff = 0;
  let skippedWithoutLocation = 0;
  let skippedOutOfRadius = 0;

  const notificationsPayload: Array<{
    id: string;
    owner_id: string;
    pet_id: string;
    message: string;
    is_read: boolean;
    created_at: string;
  }> = [];

  for (const candidateRow of (candidateRows ?? []) as OwnerAlertRow[]) {
    const candidateAlerts = createDefaultOwnerAlerts({
      receiveLostAlerts: candidateRow.alerts_receive_lost ?? false,
      radiusKm: candidateRow.alerts_radius_km ?? undefined,
      locationLat: candidateRow.alerts_location_lat,
      locationLng: candidateRow.alerts_location_lng,
      locationLabel: candidateRow.alerts_location_label ?? "",
    });

    if (!candidateAlerts.receiveLostAlerts) {
      skippedAlertsOff += 1;
      continue;
    }

    if (!isValidCoordinate(candidateAlerts.locationLat) || !isValidCoordinate(candidateAlerts.locationLng)) {
      skippedWithoutLocation += 1;
      continue;
    }

    let distanceKm: number | null = null;
    if (hasOriginCoordinates) {
      distanceKm = calculateDistanceKm(
        { lat: originLat, lng: originLng },
        { lat: candidateAlerts.locationLat, lng: candidateAlerts.locationLng },
      );

      if (!Number.isFinite(distanceKm) || distanceKm > candidateAlerts.radiusKm) {
        skippedOutOfRadius += 1;
        continue;
      }
    }

    const nowIso = new Date().toISOString();
    const distanceLabel = distanceKm !== null ? ` (${distanceKm.toFixed(1)} km de voce)` : "";
    notificationsPayload.push({
      id: createId("notification"),
      owner_id: candidateRow.id,
      pet_id: pet.id,
      message: `Alerta PetTapBR: ${pet.name} foi marcado como perdido perto de ${originLabel}${distanceLabel}.`,
      is_read: false,
      created_at: nowIso,
    });
  }

  if (notificationsPayload.length > 0) {
    const { error: insertError } = await supabase.from("notifications").insert(notificationsPayload);
    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          message: insertError.message || "Falha ao registrar alertas de pet perdido.",
        },
        { status: 500 },
      );
    }
  }

  const pushEnabled = isWebPushConfigured();
  const petSlugOrId = (pet.slug ?? "").trim() || pet.id;
  const targetPublicUrl = `/p/${encodeURIComponent(petSlugOrId)}`;
  let pushSent = 0;
  let pushFailed = 0;
  let pushSkippedNoSubscription = 0;

  if (pushEnabled && notificationsPayload.length > 0) {
    const targetOwnerIds = Array.from(
      new Set(notificationsPayload.map((notification) => notification.owner_id)),
    );

    const { data: pushRows, error: pushRowsError } = await supabase
      .from("push_subscriptions")
      .select("id, owner_id, endpoint, p256dh, auth, active")
      .eq("active", true)
      .in("owner_id", targetOwnerIds);

    if (!pushRowsError && pushRows) {
      const rowsByOwnerId = new Map<string, PushSubscriptionRow[]>();
      for (const row of pushRows as PushSubscriptionRow[]) {
        const list = rowsByOwnerId.get(row.owner_id) ?? [];
        list.push(row);
        rowsByOwnerId.set(row.owner_id, list);
      }

      const deactivateSubscriptionIds = new Set<string>();
      const pushSendNow = new Date().toISOString();

      for (const notification of notificationsPayload) {
        const ownerSubscriptions = rowsByOwnerId.get(notification.owner_id) ?? [];
        if (ownerSubscriptions.length === 0) {
          pushSkippedNoSubscription += 1;
          continue;
        }

        for (const subscriptionRow of ownerSubscriptions) {
          const result = await sendWebPushNotification(
            {
              endpoint: subscriptionRow.endpoint,
              expirationTime: null,
              keys: {
                p256dh: subscriptionRow.p256dh,
                auth: subscriptionRow.auth,
              },
            },
            {
              title: "Pet perdido proximo",
              body: notification.message,
              url: targetPublicUrl,
              tag: `lost-pet-${pet.id}`,
            },
          );

          if (result.ok) {
            pushSent += 1;
            continue;
          }

          pushFailed += 1;
          if (result.shouldDeactivate) {
            deactivateSubscriptionIds.add(subscriptionRow.id);
          }
        }
      }

      if (deactivateSubscriptionIds.size > 0) {
        await supabase
          .from("push_subscriptions")
          .update({
            active: false,
            updated_at: pushSendNow,
          })
          .in("id", Array.from(deactivateSubscriptionIds));
      }
    } else {
      pushFailed += notificationsPayload.length;
    }
  }

  return NextResponse.json({
    ok: true,
    notificationsSent: notificationsPayload.length,
    diagnostics: {
      candidates: (candidateRows ?? []).length,
      skippedAlertsOff,
      skippedWithoutLocation,
      skippedOutOfRadius,
      hasOriginCoordinates,
      pushEnabled,
      pushSent,
      pushFailed,
      pushSkippedNoSubscription,
    },
  });
}
