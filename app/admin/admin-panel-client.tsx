"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { NfcTagStatus } from "@/lib/types";

interface AdminTagView {
  id: string;
  code: string;
  activationCode: string;
  ownerId: string | null;
  petId: string | null;
  status: NfcTagStatus;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  pet: {
    id: string;
    name: string;
  } | null;
}

interface AdminTagsResponse {
  ok: boolean;
  message?: string;
  tags?: AdminTagView[];
}

interface AdminCreateTagResponse {
  ok: boolean;
  message?: string;
  tag?: AdminTagView;
}

interface AdminMutationResponse {
  ok: boolean;
  message?: string;
}

export function AdminPanelClient() {
  const router = useRouter();
  const [tags, setTags] = useState<AdminTagView[]>([]);
  const [tagCodeInput, setTagCodeInput] = useState("");
  const [activationCodeInput, setActivationCodeInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTags, setIsLoadingTags] = useState(true);

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://seu-dominio.com";

  const tagRows = useMemo(
    () => [...tags].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tags],
  );

  const fetchTags = useCallback(async () => {
    setIsLoadingTags(true);

    try {
      const response = await fetch("/api/admin/tags", {
        method: "GET",
        credentials: "include",
      });
      const data = (await response.json()) as AdminTagsResponse;

      if (response.status === 401) {
        router.push("/login?next=/admin");
        return;
      }

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Nao foi possivel listar as tags NFC.");
        return;
      }

      setTags(data.tags ?? []);
    } catch {
      setFeedback("Falha de conexao ao listar tags NFC.");
    } finally {
      setIsLoadingTags(false);
    }
  }, [router]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchTags();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchTags]);

  async function handleCreateTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback("Criando tag NFC...");

    try {
      const response = await fetch("/api/admin/tags", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: tagCodeInput,
          activationCode: activationCodeInput,
        }),
      });

      const data = (await response.json()) as AdminCreateTagResponse;

      if (response.status === 401) {
        router.push("/login?next=/admin");
        return;
      }

      if (!response.ok || !data.ok || !data.tag) {
        setFeedback(data.message ?? "Nao foi possivel criar tag NFC.");
        return;
      }

      setTagCodeInput("");
      setActivationCodeInput("");
      setFeedback(`Tag ${data.tag.code} criada com sucesso. Link NFC: ${baseUrl}/t/${data.tag.code}`);
      setTags((prev) => [data.tag!, ...prev]);
    } catch {
      setFeedback("Falha de conexao ao criar tag NFC.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setFeedback(`Link copiado: ${link}`);
    } catch {
      setFeedback("Nao foi possivel copiar o link automaticamente.");
    }
  }

  async function mutateTag(tagId: string, payload: { action: "setStatus"; status: NfcTagStatus } | { action: "unlink" }) {
    const response = await fetch(`/api/admin/tags/${encodeURIComponent(tagId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as AdminMutationResponse;

    if (response.status === 401) {
      router.push("/login?next=/admin");
      return {
        ok: false,
        message: "Sessao admin expirada. Faca login novamente.",
      };
    }

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message: data.message ?? "Falha ao atualizar tag NFC.",
      };
    }

    return { ok: true };
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    });
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
              {tagRows.map((tag) => {
                const nfcLink = `${baseUrl}/t/${tag.code}`;

                return (
                  <tr key={tag.id} className="border-t border-white/10 align-top">
                    <td className="px-3 py-3 font-semibold text-cyan-100">{tag.code}</td>
                    <td className="px-3 py-3 uppercase">{tag.status}</td>
                    <td className="px-3 py-3 font-mono text-xs">{tag.activationCode}</td>
                    <td className="px-3 py-3">
                      <p>{tag.owner?.fullName ?? "Nao vinculado"}</p>
                      <p className="text-xs text-zinc-500">{tag.owner?.email ?? "Sem e-mail"}</p>
                      <p className="text-xs text-zinc-400">{tag.pet?.name ?? "Sem pet"}</p>
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
                          onClick={() => void handleCopy(nfcLink)}
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
                            const result = await mutateTag(tag.id, {
                              action: "setStatus",
                              status: nextStatus,
                            });

                            if (!result.ok) {
                              setFeedback(result.message ?? "Falha ao atualizar status.");
                              return;
                            }

                            setFeedback(`Status da tag ${tag.code} atualizado.`);
                            void fetchTags();
                          }}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.12em]"
                        >
                          {tag.status === "disabled" ? "Ativar" : "Desativar"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await mutateTag(tag.id, { action: "unlink" });
                            if (!result.ok) {
                              setFeedback(result.message ?? "Falha ao desvincular.");
                              return;
                            }

                            setFeedback(`Tag ${tag.code} desvinculada.`);
                            void fetchTags();
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
              {!isLoadingTags && tagRows.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={6}>
                    Nenhuma tag NFC cadastrada.
                  </td>
                </tr>
              )}
              {isLoadingTags && (
                <tr>
                  <td className="px-3 py-4 text-zinc-400" colSpan={6}>
                    Carregando tags...
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
