"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { reverseGeocodeLabel } from "@/lib/geocode-client";
import {
  BRAZIL_CITY_FALLBACK_BY_STATE,
  BRAZIL_STATE_OPTIONS,
  COUNTRY_DIAL_OPTIONS,
  PET_BREED_OPTIONS,
} from "@/lib/pet-form-options";
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
  isPublicProfile: false,
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
  hasError = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text";
  hasError?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={[
          "rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:bg-white/10",
          hasError ? "border-rose-400/80 focus:border-rose-300" : "border-white/10 focus:border-cyan-300/60",
        ].join(" ")}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  hasError = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hasError?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={[
          "min-h-24 rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:bg-white/10",
          hasError ? "border-rose-400/80 focus:border-rose-300" : "border-white/10 focus:border-cyan-300/60",
        ].join(" ")}
      />
    </label>
  );
}

const OTHER_CITY_OPTION = "__other_city__";
const OTHER_BREED_OPTION = "__other_breed__";

type PetFormErrorKey = "name" | "contact" | "state" | "city" | "avatar" | "location";

type PetFormErrors = Partial<Record<PetFormErrorKey, string>>;

interface ParsedCityValue {
  stateCode: string;
  selectedCity: string;
  customCity: string;
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function sanitizePhoneInput(value: string) {
  return digitsOnly(value).slice(0, 15);
}

function parsePhoneParts(value: string) {
  const fallbackCountryCode = "BR";
  const digits = digitsOnly(value);
  if (!digits) {
    return {
      countryCode: fallbackCountryCode,
      localNumber: "",
    };
  }

  const optionsByLongestDialCode = [...COUNTRY_DIAL_OPTIONS].sort(
    (first, second) => second.dialCode.length - first.dialCode.length,
  );

  for (const option of optionsByLongestDialCode) {
    if (!digits.startsWith(option.dialCode)) {
      continue;
    }

    const localNumber = digits.slice(option.dialCode.length);
    if (!localNumber) {
      continue;
    }

    return {
      countryCode: option.code,
      localNumber,
    };
  }

  return {
    countryCode: fallbackCountryCode,
    localNumber: digits,
  };
}

function formatPhoneWithCountry(countryCode: string, localNumber: string) {
  const option =
    COUNTRY_DIAL_OPTIONS.find((country) => country.code === countryCode) ??
    COUNTRY_DIAL_OPTIONS[0];
  const normalizedLocalNumber = sanitizePhoneInput(localNumber);

  if (!normalizedLocalNumber) {
    return "";
  }

  return `+${option.dialCode} ${normalizedLocalNumber}`;
}

function parseCityValue(rawCity: string): ParsedCityValue {
  const value = rawCity.trim();
  if (!value) {
    return {
      stateCode: "",
      selectedCity: "",
      customCity: "",
    };
  }

  const ufMatch = value.match(/(?:-|\/|,)\s*([A-Za-z]{2})$/);
  const stateCode = ufMatch?.[1]?.toUpperCase() ?? "";

  if (!stateCode) {
    return {
      stateCode: "",
      selectedCity: OTHER_CITY_OPTION,
      customCity: value,
    };
  }

  const baseCityName = value
    .slice(0, ufMatch?.index ?? value.length)
    .trim()
    .replace(/[,\-\/]+$/, "")
    .trim();
  return {
    stateCode,
    selectedCity: baseCityName || "",
    customCity: "",
  };
}

function formatCityValue(stateCode: string, cityName: string) {
  const normalizedStateCode = stateCode.trim().toUpperCase();
  const normalizedCity = cityName.trim();

  if (!normalizedCity) {
    return "";
  }

  if (!normalizedStateCode) {
    return normalizedCity;
  }

  return `${normalizedCity} - ${normalizedStateCode}`;
}

function isBreedInCatalog(value: string) {
  return PET_BREED_OPTIONS.includes(value);
}

function getFlagIconUrl(countryCode: string) {
  return `https://flagcdn.com/20x15/${countryCode.toLowerCase()}.png`;
}

function errorBorderClass(hasError: boolean) {
  return hasError ? "border-rose-400/80 focus:border-rose-300" : "border-white/10 focus:border-cyan-300/60";
}

function passiveErrorBorderClass(hasError: boolean) {
  return hasError ? "border-rose-400/80" : "border-white/10";
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
  const initialFormValues = initialValues ?? emptyPetFormValues;
  const initialWhatsappPhoneParts = parsePhoneParts(initialFormValues.whatsapp);
  const initialCityValue = parseCityValue(initialFormValues.city);
  const initialBreedValue = initialFormValues.breed.trim();

  const [values, setValues] = useState<PetFormValues>(initialFormValues);
  const [whatsappCountryCode, setWhatsappCountryCode] = useState(initialWhatsappPhoneParts.countryCode);
  const [whatsappLocalNumber, setWhatsappLocalNumber] = useState(initialWhatsappPhoneParts.localNumber);
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [selectedStateCode, setSelectedStateCode] = useState(initialCityValue.stateCode);
  const [selectedCity, setSelectedCity] = useState(initialCityValue.selectedCity);
  const [customCity, setCustomCity] = useState(initialCityValue.customCity);
  const [cityOptions, setCityOptions] = useState<string[]>(
    selectedStateCode ? (BRAZIL_CITY_FALLBACK_BY_STATE[selectedStateCode] ?? []) : [],
  );
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [cityFetchFeedback, setCityFetchFeedback] = useState("");
  const [selectedBreed, setSelectedBreed] = useState(
    initialBreedValue && isBreedInCatalog(initialBreedValue) ? initialBreedValue : OTHER_BREED_OPTION,
  );
  const [customBreed, setCustomBreed] = useState(
    initialBreedValue && isBreedInCatalog(initialBreedValue) ? "" : initialBreedValue,
  );
  const [existingAvatarUrl] = useState(initialAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [existingGallery, setExistingGallery] = useState<PetMedia[]>(initialGallery);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<PetFormErrors>({});
  const [showPublicProfileReminder, setShowPublicProfileReminder] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState("");
  const geocodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const publicProfileReminderRef = useRef<HTMLDivElement | null>(null);
  const selectedCityRef = useRef(selectedCity);
  const countryMenuRef = useRef<HTMLDivElement | null>(null);

  const isPremium = isPremiumPlan;
  const isLostMode = useMemo(() => values.status === "lost", [values.status]);
  const hasSensitivePublicData = useMemo(
    () =>
      Boolean(values.phone.trim()) ||
      Boolean(values.locationLabel.trim()) ||
      values.locationLat !== null ||
      values.locationLng !== null,
    [values.locationLabel, values.locationLat, values.locationLng, values.phone],
  );
  const selectedCountryOption = useMemo(
    () => COUNTRY_DIAL_OPTIONS.find((country) => country.code === whatsappCountryCode) ?? COUNTRY_DIAL_OPTIONS[0],
    [whatsappCountryCode],
  );

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

  useEffect(() => {
    selectedCityRef.current = selectedCity;
  }, [selectedCity]);

  useEffect(() => {
    if (!showPublicProfileReminder) {
      return;
    }

    publicProfileReminderRef.current?.focus();
  }, [showPublicProfileReminder]);

  useEffect(() => {
    if (!isCountryMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!countryMenuRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (countryMenuRef.current.contains(target)) {
        return;
      }

      setIsCountryMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isCountryMenuOpen]);

  useEffect(() => {
    if (!selectedStateCode) {
      return;
    }

    let isMounted = true;
    const currentSelectedCity = selectedCityRef.current;

    void (async () => {
      setIsLoadingCities(true);
      setCityFetchFeedback("");

      try {
        const response = await fetch(`/api/localidades/cidades?uf=${encodeURIComponent(selectedStateCode)}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          cities?: string[];
          message?: string;
        };

        if (!isMounted) {
          return;
        }

        if (!response.ok || !payload.ok || !payload.cities) {
          const fallbackCities = BRAZIL_CITY_FALLBACK_BY_STATE[selectedStateCode] ?? [];
          setCityOptions(fallbackCities);
          setCityFetchFeedback(
            payload.message
              ? `${payload.message} Exibindo lista reduzida temporaria.`
              : "Nao foi possivel carregar todas as cidades agora. Exibindo lista reduzida temporaria.",
          );
          return;
        }

        setCityOptions(payload.cities);

        if (
          currentSelectedCity &&
          currentSelectedCity !== OTHER_CITY_OPTION &&
          !payload.cities.includes(currentSelectedCity)
        ) {
          setSelectedCity(OTHER_CITY_OPTION);
          setCustomCity(currentSelectedCity);
          setValues((prev) => ({
            ...prev,
            city: formatCityValue(selectedStateCode, currentSelectedCity),
          }));
        }
      } catch {
        if (!isMounted) {
          return;
        }

        const fallbackCities = BRAZIL_CITY_FALLBACK_BY_STATE[selectedStateCode] ?? [];
        setCityOptions(fallbackCities);
        setCityFetchFeedback("Sem conexao para carregar todas as cidades. Exibindo lista reduzida temporaria.");
      } finally {
        if (isMounted) {
          setIsLoadingCities(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [selectedStateCode]);

  function updateField<K extends keyof PetFormValues>(key: K, value: PetFormValues[K]) {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (key === "name" && String(value).trim()) {
      clearValidationError("name");
    }

    if (key === "phone" && String(value).trim()) {
      clearValidationError("contact");
    }

    if ((key === "locationLat" || key === "locationLng") && value !== null) {
      clearValidationError("location");
    }
  }

  function clearValidationError(key: PetFormErrorKey) {
    setValidationErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }

      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function applyWhatsappValue(countryCode: string, localNumber: string) {
    const formatted = formatPhoneWithCountry(countryCode, localNumber);
    updateField("whatsapp", formatted);
  }

  function handleWhatsappCountryChange(nextCountryCode: string) {
    setWhatsappCountryCode(nextCountryCode);
    applyWhatsappValue(nextCountryCode, whatsappLocalNumber);
    setIsCountryMenuOpen(false);
  }

  function handleWhatsappNumberChange(nextNumber: string) {
    const normalizedNumber = sanitizePhoneInput(nextNumber);
    setWhatsappLocalNumber(normalizedNumber);
    applyWhatsappValue(whatsappCountryCode, normalizedNumber);
    if (normalizedNumber) {
      clearValidationError("contact");
    }
  }

  function handleStateChange(nextStateCode: string) {
    setSelectedStateCode(nextStateCode);
    setSelectedCity("");
    setCustomCity("");
    updateField("city", "");
    if (nextStateCode) {
      clearValidationError("state");
    }
  }

  function handleCityChange(nextCity: string) {
    setSelectedCity(nextCity);

    if (nextCity === OTHER_CITY_OPTION) {
      updateField("city", formatCityValue(selectedStateCode, customCity));
      return;
    }

    setCustomCity("");
    updateField("city", formatCityValue(selectedStateCode, nextCity));
    if (nextCity) {
      clearValidationError("city");
    }
  }

  function handleCustomCityChange(nextCity: string) {
    setCustomCity(nextCity);
    updateField("city", formatCityValue(selectedStateCode, nextCity));
    if (nextCity.trim()) {
      clearValidationError("city");
    }
  }

  function handleBreedChange(nextBreed: string) {
    setSelectedBreed(nextBreed);

    if (nextBreed === OTHER_BREED_OPTION) {
      updateField("breed", customBreed);
      return;
    }

    setCustomBreed("");
    updateField("breed", nextBreed);
  }

  function handleCustomBreedChange(nextBreed: string) {
    setCustomBreed(nextBreed);
    updateField("breed", nextBreed);
  }

  function getSingleFileLabel(file: File | null, fallbackLabel = "Nenhum arquivo selecionado") {
    if (!file) {
      return fallbackLabel;
    }

    return file.name;
  }

  function getMultiFileLabel(files: File[]) {
    if (files.length === 0) {
      return "Nenhum arquivo selecionado";
    }

    if (files.length === 1) {
      return files[0].name;
    }

    return `${files.length} arquivos selecionados`;
  }

  function openFileDialog(inputRef: React.RefObject<HTMLInputElement | null>) {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.click();
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

  function validateRequiredFields() {
    const mainContact = (values.whatsapp || values.phone).trim();
    const nextErrors: PetFormErrors = {};

    if (!values.name.trim()) {
      nextErrors.name = "Informe o nome do pet.";
    }

    if (!mainContact) {
      nextErrors.contact = "Informe um WhatsApp ou contato principal.";
    }

    if (isPremium && !selectedStateCode) {
      nextErrors.state = "Selecione o estado do pet.";
    }

    if (isPremium && !values.city.trim()) {
      nextErrors.city = "Selecione ou digite a cidade do pet.";
    }

    if (!avatarFile && !existingAvatarUrl) {
      nextErrors.avatar = "Envie uma foto principal do pet.";
    }

    if (isPremium && (values.locationLat === null || values.locationLng === null)) {
      nextErrors.location = "Selecione a localizacao no mapa ou use sua localizacao atual.";
    }

    setValidationErrors(nextErrors);

    const missingItems = Object.values(nextErrors);
    if (missingItems.length > 0) {
      setFeedback(`Revise os campos obrigatorios: ${missingItems.join(" ")}`);
      return false;
    }

    return true;
  }

  async function submitPetForm(nextValues: PetFormValues = values) {
    setShowPublicProfileReminder(false);

    setIsSubmitting(true);
    setFeedback("Enviando arquivos e salvando perfil...");

    const result = await onSubmit({
      values: nextValues,
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
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      return;
    }

    setFeedback(result.message ?? "Nao foi possivel salvar.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateRequiredFields()) {
      return;
    }

    if (!values.isPublicProfile) {
      setShowPublicProfileReminder(true);
      return;
    }

    await submitPetForm();
  }

  async function makePublicAndSubmit() {
    const nextValues = {
      ...values,
      isPublicProfile: true,
    };

    setValues(nextValues);
    await submitPetForm(nextValues);
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
            hasError={Boolean(validationErrors.name)}
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
            <label className="grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Raca</span>
              <select
                value={selectedBreed}
                onChange={(event) => handleBreedChange(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
              >
                <option value="" className="bg-zinc-900 text-white">
                  Selecione a raca
                </option>
                {PET_BREED_OPTIONS.map((breedOption) => (
                  <option key={breedOption} value={breedOption} className="bg-zinc-900 text-white">
                    {breedOption}
                  </option>
                ))}
                <option value={OTHER_BREED_OPTION} className="bg-zinc-900 text-white">
                  Outra (digitar)
                </option>
              </select>
              {selectedBreed === OTHER_BREED_OPTION ? (
                <input
                  type="text"
                  value={customBreed}
                  onChange={(event) => handleCustomBreedChange(event.target.value)}
                  placeholder="Digite a raca"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
                />
              ) : null}
            </label>
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
            <label className="grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Estado</span>
              <select
                value={selectedStateCode}
                onChange={(event) => handleStateChange(event.target.value)}
                className={[
                  "rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:bg-white/10",
                  errorBorderClass(Boolean(validationErrors.state)),
                ].join(" ")}
              >
                <option value="" className="bg-zinc-900 text-white">
                  Selecione o estado
                </option>
                {BRAZIL_STATE_OPTIONS.map((stateOption) => (
                  <option key={stateOption.code} value={stateOption.code} className="bg-zinc-900 text-white">
                    {stateOption.name} ({stateOption.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isPremium ? (
            <label className="grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Cidade</span>
              <select
                value={selectedCity}
                disabled={!selectedStateCode || isLoadingCities}
                onChange={(event) => handleCityChange(event.target.value)}
                className={[
                  "rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:bg-white/10",
                  errorBorderClass(Boolean(validationErrors.city)),
                ].join(" ")}
              >
                <option value="" className="bg-zinc-900 text-white">
                  {!selectedStateCode
                    ? "Selecione o estado primeiro"
                    : isLoadingCities
                      ? "Carregando cidades..."
                      : "Selecione a cidade"}
                </option>
                {cityOptions.map((cityOption) => (
                  <option key={cityOption} value={cityOption} className="bg-zinc-900 text-white">
                    {cityOption}
                  </option>
                ))}
                {selectedStateCode ? (
                  <option value={OTHER_CITY_OPTION} className="bg-zinc-900 text-white">
                    Outra cidade (digitar)
                  </option>
                ) : null}
              </select>
              {selectedCity === OTHER_CITY_OPTION ? (
                <input
                  type="text"
                  value={customCity}
                  onChange={(event) => handleCustomCityChange(event.target.value)}
                  placeholder="Digite a cidade"
                  className={[
                    "rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:bg-white/10",
                    errorBorderClass(Boolean(validationErrors.city)),
                  ].join(" ")}
                />
              ) : null}
              {cityFetchFeedback ? <p className="text-xs text-amber-200">{cityFetchFeedback}</p> : null}
            </label>
          ) : null}

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Foto principal</span>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setAvatarFile(file);
                if (file) {
                  clearValidationError("avatar");
                }
              }}
            />
            <div
              className={[
                "flex min-w-0 items-center gap-2 rounded-2xl border bg-white/5 px-3 py-2",
                passiveErrorBorderClass(Boolean(validationErrors.avatar)),
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => openFileDialog(avatarInputRef)}
                className="shrink-0 rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-cyan-200"
              >
                Escolher
              </button>
              <p className="min-w-0 truncate text-sm text-zinc-300">
                {getSingleFileLabel(
                  avatarFile,
                  existingAvatarUrl ? "Foto atual mantida" : "Nenhum arquivo selecionado",
                )}
              </p>
            </div>
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
          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              {isPremium ? "WhatsApp" : "Contato principal"}
            </span>
            <div className="grid gap-2 sm:grid-cols-[minmax(160px,210px)_1fr]">
              <div className="relative z-[1200]" ref={countryMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsCountryMenuOpen((prev) => !prev)}
                  className={[
                    "flex w-full items-center justify-between gap-2 rounded-2xl border bg-white/5 px-3 py-3 text-sm text-white outline-none transition hover:bg-white/10",
                    errorBorderClass(Boolean(validationErrors.contact)),
                  ].join(" ")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <img
                      src={getFlagIconUrl(selectedCountryOption.code)}
                      alt={`Bandeira ${selectedCountryOption.name}`}
                      width={20}
                      height={15}
                      loading="lazy"
                      className="h-[15px] w-5 rounded-sm border border-white/20 object-cover"
                    />
                    <span className="truncate">{selectedCountryOption.name}</span>
                  </span>
                  <span className="text-xs text-zinc-300">
                    +{selectedCountryOption.dialCode} {isCountryMenuOpen ? "▲" : "▼"}
                  </span>
                </button>

                {isCountryMenuOpen ? (
                  <div className="absolute z-[1300] mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-white/15 bg-zinc-900/95 p-1 shadow-xl shadow-black/50">
                    {COUNTRY_DIAL_OPTIONS.map((countryOption) => (
                      <button
                        key={`${countryOption.code}-${countryOption.dialCode}`}
                        type="button"
                        onClick={() => handleWhatsappCountryChange(countryOption.code)}
                        className={[
                          "flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm transition",
                          whatsappCountryCode === countryOption.code
                            ? "bg-cyan-400/20 text-cyan-100"
                            : "text-zinc-200 hover:bg-white/10",
                        ].join(" ")}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <img
                            src={getFlagIconUrl(countryOption.code)}
                            alt={`Bandeira ${countryOption.name}`}
                            width={20}
                            height={15}
                            loading="lazy"
                            className="h-[15px] w-5 rounded-sm border border-white/20 object-cover"
                          />
                          <span className="truncate">{countryOption.name}</span>
                        </span>
                        <span className="text-xs text-zinc-300">+{countryOption.dialCode}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={whatsappLocalNumber}
                onChange={(event) => handleWhatsappNumberChange(event.target.value)}
                placeholder="DDD + numero"
                className={[
                  "rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:bg-white/10",
                  errorBorderClass(Boolean(validationErrors.contact)),
                ].join(" ")}
              />
            </div>
          </label>
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
                  Em casa
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

        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Perfil publico</span>
          <select
            value={values.isPublicProfile ? "public" : "private"}
            onChange={(event) => updateField("isPublicProfile", event.target.value === "public")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
          >
            <option value="private" className="bg-zinc-900 text-white">
              Privado
            </option>
            <option value="public" className="bg-zinc-900 text-white">
              Publico
            </option>
          </select>
          <p className="text-xs text-zinc-400">
            Recomendacao LGPD: mantenha privado enquanto houver telefone ou endereco sensivel.
          </p>
          {values.isPublicProfile && hasSensitivePublicData ? (
            <p className="text-xs text-amber-200">
              Aviso: este perfil esta publico com dados sensiveis preenchidos.
            </p>
          ) : null}
        </label>

        {isPremium ? (
          <div
            className={[
              "rounded-2xl border bg-white/5 p-4",
              passiveErrorBorderClass(Boolean(validationErrors.location)),
            ].join(" ")}
          >
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
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => setPhotoFiles(Array.from(event.target.files ?? []))}
                />
                <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => openFileDialog(photoInputRef)}
                    className="shrink-0 rounded-full bg-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-zinc-100"
                  >
                    Escolher
                  </button>
                  <p className="min-w-0 truncate text-sm text-zinc-300">{getMultiFileLabel(photoFiles)}</p>
                </div>
              </label>

              <label className="grid gap-2 text-sm text-zinc-300">
                <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Videos da galeria</span>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(event) => setVideoFiles(Array.from(event.target.files ?? []))}
                />
                <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => openFileDialog(videoInputRef)}
                    className="shrink-0 rounded-full bg-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-zinc-100"
                  >
                    Escolher
                  </button>
                  <p className="min-w-0 truncate text-sm text-zinc-300">{getMultiFileLabel(videoFiles)}</p>
                </div>
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
          {Object.values(validationErrors).length > 0 ? (
            <div className="rounded-2xl border border-rose-400/60 bg-rose-500/10 p-4 text-sm text-rose-100">
              <p className="font-semibold">Revise antes de salvar:</p>
              <ul className="mt-2 grid gap-1">
                {Object.values(validationErrors).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Salvando..." : submitLabel}
          </button>
        </div>
      </form>

      {showPublicProfileReminder ? (
        <div className="fixed inset-0 z-[5000] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div
            ref={publicProfileReminderRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-profile-reminder-title"
            tabIndex={-1}
            className="w-full max-w-lg rounded-3xl border border-cyan-300/40 bg-zinc-950 p-6 shadow-2xl shadow-black/60 outline-none ring-2 ring-cyan-300/35"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Antes de salvar
            </p>
            <h2 id="public-profile-reminder-title" className="mt-3 text-2xl font-semibold text-white">
              Perfil privado
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Por seguranca, o perfil fica privado por padrao. Para quem tocar na tag NFC conseguir ver
              o perfil do pet, deixe o perfil como publico antes de salvar.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => setShowPublicProfileReminder(false)}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition hover:bg-white/10"
              >
                Voltar e ajustar
              </button>
              <button
                type="button"
                onClick={() => void makePublicAndSubmit()}
                className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-cyan-200"
              >
                Deixar publico e salvar
              </button>
            </div>
            <button
              type="button"
              onClick={() => void submitPetForm()}
              className="mt-3 w-full rounded-full border border-zinc-600/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white/5"
            >
              Salvar privado mesmo assim
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
