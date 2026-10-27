import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ChessCity · Con el soporte de TopChess",
  description:
    "Tu trayectoria en Lichess, convertida en ciudad. Explora, progresa y personaliza tu edificio. Con el soporte de TopChess.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
