"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePetTap } from "@/context/pettap-provider";
import { supabase } from "@/lib/supabase";
import type { NfcTagStatus } from "@/lib/types";

interface RelatedOwnerRow {
  id: string;
  full_name: string;
  email: string;
}

interface RelatedPetRow {
  id: string;
  name: string;
}

interface AdminNfcTagRow {
  id: string;
  code: string;
  activation_code: string;
  owner_id: string | null;
  pet_id: string | null;
  status: NfcTagStatus;
  created_at: string;
  updated_at: string;
  owner: RelatedOwnerRow | RelatedOwnerRow[] | null;
  pet: RelatedPetRow | RelatedPetRow[] | null;
}

function asSingleRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

export function AdminPanelClient() {
  const router = useRouter();

  const {
    state,
    createNfcTag,
    setNfcTagStatus,
    unlinkNfcTag,
  } = usePetTap();

  const [tagCodeInput, setTagCodeInput] = useState("");
  const [activationCodeInput, setActivationCodeInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedOwnerPetByTagId, setResolvedOwnerPetByTagId] = useState<
    Record<string, { ownerName: string | null; ownerEmail: string | null; petName: string | null }>
  >({});

  const refreshOwnerPetResolution = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("nfc_tags")
      .select(
        "id, owner_id, pet_id, owner:owners(id, full_name, email), pet:pets(id, name)",
      );

    if (error || !data) {
      return;
    }

    const nextMap: Record<string, { ownerName: string | null; ownerEmail: string | null; petName: string | null }> =
      {};

    for (const row of data as AdminNfcTagRow[]) {
      const ownerRow = asSingleRow(row.owner);
      const petRow = asSingleRow(row.pet);

      nextMap[row.id] = {
        ownerName: ownerRow?.full_name ?? null,
        ownerEmail: ownerRow?.email ?? null,
        petName: petRow?.name ?? null,
      };
    }

    setResolvedOwnerPetByTagId(nextMap);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshOwnerPetResolution();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [refreshOwnerPetResolution, state.nfcTags.length, state.owners.length, state.pets.length]);

  const tagRows = useMemo(
    () =>
      [...state.nfcTags].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((tag) => {
        const ownerFromState = tag.ownerId
          ? state.owners.find((ownerCandidate) => ownerCandidate.id === tag.ownerId)
          : null;

        const petFromState = tag.petId
          ? state.pets.find((petCandidate) => petCandidate.id === tag.petId)
          : null;

        const resolved = resolvedOwnerPetByTagId[tag.id];
        const owner = ownerFromState
          ? {
              fullName: ownerFromState.fullName,
              email: ownerFromState.email,
            }
          : resolved
            ? {
                fullName: resolved.ownerName ?? "Nao vinculado",
                email: resolved.ownerEmail ?? "",
              }
            : null;

        const pet = petFromState
          ? {
              name: petFromState.name,
            }
          : resolved
            ? {
                name: resolved.petName ?? "Sem pet",
              }
            : null;

        return {
          tag,
          owner,
          pet,
        };
      }),
    [resolvedOwnerPetByTagId, state.nfcTags, state.owners, state.pets],
  );

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://seu-dominio.com";

  async function handleCreateTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback("Criando tag NFC...");

    const result = await createNfcTag({
      code: tagCodeInput,
      activationCode: activationCodeInput,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setFeedback(result.message ?? "Nao foi possivel criar tag NFC.");
      return;
    }

    setTagCodeInput("");
    setActivationCodeInput("");

    setFeedback(
      `Tag ${result.tag?.code ?? ""} criada com sucesso. Link NFC: ${baseUrl}/t/${result.tag?.code}`,
    );
    void refreshOwnerPetResolution();
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setFeedback(`Link copiado: ${link}`);
    } catch {
      setFeedback("Nao foi possivel copiar o link automaticamente.");
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login?next=/admin");
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Painel administrativo</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Controle de Tags NFC
            </h1>
            <p className="mt-2 text-sm text-zinc-300">
              Crie Codigos NFC, gere links de gravacao e monitore vinculos por Chave de Ativacao.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
          >
            Sair do Admin
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">Criar nova tag NFC</h2>

        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleCreateTag}>
          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              Codigo NFC (opcional)
            </span>
            <input
              type="text"
              value={tagCodeInput}
              onChange={(event) => setTagCodeInput(event.target.value)}
              placeholder="Ex: PTBR-NFC-010"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
            />
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              Chave de Ativacao (cadastro) (opcional)
            </span>
            <input
              type="text"
              value={activationCodeInput}
              onChange={(event) => setActivationCodeInput(event.target.value)}
              placeholder="Ex: ACT-9021"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
            />
          </label>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Criando..." : "Criar tag"}
            </button>
            <p className="text-sm text-zinc-400">{feedback}</p>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">Tags NFC cadastradas</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Grave na tag fisica o link `NFC Link` e entregue a Chave de Ativacao para o tutor.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-300">
            <thead className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Codigo NFC</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Chave de Ativacao</th>
                <th className="px-3 py-2">Tutor/Pet</th>
                <th className="px-3 py-2">NFC Link</th>
                <th className="px-3 py-2">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {tagRows.map(({ tag, owner, pet }) => {
                const nfcLink = `${baseUrl}/t/${tag.code}`;

                return (
                  <tr key={tag.id} className="border-t border-white/10 align-top">
                    <td className="px-3 py-3 font-semibold text-cyan-100">{tag.code}</td>
                    <td className="px-3 py-3 uppercase">{tag.status}</td>
                    <td className="px-3 py-3 font-mono text-xs">{tag.activationCode}</td>
                    <td className="px-3 py-3">
                      <p>{owner?.fullName ?? "Nao vinculado"}</p>
                      <p className="text-xs text-zinc-500">{owner?.email ?? "Sem e-mail"}</p>
                      <p className="text-xs text-zinc-400">{pet?.name ?? "Sem pet"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/t/${tag.code}`}
                          target="_blank"
                          className="rounded-full border border-white/15 px-3 py-1 text-center text-xs uppercase tracking-[0.12em]"
                        >
                          Abrir
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleCopy(nfcLink)}
                          className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-3 py-1 text-xs uppercase tracking-[0.12em] text-cyan-100"
                        >
                          Copiar
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const nextStatus = tag.status === "disabled" ? "active" : "disabled";
                            const result = await setNfcTagStatus(tag.id, nextStatus);
                            setFeedback(result.ok ? `Status da tag ${tag.code} atualizado.` : result.message ?? "Falha ao atualizar status.");
                            if (result.ok) {
                              void refreshOwnerPetResolution();
                            }
                          }}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.12em]"
                        >
                          {tag.status === "disabled" ? "Ativar" : "Desativar"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await unlinkNfcTag(tag.id);
                            setFeedback(result.ok ? `Tag ${tag.code} desvinculada.` : result.message ?? "Falha ao desvincular.");
                            if (result.ok) {
                              void refreshOwnerPetResolution();
                            }
                          }}
                          className="rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-rose-100"
                        >
                          Desvincular
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tagRows.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={6}>
                    Nenhuma tag NFC cadastrada.
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
