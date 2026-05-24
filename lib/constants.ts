import type { PetStatus } from "./types";

export const STATUS_META: Record<PetStatus, { label: string; badgeClass: string; cardClass: string }> = {
  safe: {
    label: "Em Casa",
    badgeClass: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40",
    cardClass: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  lost: {
    label: "Perdido",
    badgeClass: "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/50",
    cardClass: "from-rose-500/35 via-rose-600/10 to-transparent",
  },
  found: {
    label: "Encontrado",
    badgeClass: "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/50",
    cardClass: "from-sky-500/20 via-sky-500/5 to-transparent",
  },
};

export const STORAGE_KEY = "pettapbr-state-v1";
