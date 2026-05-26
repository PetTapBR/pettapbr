"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { usePetTap } from "@/context/pettap-provider";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { hasSupabase, supabase } from "@/lib/supabase";

function parseTab(value: string | null): "login" | "register" {
  return value === "register" ? "register" : "login";
}

function parseMode(value: string | null): "default" | "recovery" {
  return value === "recovery" ? "recovery" : "default";
}

function getInitialModeFromUrl(): "default" | "recovery" {
  if (typeof window === "undefined") {
    return "default";
  }

  const params = new URLSearchParams(window.location.search);
  const queryMode = parseMode(params.get("mode"));
  if (queryMode === "recovery") {
    return "recovery";
  }

  const hashParams = parseHashParams();
  if (params.get("type") === "recovery" || hashParams.get("type") === "recovery") {
    return "recovery";
  }

  return "default";
}

function isSafeInternalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

interface AdminLoginResult {
  ok: boolean;
  message?: string;
}

function PasswordEyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="3.2" />
      {!visible && <path d="M4 4l16 16" />}
    </svg>
  );
}

function parseHashParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function stripHashFromUrl(keepModeRecovery: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (keepModeRecovery) {
    params.set("mode", "recovery");
  }

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
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
  const [mode, setMode] = useState<"default" | "recovery">(getInitialModeFromUrl);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [feedback, setFeedback] = useState(() =>
    getInitialModeFromUrl() === "recovery"
      ? "Defina uma nova senha para concluir a recuperacao."
      : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingRecoveryEmail, setIsSendingRecoveryEmail] = useState(false);
  const [isUpdatingRecoveryPassword, setIsUpdatingRecoveryPassword] = useState(false);

  const title = useMemo(
    () => {
      if (mode === "recovery") {
        return "Redefinir senha";
      }

      return tab === "login" ? "Entrar no PetTapBR" : "Criar conta de tutor";
    },
    [mode, tab],
  );

  function getRequestedNextPath() {
    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedNextPath = params.get("next");
    return requestedNextPath && isSafeInternalPath(requestedNextPath) ? requestedNextPath : null;
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
    if (mode === "recovery") {
      return;
    }

    if (currentOwner) {
      const requestedNextPath = getRequestedNextPath();
      const nextPath =
        !requestedNextPath || requestedNextPath.startsWith("/admin")
          ? "/dashboard"
          : requestedNextPath;

      router.push(nextPath);
    }
  }, [currentOwner, mode, router]);

  useEffect(() => {
    if (mode !== "recovery") {
      return;
    }

    let cancelled = false;

    const syncRecoverySession = async () => {
      if (!hasSupabase || !supabase) {
        if (!cancelled) {
          setFeedback("Recuperacao indisponivel. Configure o Supabase.");
        }
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hashParams = parseHashParams();

      const hashError =
        hashParams.get("error_description") ??
        hashParams.get("error") ??
        params.get("error_description") ??
        params.get("error");
      if (hashError) {
        if (!cancelled) {
          setFeedback(decodeURIComponent(hashError));
        }
        stripHashFromUrl(true);
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = params.get("code");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          if (!cancelled) {
            setFeedback(error.message || "Nao foi possivel validar o link de recuperacao.");
          }
          stripHashFromUrl(true);
          return;
        }

        if (!cancelled) {
          setRecoverySessionReady(true);
          setFeedback("Link validado. Informe a nova senha.");
        }
        stripHashFromUrl(true);
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setFeedback(error.message || "Nao foi possivel validar o link de recuperacao.");
          }
          stripHashFromUrl(true);
          return;
        }

        if (!cancelled) {
          setRecoverySessionReady(true);
          setFeedback("Link validado. Informe a nova senha.");
        }
        stripHashFromUrl(true);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (!cancelled) {
          setFeedback(error.message || "Falha ao validar sessao de recuperacao.");
        }
        return;
      }

      if (!cancelled) {
        setRecoverySessionReady(Boolean(data.session));
        if (!data.session) {
          setFeedback("Abra novamente o link enviado por e-mail para redefinir a senha.");
        }
      }
    };

    void syncRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

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

    if (!activationCode.trim()) {
      setFeedback("Informe a chave de ativacao enviada com sua tag NFC.");
      return;
    }

    if (!termsAccepted || !privacyAccepted) {
      setFeedback("Voce precisa aceitar os Termos de Uso e a Politica de Privacidade para continuar.");
      return;
    }

    setIsSubmitting(true);
    const result = await register(fullName, email, password, activationCode, {
      termsAccepted,
      privacyAccepted,
    });
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

  async function handleSendRecoveryEmail() {
    setFeedback("");

    if (!hasSupabase || !supabase) {
      setFeedback("Recuperacao indisponivel. Configure o Supabase.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFeedback("Informe o e-mail para receber o link de recuperacao.");
      return;
    }

    if (typeof window === "undefined") {
      setFeedback("Nao foi possivel preparar o link de recuperacao.");
      return;
    }

    setIsSendingRecoveryEmail(true);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login?mode=recovery`,
    });
    setIsSendingRecoveryEmail(false);

    if (error) {
      setFeedback(error.message || "Falha ao enviar e-mail de recuperacao.");
      return;
    }

    setFeedback("Enviamos um link de recuperacao para seu e-mail.");
  }

  async function handleRecoveryPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!hasSupabase || !supabase) {
      setFeedback("Recuperacao indisponivel. Configure o Supabase.");
      return;
    }

    if (!recoverySessionReady) {
      setFeedback("Abra o link de recuperacao enviado por e-mail.");
      return;
    }

    if (!recoveryPassword.trim()) {
      setFeedback("Informe a nova senha.");
      return;
    }

    if (recoveryPassword.length < 8) {
      setFeedback("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (recoveryPassword !== recoveryPasswordConfirm) {
      setFeedback("A confirmacao da senha nao confere.");
      return;
    }

    setIsUpdatingRecoveryPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: recoveryPassword,
    });
    setIsUpdatingRecoveryPassword(false);

    if (error) {
      setFeedback(error.message || "Nao foi possivel redefinir a senha.");
      return;
    }

    setRecoveryPassword("");
    setRecoveryPasswordConfirm("");
    setRecoverySessionReady(false);
    setMode("default");
    setTab("login");
    setFeedback("Senha atualizada com sucesso. Voce ja pode entrar.");

    try {
      await supabase.auth.signOut();
    } catch {
      // best effort
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("mode");
      params.delete("code");
      params.delete("type");
      const requestedNextPath = params.get("next");
      if (requestedNextPath && requestedNextPath.startsWith("/admin")) {
        params.delete("next");
      }
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
  }

  if (currentOwner && mode !== "recovery") {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Acesso seguro</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
      </header>

      {mode === "default" && (
        <div className="mb-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setFeedback("");
            }}
            className={[
              "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
              tab === "login" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10",
            ].join(" ")}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setFeedback("");
            }}
            className={[
              "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
              tab === "register" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10",
            ].join(" ")}
          >
            Cadastro
          </button>
        </div>
      )}

      {mode === "default" ? (
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

          {tab === "register" && (
            <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-300">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cyan-300"
                />
                <span className="leading-5">
                  Aceito os{" "}
                  <Link href="/terms" className="text-cyan-200 underline underline-offset-2 hover:text-cyan-100">
                    Termos de Uso
                  </Link>{" "}
                  ({TERMS_VERSION}).
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cyan-300"
                />
                <span className="leading-5">
                  Aceito a{" "}
                  <Link href="/privacy" className="text-cyan-200 underline underline-offset-2 hover:text-cyan-100">
                    Politica de Privacidade (LGPD)
                  </Link>{" "}
                  ({PRIVACY_VERSION}).
                </span>
              </label>
            </div>
          )}

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10"
            />
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Senha</span>
            <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition focus-within:border-cyan-300/60 focus-within:bg-white/10">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 w-full bg-transparent px-4 py-3 text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center border-l border-white/10 text-cyan-200 transition hover:bg-white/10 hover:text-white"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <PasswordEyeIcon visible={showPassword} />
              </button>
            </div>
          </label>

          {tab === "register" && (
            <label className="grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">
                Chave de Ativacao (cadastro)
              </span>
              <input
                type="text"
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                placeholder="Ex: ACT-9021"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60 focus:bg-white/10"
              />
            </label>
          )}

          {tab === "login" && (
            <button
              type="button"
              onClick={() => void handleSendRecoveryEmail()}
              disabled={isSendingRecoveryEmail || isSubmitting}
              className="w-fit text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSendingRecoveryEmail ? "Enviando..." : "Esqueci minha senha"}
            </button>
          )}

          <p className="text-sm text-zinc-400">{feedback}</p>

          <button
            type="submit"
            disabled={isSubmitting || isSendingRecoveryEmail}
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Aguarde..." : tab === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      ) : (
        <form className="grid gap-4" onSubmit={handleRecoveryPasswordSubmit}>
          <p className="text-sm text-zinc-300">
            Use o link recebido no e-mail e defina sua nova senha.
          </p>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">Nova senha</span>
            <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition focus-within:border-cyan-300/60 focus-within:bg-white/10">
              <input
                type={showRecoveryPassword ? "text" : "password"}
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 w-full bg-transparent px-4 py-3 text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setShowRecoveryPassword((prev) => !prev)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center border-l border-white/10 text-cyan-200 transition hover:bg-white/10 hover:text-white"
                aria-label={showRecoveryPassword ? "Ocultar senha" : "Mostrar senha"}
                title={showRecoveryPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <PasswordEyeIcon visible={showRecoveryPassword} />
              </button>
            </div>
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              Confirmar nova senha
            </span>
            <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition focus-within:border-cyan-300/60 focus-within:bg-white/10">
              <input
                type={showRecoveryPassword ? "text" : "password"}
                value={recoveryPasswordConfirm}
                onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 w-full bg-transparent px-4 py-3 text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setShowRecoveryPassword((prev) => !prev)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center border-l border-white/10 text-cyan-200 transition hover:bg-white/10 hover:text-white"
                aria-label={showRecoveryPassword ? "Ocultar senha" : "Mostrar senha"}
                title={showRecoveryPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <PasswordEyeIcon visible={showRecoveryPassword} />
              </button>
            </div>
          </label>

          <p className="text-sm text-zinc-400">{feedback}</p>

          <button
            type="submit"
            disabled={!recoverySessionReady || isUpdatingRecoveryPassword}
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isUpdatingRecoveryPassword ? "Atualizando..." : "Atualizar senha"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("default");
              setFeedback("");
              setRecoveryPassword("");
              setRecoveryPasswordConfirm("");
              setRecoverySessionReady(false);
              if (typeof window !== "undefined") {
                const params = new URLSearchParams(window.location.search);
                params.delete("mode");
                params.delete("code");
                params.delete("type");
                const query = params.toString();
                window.history.replaceState(
                  {},
                  "",
                  `${window.location.pathname}${query ? `?${query}` : ""}`,
                );
              }
            }}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:text-white"
          >
            Voltar para login
          </button>
        </form>
      )}
    </section>
  );
}
