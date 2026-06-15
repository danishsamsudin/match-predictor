import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Repo root has a wrapper package.json; keep Turbopack scoped to this app.
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingExcludes: {
    "*": [
      "./data/world-cup-2026/WC-Opta-Results/**",
      "./data/world-cup-2026/WC-Opta-Player-Stats/**",
    ],
  },
};

export default nextConfig;
