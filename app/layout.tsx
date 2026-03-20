import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestor de productos",
  description: "Proyecto base en Next.js con formulario de productos"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
