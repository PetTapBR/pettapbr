"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { usePetTap } from "@/context/pettap-provider";

function parseTab(value: string | null): "login" | "register" {
  return value === "register" ? "register" : "login";
}

interface AdminLoginResult {
  ok: boolean;
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { currentOwner, login, register } = usePetTap();
  const [tab, setTab] = useState<"login" | "register">(() => {
    if (typeof window === "undefined") {
      return "login";
    }

    const params = new URLSearchParams(window.location.search);
    return parseTab(params.get("tab"));
  });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = useMemo(
    () => (tab === "login" ? "Entrar no PETTAPBR" : "Criar conta de tutor"),
    [tab],
  );

  function getRequestedNextPath() {
    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedNextPath = params.get("next");
    return requestedNextPath && requestedNextPath.startsWith("/") ? requestedNextPath : null;
  }

  function getOwnerNextPath() {
    const requestedNextPath = getRequestedNextPath();

    if (!requestedNextPath || requestedNextPath.startsWith("/admin")) {
      return "/dashboard";
    }

    return requestedNextPath;
  }

  function getAdminNextPath() {
    const requestedNextPath = getRequestedNextPath();

    if (requestedNextPath && requestedNextPath.startsWith("/admin")) {
      return requestedNextPath;
    }

    return "/admin";
  }

  async function tryAdminLogin(adminEmail: string, adminPassword: string): Promise<AdminLoginResult> {
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
        }),
      });

      const data = (await response.json()) as AdminLoginResult;

      if (!response.ok || !data.ok) {
        return {
          ok: false,
          message: data.message ?? "Falha no login admin.",
        };
      }

      return { ok: true };
    } catch {
      return {
        ok: false,
        message: "Nao foi possivel conectar ao login admin.",
      };
    }
  }

  useEffect(() => {
    if (currentOwner) {
      const requestedNextPath = getRequestedNextPath();
      const nextPath =
        !requestedNextPath || requestedNextPath.startsWith("/admin")
          ? "/dashboard"
          : requestedNextPath;

      router.push(nextPath);
    }
  }, [currentOwner, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setFeedback("Informe e-mail e senha.");
      return;
    }

    if (tab === "login") {
      setIsSubmitting(true);
      const ownerResult = await login(email, password);

      if (ownerResult.ok) {
        setIsSubmitting(false);
        router.push(getOwnerNextPath());
        return;
      }

      const adminResult = await tryAdminLogin(email, password);
      setIsSubmitting(false);

      if (adminResult.ok) {
        router.push(getAdminNextPath());
        return;
      }

      if (!ownerResult.ok) {
        setFeedback(ownerResult.message ?? "Falha no login.");
        return;
      }
    }

    if (!fullName.trim()) {
      setFeedback("Informe seu nome completo.");
      return;
    }

    setIsSubmitting(true);
    const result = await register(fullName, email, password);
    setIsSubmitting(false);
    if (!result.ok) {
      setFeedback(result.message ?? "Falha no cadastro.");
      return;
    }

    if (result.requiresEmailConfirmation) {
      setFeedback(result.message ?? "Conta criada. Confirme o e-mail para entrar.");
      setTab("login");
      return;
    }

    router.push(getOwnerNextPath());
  }

  if (currentOwner) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Acesso seguro</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
      </header>

      <div className="mb-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setTab("login")}
          className={[
            "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
            tab === "login" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10",
          ].join(" ")}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setTab("register")}
          className={[
            "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
            tab === "register" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10",
          ].join(" ")}
        >
          Cadastro
        </button>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        {tab === "register" && (
          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Nome completo</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
            />
          </label>
        )}

        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
          />
        </label>

        <label className="grid gap-2 text-sm text-zinc-300">
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
          />
        </label>

        <p className="text-sm text-zinc-400">{feedback}</p>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Aguarde..." : tab === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>
    </section>
  );
}
