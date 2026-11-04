import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GuidedTour } from "@/components/GuidedTour";

export const metadata: Metadata = {
  title: "Miraflores Tax Workpaper",
  description: "Web-native tax workpaper — Okafor-Lindqvist household, 2025.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
          <Breadcrumbs />
          {children}
        </main>
        <GuidedTour />
      </body>
    </html>
  );
}
