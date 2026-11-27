import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Overly strict for portal/tooltip positioning and ref merging patterns.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saved Opta / Transfermarkt HTML bundles (third-party assets, not app source).
    "data/**",
    "src/**/__fixtures__/**",
    "src/**/*_files/**",
    // CLI/ops scripts use require() and are not part of the Next app build.
    "scripts/**",
    // Offline Python/ML trees and local tooling, not app source.
    "core/**",
    "engine/**",
    "features/**",
    "models/**",
    "export/**",
    "services/**",
    "tests/**",
    "config/**",
    ".venv-ml/**",
  ]),
]);

export default eslintConfig;
