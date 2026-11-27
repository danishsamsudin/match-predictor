import { BRAND_CONTACT_EMAIL, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

/** Canonical site origin for SEO metadata. */
export function getSiteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export function organizationJsonLd() {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url,
    email: BRAND_CONTACT_EMAIL,
    description: BRAND_TAGLINE,
  };
}

export function softwareApplicationJsonLd() {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    applicationCategory: "SportsApplication",
    operatingSystem: "Web",
    url,
    description: BRAND_TAGLINE,
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: "4.99",
      description: "Pulse plan starting price (monthly). Beta approval required.",
    },
  };
}
