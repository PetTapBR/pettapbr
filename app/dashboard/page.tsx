"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { StatusPill } from "@/components/status-pill";
import { usePetTap } from "@/context/pettap-provider";
import { formatDateTime, normalizeTagCode } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const {
    isReady,
    currentOwner,
    currentOwnerPets,
    currentOwnerTags,
    ownerScanEvents,
    state,
    markNotificationRead,
    markAllNotificationsRead,
    updatePetStatus,
    getTagByPetId,
    getPetById,
  } = usePetTap();

  useEffect(() => {
    if (isReady && !currentOwner) {
      router.push("/login");
    }
  }, [currentOwner, isReady, router]);

  if (!isReady || !currentOwner) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-300 backdrop-blur">
        Carregando dashboard...
      </div>
    );
  }

  const lostPetsCount = currentOwnerPets.filter((pet) => pet.status === "lost").length;
  const totalScans = ownerScanEvents.length;
  const nfcScans = ownerScanEvents.filter((event) => event.source === "nfc").length;

  function openNfcLinkFlow(petId: string) {
    const input = window.prompt("Digite o Codigo NFC da tag (ex: PTBR-NFC-010).") ?? "";
    const normalized = normalizeTagCode(input);

    if (!normalized) {
      return;
    }

    router.push(`/t/${encodeURIComponent(normalized)}?pet=${encodeURIComponent(petId)}`);
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Painel do tutor</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Bem-vinda, {currentOwner.fullName}
            </h1>
            <p className="mt-2 text-sm text-zinc-300">
              Gerencie seus pets, tags NFC e acompanhe cada acesso em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 sm:justify-end">
            <Link
              href="/pets/new"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
            >
              Novo Pet
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
            >
              Ver Site
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Total de pets</p>
          <p className="mt-2 text-3xl font-semibold text-white">{currentOwnerPets.length}</p>
        </div>
        <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-rose-200">Pets perdidos</p>
          <p className="mt-2 text-3xl font-semibold text-rose-100">{lostPetsCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Acessos NFC</p>
          <p className="mt-2 text-3xl font-semibold text-white">{nfcScans}</p>
          <p className="mt-1 text-xs text-zinc-400">Total geral {totalScans}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-cyan-100">Tags NFC ativas</p>
          <p className="mt-2 text-3xl font-semibold text-cyan-50">
            {currentOwnerTags.filter((tag) => tag.status === "active").length}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-white">Notificacoes</h2>
          <button
            type="button"
            onClick={markAllNotificationsRead}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
          >
            Marcar todas como lidas
          </button>
        </div>

        <div className="grid gap-2">
          {state.notifications
            .filter((item) => item.ownerId === currentOwner.id)
            .slice(0, 8)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => markNotificationRead(item.id)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition",
                  item.read
                    ? "border-white/10 bg-white/5 text-zinc-400"
                    : "border-cyan-300/35 bg-cyan-500/10 text-cyan-50",
                ].join(" ")}
              >
                <p className="text-sm">{item.message}</p>
                <p className="mt-1 text-xs opacity-75">{formatDateTime(item.createdAt)}</p>
              </button>
            ))}

          {state.notifications.filter((item) => item.ownerId === currentOwner.id).length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm text-zinc-400">
              Sem notificacoes ainda. Quando alguem abrir o perfil via NFC, elas aparecem aqui.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {currentOwnerPets.map((pet) => {
          const tag = getTagByPetId(pet.id);

          return (
            <article
              key={pet.id}
              className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/30"
            >
              <img src={pet.avatarUrl} alt={pet.name} className="h-48 w-full rounded-2xl object-cover" />
              <div className="mt-4 flex items-center justify-between">
                <h3 className="text-2xl font-semibold tracking-tight text-white">{pet.name}</h3>
                <StatusPill status={pet.status} />
              </div>
              <p className="mt-2 max-h-11 overflow-hidden text-sm text-zinc-300">{pet.bio}</p>

              <div className="mt-3 rounded-2xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                {tag ? `Codigo NFC: ${tag.code}` : "Sem tag NFC vinculada"}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`/pets/${pet.id}/edit`}
                  className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
                >
                  Editar
                </Link>
                <Link
                  href={`/p/${pet.slug}?source=direct`}
                  target="_blank"
                  className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
                >
                  Perfil Publico
                </Link>

                {tag ? (
                  <Link
                    href={`/t/${tag.code}`}
                    target="_blank"
                    className="col-span-2 rounded-xl border border-cyan-300/35 bg-cyan-500/15 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-cyan-50 transition hover:bg-cyan-500/25"
                  >
                    Abrir link NFC
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openNfcLinkFlow(pet.id)}
                    className="col-span-2 rounded-xl border border-dashed border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    Vincular Tag NFC
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updatePetStatus(pet.id, "safe")}
                  className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200"
                >
                  Seguro
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reward = window.prompt("Recompensa opcional (ex: R$ 400)", pet.reward ?? "") ?? "";
                    updatePetStatus(pet.id, "lost", reward);
                  }}
                  className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200"
                >
                  Perdido
                </button>
                <button
                  type="button"
                  onClick={() => updatePetStatus(pet.id, "found")}
                  className="rounded-xl border border-sky-400/35 bg-sky-500/10 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-200"
                >
                  Encontrado
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {currentOwnerPets.length === 0 && (
        <section className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-zinc-300">
          <p className="text-lg font-semibold text-white">Nenhum pet cadastrado ainda.</p>
          <p className="mt-2 text-sm">Crie o primeiro perfil inteligente para ativar sua tag NFC.</p>
          <Link
            href="/pets/new"
            className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
          >
            Cadastrar Pet
          </Link>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">Minhas tags NFC</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-300">
            <thead className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Codigo NFC</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Pet</th>
                <th className="px-3 py-2">Acesso</th>
              </tr>
            </thead>
            <tbody>
              {currentOwnerTags.map((tag) => {
                const linkedPet = tag.petId ? getPetById(tag.petId) : null;

                return (
                  <tr key={tag.id} className="border-t border-white/10">
                    <td className="px-3 py-3 font-semibold text-cyan-100">{tag.code}</td>
                    <td className="px-3 py-3 uppercase">{tag.status}</td>
                    <td className="px-3 py-3">{linkedPet?.name ?? "Nao vinculado"}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/t/${tag.code}`}
                        target="_blank"
                        className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.12em]"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {currentOwnerTags.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={4}>
                    Nenhuma tag NFC ativa nesta conta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">Historico de acessos NFC</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-300">
            <thead className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Pet</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {ownerScanEvents.slice(0, 20).map((event) => (
                <tr key={event.id} className="border-t border-white/10">
                  <td className="px-3 py-3">{event.petName}</td>
                  <td className="px-3 py-3 uppercase">{event.source}</td>
                  <td className="px-3 py-3">{event.viewerLocation || "Nao informado"}</td>
                  <td className="px-3 py-3">{formatDateTime(event.createdAt)}</td>
                </tr>
              ))}
              {ownerScanEvents.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={4}>
                    Ainda nao houve escaneamentos NFC.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
