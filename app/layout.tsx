import type { Metadata } from "next";
import { Sora, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/app/providers";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PetTapBR | Identidade Digital Inteligente para Pets",
  description:
    "Perfil inteligente para pets via NFC com modo perdido, contatos rapidos e painel do tutor.",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${sora.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
