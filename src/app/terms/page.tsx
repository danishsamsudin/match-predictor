import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocLayout } from "@/components/marketing/LegalDocLayout";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "Terms & conditions",
};

export default function TermsPage() {
  return (
    <LegalDocLayout title="Terms & conditions">
      <p>
        These Terms govern your use of {BRAND_NAME} websites, applications, and related services
        (the &quot;Service&quot;) operated by DynamixG. By accessing or using the Service you agree
        to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2 className="text-base font-bold text-foreground">1. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally able to enter a binding agreement. The Service
        is not directed to minors.
      </p>

      <h2 className="text-base font-bold text-foreground">2. Nature of the Service</h2>
      <p>
        {BRAND_NAME} provides statistical estimates, model probabilities, expected goals style
        outputs, and related match intelligence for entertainment and research. Outputs are not
        guaranteed outcomes and must not be treated as financial, investment, or betting advice.
        You are solely responsible for any decisions you make.
      </p>

      <h2 className="text-base font-bold text-foreground">3. Accounts and waitlist</h2>
      <p>
        Access may be invite-based, waitlist-based, or credential-based. You agree to provide
        accurate information and keep credentials confidential. We may refuse, suspend, or terminate
        access at our discretion, including for abuse or unlawful use.
      </p>

      <h2 className="text-base font-bold text-foreground">4. Subscriptions and trials</h2>
      <p>
        Paid tiers and free trials may be offered. Pricing pages that collect waitlist interest do
        not create a paid subscription until checkout is completed through a separate payment flow.
        Trial terms will be stated when billing is enabled.
      </p>

      <h2 className="text-base font-bold text-foreground">5. Acceptable use</h2>
      <p>
        You agree to use the Service lawfully and not to scrape, overload, reverse engineer, or
        misuse our infrastructure, models, or content in ways that harm the Service or other users.
      </p>

      <h2 className="text-base font-bold text-foreground">6. Intellectual property</h2>
      <p>
        The Service, branding, models, and content are owned by DynamixG or its licensors. You
        receive a limited, non-exclusive, non-transferable right to use the Service as permitted.
      </p>

      <h2 className="text-base font-bold text-foreground">7. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF
        ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
        AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT ESTIMATES WILL BE ACCURATE, COMPLETE, OR
        PROFITABLE.
      </p>

      <h2 className="text-base font-bold text-foreground">8. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, DYNAMIXG AND ITS OPERATORS ARE NOT LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
        DATA, OR GOODWILL, ARISING FROM YOUR USE OF OR RELIANCE ON THE SERVICE - INCLUDING BETTING
        OR FINANCIAL LOSSES. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE IS LIMITED TO
        THE AMOUNT YOU PAID US FOR THE SERVICE IN THE THREE MONTHS BEFORE THE CLAIM (OR ZERO IF YOU
        PAID NOTHING).
      </p>

      <h2 className="text-base font-bold text-foreground">9. Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless DynamixG from claims arising out of your misuse of
        the Service, your violation of these Terms, or your violation of any law or third-party
        right.
      </p>

      <h2 className="text-base font-bold text-foreground">10. Changes</h2>
      <p>
        We may change features, data coverage, pricing, or these Terms. Continued use after changes
        become effective constitutes acceptance where permitted by law.
      </p>

      <h2 className="text-base font-bold text-foreground">11. Contact</h2>
      <p>
        Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary">
          {CONTACT_EMAIL}
        </a>
        . Also see our{" "}
        <Link href="/privacy" className="font-semibold text-primary">
          Privacy policy
        </Link>{" "}
        and{" "}
        <Link href="/disclaimer" className="font-semibold text-primary">
          Disclaimer
        </Link>
        .
      </p>
    </LegalDocLayout>
  );
}
