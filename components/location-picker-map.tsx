"use client";

import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";
import type { LeafletMouseEvent } from "leaflet";

const DEFAULT_CENTER: [number, number] = [-23.561684, -46.625378];

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
}

function ClickListener({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function RecenterOnValue({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();

  useEffect(() => {
    if (lat !== null && lng !== null) {
      map.setView([lat, lng], Math.max(map.getZoom(), 13), {
        animate: true,
      });
    }
  }, [lat, lng, map]);

  return null;
}

export function LocationPickerMap({ lat, lng, onPick }: LocationPickerMapProps) {
  const center = lat !== null && lng !== null ? ([lat, lng] as [number, number]) : DEFAULT_CENTER;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        className="h-72 w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickListener onPick={onPick} />
        <RecenterOnValue lat={lat} lng={lng} />
        {lat !== null && lng !== null ? (
          <CircleMarker
            center={[lat, lng]}
            radius={10}
            pathOptions={{
              color: "#22d3ee",
              weight: 2,
              fillColor: "#67e8f9",
              fillOpacity: 0.45,
            }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
