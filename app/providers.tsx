"use client";

import { PetTapProvider } from "@/context/pettap-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <PetTapProvider>{children}</PetTapProvider>;
}
