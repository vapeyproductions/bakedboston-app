import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.baked-boston.com"),
  title: "BakedBoston — Surplus food. Smarter routes.",
  description: "A carbon-aware food rescue route optimizer connecting bakery surplus, neighborhood pantries, and volunteer drivers.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "BakedBoston — Surplus food. Smarter routes.",
    description: "Sustainable food rescue logistics, powered by community.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "BakedBoston",
    description: "Surplus food. Smarter routes. Stronger communities.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
