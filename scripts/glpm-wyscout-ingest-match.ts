/**
 * @deprecated SportMonks is the primary ingest path.
 * Prefer: npm run glpm:sm-ingest
 * For Wyscout secondary enrich: npm run glpm:wy-enrich
 *
 * This script remains as a thin alias that prints guidance.
 */
console.error(
  [
    "glpm-wyscout-ingest-match is deprecated.",
    "SportMonks is now the primary source of truth:",
    "  npm run glpm:sm-ingest -- --mock",
    "  npm run glpm:sm-ingest -- <fixtureId>",
    "Wyscout enrich (PPDA / shots / xG gaps):",
    "  npm run glpm:wy-enrich -- <matchSmId>",
  ].join("\n")
);
process.exit(1);
