"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { reverseGeocodeLabel } from "@/lib/geocode-client";
import type { PetFormSubmission, PetFormValues, PetMedia } from "@/lib/types";
import { formatCoordinates } from "@/lib/utils";

const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map").then((module) => module.LocationPickerMap),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-400">
        Carregando mapa...
      </div>
    ),
  },
);

export const emptyPetFormValues: PetFormValues = {
  name: "",
  bio: "",
  age: "",
  breed: "",
  weight: "",
  city: "",
  whatsapp: "",
  phone: "",
  locationLat: null,
  locationLng: null,
  locationLabel: "",
  reward: "",
  status: "safe",
  allergies: "",
  medications: "",
  vaccines: "",
};

interface PetFormProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  isPremiumPlan?: boolean;
  initialValues?: PetFormValues;
  initialAvatarUrl?: string;
  initialGallery?: PetMedia[];
  onSubmit: (payload: PetFormSubmission) => Promise<{ ok: boolean; message?: string }>;
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text";
}) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
      />
    </label>
  );
}

export function PetForm({
  title,
  subtitle,
  submitLabel,
  isPremiumPlan = true,
  initialValues,
  initialAvatarUrl = "",
  initialGallery = [],
  onSubmit,
}: PetFormProps) {
  const [values, setValues] = useState<PetFormValues>(initialValues ?? emptyPetFormValues);
  const [existingAvatarUrl] = useState(initialAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [existingGallery, setExistingGallery] = useState<PetMedia[]>(initialGallery);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState("");
  const geocodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPremium = isPremiumPlan;
  const isLostMode = useMemo(() => values.status === "lost", [values.status]);

  const avatarPreview = useMemo(() => {
    if (avatarFile) {
      return URL.createObjectURL(avatarFile);
    }

    return existingAvatarUrl;
  }, [avatarFile, existingAvatarUrl]);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }

      if (geocodeDebounceRef.current) {
        clearTimeout(geocodeDebounceRef.current);
      }
    };
  }, [avatarPreview]);

  function updateField<K extends keyof PetFormValues>(key: K, value: PetFormValues[K]) {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function applyResolvedLocationLabel(lat: number, lng: number) {
    setIsResolvingAddress(true);
    const label = await reverseGeocodeLabel(lat, lng);
    setIsResolvingAddress(false);

    if (!label) {
      setLocationFeedback("Coordenadas definidas. Nao foi possivel resolver o endereco automaticamente.");
      return;
    }

    setValues((prev) => {
      if (prev.locationLat !== lat || prev.locationLng !== lng) {
        return prev;
      }

      return {
        ...prev,
        locationLabel: label,
      };
    });

    setLocationFeedback("Endereco localizado automaticamente. Ajuste o texto se desejar.");
  }

  function scheduleResolveLocationLabel(lat: number, lng: number) {
    if (geocodeDebounceRef.current) {
      clearTimeout(geocodeDebounceRef.current);
    }

    geocodeDebounceRef.current = setTimeout(() => {
      void applyResolvedLocationLabel(lat, lng);
    }, 650);
  }

  async function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocationFeedback("Geolocalizacao nao suportada neste navegador.");
      return;
    }

    if (typeof window !== "undefined") {
      const hostname = window.location.hostname.toLowerCase();
      const isLocalhost =
        hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");

      if (!window.isSecureContext && !isLocalhost) {
        setLocationFeedback(
          "Geolocalizacao bloqueada em HTTP neste navegador. Use HTTPS para funcionar no celular.",
        );
        return;
      }
    }

    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        if (permission.state === "denied") {
          setLocationFeedback(
            "Permissao de localizacao bloqueada no navegador. Libere nas configuracoes do site e tente novamente.",
          );
          return;
        }
      }
    } catch {
      // Ignora falhas de suporte do Permissions API e tenta seguir com geolocation.
    }

    setIsRequestingLocation(true);
    setLocationFeedback("Solicitando permissao de localizacao...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setIsRequestingLocation(false);

        setValues((prev) => ({
          ...prev,
          locationLat: lat,
          locationLng: lng,
        }));

        setLocationFeedback("Localizacao capturada. Buscando endereco real...");
        void applyResolvedLocationLabel(lat, lng);
      },
      (error) => {
        setIsRequestingLocation(false);

        if (error.code === 1) {
          setLocationFeedback("Permissao de localizacao negada.");
          return;
        }

        if (error.code === 2) {
          setLocationFeedback("Localizacao indisponivel no dispositivo.");
          return;
        }

        if (error.code === 3) {
          setLocationFeedback("Tempo excedido para obter localizacao.");
          return;
        }

        setLocationFeedback("Nao foi possivel capturar sua localizacao atual.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 12000,
      },
    );
  }

  function removeExistingMedia(mediaId: string) {
    setExistingGallery((prev) => prev.filter((item) => item.id !== mediaId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const mainContact = (values.whatsapp || values.phone).trim();

    if (!values.name.trim() || !mainContact) {
      setFeedback("Preencha nome do pet e um contato principal.");
      return;
    }

    if (isPremium && !values.city.trim()) {
      setFeedback("Preencha a cidade do pet.");
      return;
    }

    if (!avatarFile && !existingAvatarUrl) {
      setFeedback("Envie uma foto principal do pet.");
      return;
    }

    if (isPremium && (values.locationLat === null || values.locationLng === null)) {
      setFeedback("Selecione a localizacao no mapa ou use sua localizacao atual.");
      return;
    }

    setIsSubmitting(true);
    setFeedback("Enviando arquivos e salvando perfil...");

    const result = await onSubmit({
      values,
      avatarFile,
      existingAvatarUrl,
      photoFiles,
      videoFiles,
      existingGallery,
    });

    setIsSubmitting(false);

    if (result.ok) {
      setFeedback("Salvo com sucesso.");
      setPhotoFiles([]);
      setVideoFiles([]);
      if (avatarFile) {
        setAvatarFile(null);
      }
      return;
    }

    setFeedback(result.message ?? "Nao foi possivel salvar.");
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">{subtitle}</p>
      </header>

      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            label="Nome"
            value={values.name}
            onChange={(value) => updateField("name", value)}
            placeholder="Ex: Luna"
          />

          {isPremium ? (
            <InputField
              label="Idade"
              value={values.age}
              onChange={(value) => updateField("age", value)}
              placeholder="Ex: 3 anos"
            />
          ) : null}

          {isPremium ? (
            <InputField
              label="Raca"
              value={values.breed}
              onChange={(value) => updateField("breed", value)}
              placeholder="Ex: Golden Retriever"
            />
          ) : null}

          {isPremium ? (
            <InputField
              label="Peso"
              value={values.weight}
              onChange={(value) => updateField("weight", value)}
              placeholder="Ex: 28 kg"
            />
          ) : null}

          {isPremium ? (
            <InputField
              label="Cidade"
              value={values.city}
              onChange={(value) => updateField("city", value)}
              placeholder="Ex: Sao Paulo - SP"
            />
          ) : null}

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Foto principal</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) {
                  setAvatarFile(file);
                }
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.12em] file:text-zinc-950"
            />
          </label>
        </div>

        {avatarPreview ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <img src={avatarPreview} alt="Preview da foto principal" className="h-64 w-full object-cover" />
          </div>
        ) : null}

        {isPremium ? (
          <TextareaField
            label="Bio"
            value={values.bio}
            onChange={(value) => updateField("bio", value)}
            placeholder="Descreva personalidade, rotina e pontos importantes"
          />
        ) : (
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            Plano Start ativo: este perfil permite nome, foto e contato principal. Para liberar bio,
            localizacao, galerias, dados medicos e modo perdido, faca upgrade para o plano Pro.
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            label={isPremium ? "WhatsApp" : "Contato principal"}
            value={values.whatsapp}
            onChange={(value) => updateField("whatsapp", value)}
            placeholder="+55 11 99999-9999"
          />
          {isPremium ? (
            <InputField
              label="Telefone para ligacao"
              value={values.phone}
              onChange={(value) => updateField("phone", value)}
              placeholder="+55 11 3333-3333"
            />
          ) : null}

          {isPremium ? (
            <label className="grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Status</span>
              <select
                value={values.status}
                onChange={(event) => updateField("status", event.target.value as PetFormValues["status"])}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
              >
                <option value="safe" className="bg-zinc-900 text-white">
                  Seguro
                </option>
                <option value="lost" className="bg-zinc-900 text-white">
                  Perdido
                </option>
                <option value="found" className="bg-zinc-900 text-white">
                  Encontrado
                </option>
              </select>
            </label>
          ) : null}

          {isPremium ? (
            <InputField
              label="Referencia do local"
              value={values.locationLabel}
              onChange={(value) => updateField("locationLabel", value)}
              placeholder="Ex: Parque Ibirapuera, Portao 7"
            />
          ) : null}
        </div>

        {isPremium ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-300">
                Selecione a localizacao no mapa
              </p>
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="rounded-full border border-cyan-300/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Usar minha localizacao atual
              </button>
            </div>

            <LocationPickerMap
              lat={values.locationLat}
              lng={values.locationLng}
              onPick={(lat, lng) => {
                updateField("locationLat", lat);
                updateField("locationLng", lng);
                setLocationFeedback("Ponto selecionado no mapa. Buscando endereco real...");
                scheduleResolveLocationLabel(lat, lng);
              }}
            />

            <p className="mt-3 text-xs text-zinc-400">
              Coordenadas selecionadas: {formatCoordinates(values.locationLat, values.locationLng) || "Nenhuma"}
            </p>
            {isRequestingLocation ? (
              <p className="mt-1 text-xs text-cyan-200">Solicitando permissao de localizacao...</p>
            ) : null}
            {isResolvingAddress ? <p className="mt-1 text-xs text-cyan-200">Resolvendo endereco...</p> : null}
            {locationFeedback ? <p className="mt-1 text-xs text-zinc-300">{locationFeedback}</p> : null}
          </div>
        ) : null}

        {isPremium ? (
          <>
            {isLostMode ? (
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Modo Perdido Ativo</p>
                <p className="mt-2 text-sm text-rose-200">
                  Defina uma recompensa opcional para destacar no perfil publico.
                </p>
                <div className="mt-3">
                  <InputField
                    label="Recompensa"
                    value={values.reward}
                    onChange={(value) => updateField("reward", value)}
                    placeholder="Ex: R$ 500"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <InputField
                  label="Recompensa"
                  value={values.reward}
                  onChange={(value) => updateField("reward", value)}
                  placeholder="Opcional"
                />
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-3">
              <TextareaField
                label="Alergias"
                value={values.allergies}
                onChange={(value) => updateField("allergies", value)}
                placeholder="Alergia a frango"
              />
              <TextareaField
                label="Medicamentos"
                value={values.medications}
                onChange={(value) => updateField("medications", value)}
                placeholder="Suplemento articular"
              />
              <TextareaField
                label="Vacinas"
                value={values.vaccines}
                onChange={(value) => updateField("vaccines", value)}
                placeholder="V10, antirrabica"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-zinc-300">
                <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Fotos da galeria</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setPhotoFiles(Array.from(event.target.files ?? []))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.12em] file:text-zinc-950"
                />
                {photoFiles.length > 0 ? (
                  <p className="text-xs text-zinc-400">{photoFiles.length} foto(s) selecionada(s)</p>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm text-zinc-300">
                <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Videos da galeria</span>
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  onChange={(event) => setVideoFiles(Array.from(event.target.files ?? []))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.12em] file:text-zinc-950"
                />
                {videoFiles.length > 0 ? (
                  <p className="text-xs text-zinc-400">{videoFiles.length} video(s) selecionado(s)</p>
                ) : null}
              </label>
            </div>

            {existingGallery.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {existingGallery.map((media) => (
                  <article key={media.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    {media.type === "photo" ? (
                      <img src={media.url} alt={media.caption || "Foto"} className="h-44 w-full object-cover" />
                    ) : (
                      <video src={media.url} className="h-44 w-full object-cover" controls />
                    )}
                    <div className="flex items-center justify-between px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">{media.type}</p>
                      <button
                        type="button"
                        onClick={() => removeExistingMedia(media.id)}
                        className="rounded-full border border-rose-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200"
                      >
                        Remover
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">{feedback}</p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Salvando..." : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
