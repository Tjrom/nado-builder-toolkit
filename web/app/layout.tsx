import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nado — простой обзор (testnet)",
  description: "Проверка подключения к Nado и последние свечи без установки программ."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
