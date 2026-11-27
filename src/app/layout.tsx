import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import {
  getSiteUrl,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/marketing/site";
import { DEFAULT_THEME } from "@/lib/theme";
import { buildThemeInitScript } from "@/lib/theme-init-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: BRAND_NAME,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_TAGLINE,
  applicationName: BRAND_NAME,
  keywords: [
    "football predictions",
    "match probabilities",
    "expected goals",
    "fair odds",
    "Premier League",
    "Eredivisie",
    "Serie A",
    "Bundesliga",
    "Championship",
    "DynamixG",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: BRAND_NAME,
    siteName: BRAND_NAME,
    description: BRAND_TAGLINE,
    type: "website",
    url: siteUrl,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const themeInitScript = buildThemeInitScript();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="relative flex min-h-full flex-col text-foreground">
        <JsonLd data={[organizationJsonLd(), softwareApplicationJsonLd()]} />
        <ThemeProvider>
          <div className="app-bg pointer-events-none fixed inset-0 z-0 bg-background" aria-hidden="true">
            <div className="app-bg-gradient absolute inset-0" />
          </div>
          <Nav />
          <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden">{children}</main>
          <SiteFooter />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
