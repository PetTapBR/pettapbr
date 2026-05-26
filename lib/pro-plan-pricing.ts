export const PRO_PLAN_CYCLES = [1, 3, 6, 12] as const;

export type ProPlanCycleMonths = (typeof PRO_PLAN_CYCLES)[number];

interface ProPlanCycleConfig {
  label: string;
  value: number;
}

const PRO_PLAN_CONFIG: { readonly [K in ProPlanCycleMonths]: ProPlanCycleConfig } = {
  1: {
    label: "Mensal",
    value: 9.9,
  },
  3: {
    label: "Trimestral",
    value: 27.9,
  },
  6: {
    label: "Semestral",
    value: 52.9,
  },
  12: {
    label: "Anual",
    value: 99,
  },
};

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function isProPlanCycleMonths(value: number): value is ProPlanCycleMonths {
  return (PRO_PLAN_CYCLES as readonly number[]).includes(value);
}

export function getProPlanCycleLabel(months: number) {
  if (!isProPlanCycleMonths(months)) {
    return "";
  }

  return PRO_PLAN_CONFIG[months].label;
}

export function getProPlanChargeValue(months: number) {
  if (!isProPlanCycleMonths(months)) {
    return null;
  }

  return PRO_PLAN_CONFIG[months].value;
}

export function getProPlanMonthlyEquivalent(months: number) {
  const total = getProPlanChargeValue(months);
  if (total === null) {
    return null;
  }

  return Math.round((total / months) * 100) / 100;
}

export function formatBrl(value: number) {
  return brlFormatter.format(value);
}
