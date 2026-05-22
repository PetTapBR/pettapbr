import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">404</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Pagina nao encontrada</h1>
      <p className="mt-3 text-sm text-zinc-300">O link informado nao existe ou foi removido.</p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-950"
      >
        Voltar para inicio
      </Link>
    </section>
  );
}
