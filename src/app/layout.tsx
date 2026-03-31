import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Platform Status Dashboard",
  description: "Real-time monitoring dashboard for all products and services",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
