import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/marketing/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/home",
          "/predict",
          "/league",
          "/predictions",
          "/reports",
          "/world-cup",
          "/nations-league",
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
