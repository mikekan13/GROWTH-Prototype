import type { Metadata } from "next";
import { Bebas_Neue, Comfortaa, Inknut_Antiqua } from "next/font/google";
import { DiceOverlayLoader } from "@/components/dice/DiceOverlayLoader";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
});

const inknutAntiqua = Inknut_Antiqua({
  variable: "--font-inknut-antiqua",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GRO.WTH",
  description: "A digital-first TTRPG platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bebasNeue.variable} ${comfortaa.variable} ${inknutAntiqua.variable} antialiased min-h-screen`}>
        {children}
        <DiceOverlayLoader />
      </body>
    </html>
  );
}
