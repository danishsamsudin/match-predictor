import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Repo root has a wrapper package.json; keep Turbopack scoped to this app.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
