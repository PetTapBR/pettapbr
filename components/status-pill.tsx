import { getStatusMeta } from "@/lib/utils";
import type { PetStatus } from "@/lib/types";

export function StatusPill({ status }: { status: PetStatus }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
}
