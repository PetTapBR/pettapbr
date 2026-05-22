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
        "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
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
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_90%_15%,rgba(56,189,248,0.14),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.08),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />

      {!isPublicPetPage && (
        <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20">
                <Image src="/logo.jpg" alt="Logo PETTAPBR" width={36} height={36} />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Smart Pet ID</p>
                <p className="text-base font-semibold tracking-tight">PETTAPBR</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <NavLink href="/" label="Inicio" active={pathname === "/"} />
              {currentOwner ? (
                <>
                  <NavLink
                    href="/dashboard"
                    label="Dashboard"
                    active={pathname.startsWith("/dashboard")}
                  />
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:border-white/35 hover:text-white"
                  >
                    Sair
                  </button>
                </>
              ) : (
                <NavLink href="/login" label="Entrar" active={pathname.startsWith("/login")} />
              )}
            </div>
          </div>
        </header>
      )}

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}
