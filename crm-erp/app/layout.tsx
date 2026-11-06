import "./globals.css";
import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import UxEnhancer from "@/components/UxEnhancer";

export const metadata: Metadata = {
  title: "Talent CRM/ERP",
  applicationName: "Talent CRM",
  appleWebApp: { capable: true, title: "Talent CRM", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", colorScheme: "light dark",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f7f9" }, { media: "(prefers-color-scheme: dark)", color: "#10141b" }],
};

export default async function Root({ children }: { children: React.ReactNode }) {
  const t = (await cookies()).get("theme")?.value;
  return <html lang="en" data-theme={t === "light" || t === "dark" ? t : undefined} suppressHydrationWarning><body>{children}<Suspense fallback={null}><UxEnhancer /></Suspense></body></html>;
}
