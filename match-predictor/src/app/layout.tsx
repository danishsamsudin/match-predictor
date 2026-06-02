import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";
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
  title: "Match Predictor",
  description: "AI-powered sports match prediction engine with weather and lineup analysis",
};

const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var theme=t==='dark'||t==='light'?t:'light';document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="relative flex min-h-full flex-col text-foreground">
        <ThemeProvider>
          <div className="app-bg pointer-events-none fixed inset-0 z-0 bg-background" aria-hidden="true">
            <div className="app-bg-gradient absolute inset-0" />
          </div>
          <Nav />
          <main className="relative z-10 flex-1">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
