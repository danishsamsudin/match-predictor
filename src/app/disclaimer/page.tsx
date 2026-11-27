import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocLayout } from "@/components/marketing/LegalDocLayout";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL, COVERAGE_LEAGUES } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: `${BRAND_NAME} disclaimer: research estimates only, not betting advice. 18+.`,
  alternates: { canonical: "/disclaimer" },
};

export const revalidate = 86400;

export default function DisclaimerPage() {
  return (
    <LegalDocLayout
      title="Disclaimer & limitation of responsibility"
      updatedLabel="Updated for league research metrics and beta access - counsel review recommended."
    >
      <p>
        Please read this carefully before using {BRAND_NAME}. By using the Service you acknowledge
        this Disclaimer together with our{" "}
        <Link href="/terms" className="font-semibold text-primary">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-primary">
          Privacy policy
        </Link>
        .
      </p>

      <h2 className="text-base font-bold text-foreground">1. Entertainment and research only</h2>
      <p>
        All probabilities, expected goals style estimates, market lines, fair odds, +EV indicators,
        Value Opportunities language (including confidence, Kelly-style sizing, and Bet / Watch /
        Pass), insights, and AI chat responses are statistical or informational estimates for
        entertainment and research. They are not guarantees of match outcomes.
      </p>

      <h2 className="text-base font-bold text-foreground">2. Not advice</h2>
      <p>
        Nothing on {BRAND_NAME} is betting advice, financial advice, investment advice, or a
        recommendation to place any wager or transaction. You alone decide whether and how to use
        information from the Service.
      </p>

      <h2 className="text-base font-bold text-foreground">3. Risk of loss</h2>
      <p>
        Betting and similar activities involve a substantial risk of loss. You can lose some or all
        of any money you stake. Do not use money you cannot afford to lose. If gambling is a problem
        for you, seek local help resources and stop using betting products.
      </p>

      <h2 className="text-base font-bold text-foreground">4. Past performance and model metrics</h2>
      <p>
        Marketing metrics, league reliability tables, hit rates, calibration statistics, and similar
        figures for {COVERAGE_LEAGUES.join(", ")} (and any other competitions) are model research
        samples derived from locked evaluations. They are not audited betting P&amp;L, not typical
        subscriber results, and not indicative of future results. Sample sizes vary by league and
        market. Variance is high.
      </p>

      <h2 className="text-base font-bold text-foreground">5. No responsibility for decisions</h2>
      <p>
        DynamixG and its operators are not responsible for any decisions you make based on the
        Service, including any profits, losses, damages, or disputes with third parties such as
        bookmakers.
      </p>

      <h2 className="text-base font-bold text-foreground">6. Data and model limitations</h2>
      <p>
        Models depend on third-party data that may be incomplete, delayed, or incorrect. Features and
        coverage can change without notice. AI features may produce inaccurate or incomplete answers.
        We do not publish proprietary coefficients or formulas.
      </p>

      <h2 className="text-base font-bold text-foreground">7. Beta software</h2>
      <p>
        During beta, features may change, break, or be withdrawn. Approval of an account does not
        guarantee ongoing access or specific feature availability.
      </p>

      <h2 className="text-base font-bold text-foreground">8. Age restriction</h2>
      <p>You must be 18 or older to use {BRAND_NAME}.</p>

      <h2 className="text-base font-bold text-foreground">9. Contact</h2>
      <p>
        Questions about this Disclaimer:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalDocLayout>
  );
}
