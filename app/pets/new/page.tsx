"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PetForm } from "@/components/pet-form";
import { usePetTap } from "@/context/pettap-provider";
import { isOwnerPro } from "@/lib/owner-defaults";

export default function NewPetPage() {
  const router = useRouter();
  const { isReady, currentOwner, addPet } = usePetTap();

  useEffect(() => {
    if (isReady && !currentOwner) {
      router.push("/login");
    }
  }, [currentOwner, isReady, router]);

  if (!isReady || !currentOwner) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
        Carregando...
      </div>
    );
  }

  return (
    <PetForm
      title="Cadastrar novo pet"
      subtitle="Monte o perfil inteligente com contatos, dados medicos e galeria para acesso imediato via NFC."
      submitLabel="Salvar pet"
      isPremiumPlan={isOwnerPro(currentOwner)}
      onSubmit={async (payload) => {
        const result = await addPet(payload);

        if (result.ok && result.petId) {
          router.push(`/pets/${result.petId}/edit`);
          return { ok: true };
        }

        return { ok: false, message: result.message };
      }}
    />
  );
}
