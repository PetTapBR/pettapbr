"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";

import { PetForm } from "@/components/pet-form";
import { usePetTap } from "@/context/pettap-provider";
import { isOwnerPro } from "@/lib/owner-defaults";
import type { Pet, PetFormValues } from "@/lib/types";

function mapPetToFormValues(pet: Pet): PetFormValues {
  return {
    name: pet.name,
    bio: pet.bio,
    age: pet.age,
    breed: pet.breed,
    weight: pet.weight,
    city: pet.city,
    whatsapp: pet.whatsapp,
    phone: pet.phone,
    locationLat: pet.locationLat,
    locationLng: pet.locationLng,
    locationLabel: pet.locationLabel,
    reward: pet.reward,
    status: pet.status,
    isPublicProfile: pet.isPublicProfile,
    allergies: pet.medical.allergies,
    medications: pet.medical.medications,
    vaccines: pet.medical.vaccines,
  };
}

export default function EditPetPage() {
  const router = useRouter();
  const params = useParams<{ petId: string }>();
  const { isReady, currentOwner, getPetById, getTagByPetId, updatePet } = usePetTap();

  const pet = useMemo(() => getPetById(params.petId), [getPetById, params.petId]);
  const linkedTag = useMemo(() => {
    if (!pet) {
      return null;
    }

    return getTagByPetId(pet.id) ?? null;
  }, [getTagByPetId, pet]);

  useEffect(() => {
    if (isReady && !currentOwner) {
      router.push("/login");
    }
  }, [currentOwner, isReady, router]);

  if (!isReady) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
        Carregando...
      </div>
    );
  }

  if (!currentOwner) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
        Redirecionando para login...
      </div>
    );
  }

  if (!pet || pet.ownerId !== currentOwner.id) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
        <h1 className="text-2xl font-semibold text-white">Pet nao encontrado</h1>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-4 rounded-full bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
        >
          Voltar ao dashboard
        </button>
      </section>
    );
  }

  const initialValues = mapPetToFormValues(pet);

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-4 text-sm text-cyan-100">
        <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/80">Vinculo NFC deste pet</p>
        {linkedTag ? (
          <p className="mt-2">
            Tag vinculada: <span className="font-semibold">{linkedTag.code}</span>
          </p>
        ) : (
          <p className="mt-2">
            Este pet ainda nao possui tag NFC. Para vincular, use o botao{" "}
            <span className="font-semibold">Vincular Tag NFC</span> no card do pet no dashboard e
            informe o Codigo NFC da tag.
          </p>
        )}
        <Link
          href="/dashboard"
          className="mt-3 inline-flex rounded-full border border-cyan-200/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-500/20"
        >
          Ir para dashboard
        </Link>
      </section>

      <PetForm
        key={`${pet.id}-${pet.updatedAt}`}
        title={`Editar ${pet.name}`}
        subtitle="Atualize dados do perfil, contatos e modo perdido com efeito imediato no link publico."
        submitLabel="Salvar alteracoes"
        isPremiumPlan={isOwnerPro(currentOwner)}
        initialValues={initialValues}
        initialAvatarUrl={pet.avatarUrl}
        initialGallery={pet.gallery}
        onSubmit={(payload) => updatePet(pet.id, payload)}
      />
    </div>
  );
}
