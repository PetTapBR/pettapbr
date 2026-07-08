"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const { isReady, currentOwner, getPetById, getTagByPetId, updatePet, deletePet } = usePetTap();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  async function handleDeletePet() {
    if (!pet) {
      return;
    }

    setDeleteFeedback("");
    setIsDeleting(true);
    const result = await deletePet(pet.id);
    setIsDeleting(false);

    if (!result.ok) {
      setDeleteFeedback(result.message ?? "Nao foi possivel excluir o pet.");
      return;
    }

    router.push("/dashboard");
  }

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

      <section className="rounded-3xl border border-rose-400/35 bg-rose-500/10 p-5 text-sm text-rose-100">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
          Excluir perfil do pet
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Remover {pet.name}</h2>
        <p className="mt-2 leading-6 text-rose-100/85">
          A exclusao remove o perfil do pet, historico vinculado e notificacoes relacionadas. Se houver tag NFC,
          ela sera desvinculada para poder ser usada novamente.
        </p>
        {deleteFeedback ? <p className="mt-3 text-sm text-rose-200">{deleteFeedback}</p> : null}
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => setShowDeleteConfirm(true)}
          className="mt-4 rounded-full border border-rose-200/50 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-rose-50 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Excluir perfil do pet
        </button>
      </section>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-[5000] grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-pet-confirm-title"
            className="w-full max-w-lg rounded-3xl border border-rose-400/45 bg-zinc-950 p-6 shadow-2xl shadow-black/70"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
              Confirmar exclusao
            </p>
            <h2 id="delete-pet-confirm-title" className="mt-3 text-2xl font-semibold text-white">
              Excluir {pet.name}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Esta acao remove o perfil do pet, historico vinculado e notificacoes relacionadas. A tag NFC
              vinculada sera liberada para uso novamente.
            </p>
            <p className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              Depois de excluir, esse perfil nao aparecera mais para quem acessar o link ou tocar na tag.
            </p>
            {deleteFeedback ? <p className="mt-3 text-sm text-rose-200">{deleteFeedback}</p> : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeletePet()}
                className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
