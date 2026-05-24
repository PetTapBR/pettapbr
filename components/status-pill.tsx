import { getStatusMeta } from "@/lib/utils";
import type { PetStatus } from "@/lib/types";

export function StatusPill({ status }: { status: PetStatus }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] sm:px-3 sm:text-xs sm:tracking-[0.14em] ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
}
