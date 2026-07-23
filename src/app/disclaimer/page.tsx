import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocLayout } from "@/components/marketing/LegalDocLayout";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "Disclaimer",
};

export default function DisclaimerPage() {
  return (
    <LegalDocLayout title="Disclaimer & limitation of responsibility">
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
        insights, and AI chat responses are statistical or informational estimates for entertainment
        and research. They are not guarantees of match outcomes.
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

      <h2 className="text-base font-bold text-foreground">4. Past performance</h2>
      <p>
        Marketing metrics, founder research results (including any World Cup or other sample
        windows), hit rates, closing-line statistics, drawdowns, and similar figures are illustrative
        or historical samples. They are not audited performance, not typical subscriber results, and
        not indicative of future results. Sample sizes may be limited and variance is high.
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
      </p>

      <h2 className="text-base font-bold text-foreground">7. Age restriction</h2>
      <p>You must be 18 or older to use {BRAND_NAME}.</p>

      <h2 className="text-base font-bold text-foreground">8. Contact</h2>
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
