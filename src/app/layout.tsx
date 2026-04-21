import type { Metadata } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";
import ThemeProvider from "@/components/ThemeProvider";

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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AppFrame>{children}</AppFrame>
        </ThemeProvider>
      </body>
    </html>
  );
}
