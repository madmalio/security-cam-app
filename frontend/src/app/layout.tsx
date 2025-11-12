import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "./components/ThemeProvider";
import { SettingsProvider } from "./contexts/SettingsContext"; // <-- 1. IMPORT

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CamView",
  description: "Security Camera Viewer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <main>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {/* 2. WRAP APP WITH SETTINGS PROVIDER */}
            <SettingsProvider>
              {children}
              <Toaster position="top-right" richColors />
            </SettingsProvider>
          </ThemeProvider>
        </main>
      </body>
    </html>
  );
}
