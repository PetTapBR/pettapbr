"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePetTap } from "@/context/pettap-provider";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-w-[96px] items-center justify-center rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-center transition sm:px-4 sm:text-xs sm:tracking-[0.14em]",
        active
          ? "bg-white text-zinc-950 shadow-lg shadow-cyan-500/20"
          : "text-zinc-300 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentOwner, logout } = usePetTap();

  const isPublicPetPage = pathname.startsWith("/p/") || pathname.startsWith("/t/");

  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_90%_15%,rgba(56,189,248,0.14),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.08),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />

      {!isPublicPetPage && (
        <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo.png"
                  alt="Logo PetTapBR"
                  width={140}
                  height={48}
                  className="h-12 w-auto object-contain"
                  priority
                />
              </Link>
              {currentOwner && (
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex min-w-[96px] items-center justify-center rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-300 text-center transition hover:border-white/35 hover:text-white sm:hidden"
                >
                  Sair
                </button>
              )}
            </div>

            <div className="w-full min-w-0">
              <div className="flex w-full flex-wrap gap-2 sm:justify-end">
                <NavLink href="/" label="Inicio" active={pathname === "/"} />
                {currentOwner ? (
                  <>
                    <NavLink
                      href="/dashboard"
                      label="Dashboard"
                      active={pathname.startsWith("/dashboard")}
                    />
                    <NavLink href="/plans" label="Planos" active={pathname.startsWith("/plans")} />
                    <button
                      type="button"
                      onClick={logout}
                      className="hidden min-w-[96px] items-center justify-center rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-300 text-center transition hover:border-white/35 hover:text-white sm:inline-flex sm:px-4 sm:text-xs sm:tracking-[0.14em]"
                    >
                      Sair
                    </button>
                  </>
                ) : (
                  <>
                    <NavLink href="/plans" label="Planos" active={pathname.startsWith("/plans")} />
                    <NavLink href="/login" label="Entrar" active={pathname.startsWith("/login")} />
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">{children}</main>

      <footer className="relative z-10 border-t border-white/10 bg-zinc-950/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-center text-xs text-zinc-400 sm:px-6 sm:text-left">
          <p className="uppercase tracking-[0.14em] text-zinc-300">PetTapBR&reg;</p>
          <p>© {new Date().getFullYear()} PetTapBR. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
