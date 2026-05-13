import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nado testnet explorer — simple overview",
  description: "Check Nado testnet connectivity and view recent candles in your browser. No wallet keys required."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
