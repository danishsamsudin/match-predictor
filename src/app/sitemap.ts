import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/marketing/site";

const MARKETING_ROUTES = [
  "/",
  "/features",
  "/methodology",
  "/pricing",
  "/faq",
  "/about",
  "/compare",
  "/sources",
  "/signup",
  "/login",
  "/terms",
  "/privacy",
  "/disclaimer",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();

  return MARKETING_ROUTES.map((path) => ({
    url: path === "/" ? base : `${base}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/pricing" || path === "/features" ? 0.9 : 0.7,
  }));
}
