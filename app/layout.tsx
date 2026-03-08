import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShareLine",
  description: "A simple meeting queue for in-person shares. No accounts. No history. Just the line.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body>{children}</body>
    </html>
  );
}