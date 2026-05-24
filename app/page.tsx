"use client";

import Image from "next/image";
import Link from "next/link";

import { usePetTap } from "@/context/pettap-provider";

const valueHighlights = [
  "Perfil Start com nome, foto e contato para ativacao imediata.",
  "Upgrade Pro com bio, galeria, dados medicos, modo perdido e alertas por proximidade.",
  "Identificacao por NFC para acesso imediato ao perfil em qualquer situacao.",
  "Painel do tutor com historico de acessos, tags e controle total dos pets.",
];

const flowSteps = [
  {
    title: "1. Crie sua conta",
    description: "Cadastre-se como tutor para acessar o painel e configurar seu ecossistema PetTapBR.",
  },
  {
    title: "2. Cadastre seu pet",
    description: "Preencha foto, dados medicos, contatos e localizacao para formar o perfil inteligente.",
  },
  {
    title: "3. Ative sua tag NFC",
    description: "Vincule a tag ao pet e deixe o acesso publico pronto para leitura instantanea.",
  },
];

export default function HomePage() {
  const { currentOwner } = usePetTap();

  return (
    <div className="grid gap-8 sm:gap-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(34,211,238,0.3),transparent_42%),radial-gradient(circle_at_90%_10%,rgba(255,255,255,0.12),transparent_38%)]" />

        <div className="relative z-10 mb-6 overflow-hidden rounded-3xl">
          <img src="/banner.png" alt="Banner PetTapBR" className="block h-auto w-full rounded-3xl" />
        </div>

        <div className="relative z-10 grid gap-8 sm:grid-cols-2 sm:items-center">
          <div className="animate-fade-up grid gap-4">
            <p className="inline-flex w-fit rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              NFC Smart Pet Profile
            </p>
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Logo PetTapBR"
                width={112}
                height={38}
                className="h-12 w-auto object-contain"
              />
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">PetTapBR</h1>
            </div>
            <p className="max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
              Plataforma de identidade digital para pets com tecnologia NFC, visual premium e
              fluxo completo para seguranca, localizacao e contato imediato.
            </p>

            <div className="flex flex-wrap gap-3">
              {currentOwner ? (
                <Link
                  href="/dashboard"
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
                >
                  Abrir Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
                  >
                    Entrar
                  </Link>
                  <Link
                    href="/plans"
                    className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
                  >
                    Ver Planos
                  </Link>
                  <Link
                    href="/login?tab=register"
                    className="rounded-full border border-cyan-300/35 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/15"
                  >
                    Criar conta
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="animate-float grid gap-3">
            {valueHighlights.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-white/15 bg-zinc-900/60 px-4 py-4 text-sm text-zinc-200 backdrop-blur"
              >
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {flowSteps.map((step) => (
          <article
            key={step.title}
            className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:border-cyan-300/35 hover:bg-white/10"
          >
            <h2 className="text-lg font-semibold text-white">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{step.description}</p>
          </article>
        ))}
      </section>

      {!currentOwner && (
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-r from-zinc-900/80 via-zinc-900/60 to-cyan-950/40 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Pronto para comecar</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Ative sua identidade digital PetTapBR
              </h3>
              <p className="mt-2 text-sm text-zinc-300">
                Crie sua conta e configure seus pets com NFC em poucos minutos.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login?tab=register"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
              >
                Criar conta agora
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
              >
                Ja tenho conta
              </Link>
            </div>
          </div>
        </section>
      )}

      {currentOwner && (
        <section className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-zinc-300">
          <p className="text-lg font-semibold text-white">Sua conta esta ativa.</p>
          <p className="mt-2 text-sm">Continue no dashboard para gerenciar pets, tags NFC e acessos.</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200"
          >
            Ir para dashboard
          </Link>
        </section>
      )}

      <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 sm:grid-cols-2 sm:p-8">
        <div>
          <h4 className="text-xl font-semibold text-white">Experiencia para o tutor</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Controle completo do perfil do pet, status de seguranca, historico de acessos e notificacoes em
            tempo real para reagir rapido quando necessario.
          </p>
        </div>
        <div>
          <h4 className="text-xl font-semibold text-white">Seguranca para o pet</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Qualquer pessoa pode acessar o perfil pelo toque NFC e contatar o tutor com um clique por WhatsApp
            ou ligacao, reduzindo o tempo de resposta em casos de perda.
          </p>
        </div>
      </section>
    </div>
  );
}
