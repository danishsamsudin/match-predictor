import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocLayout } from "@/components/marketing/LegalDocLayout";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${BRAND_NAME} handles personal data for beta access, accounts, and analytics.`,
  alternates: { canonical: "/privacy" },
};

export const revalidate = 86400;

export default function PrivacyPage() {
  return (
    <LegalDocLayout
      title="Privacy policy"
      updatedLabel="Updated for beta access launch - counsel review recommended before charging money."
    >
      <p>
        This Privacy policy explains how DynamixG (&quot;we&quot;, &quot;us&quot;) handles personal
        information when you use {BRAND_NAME}. Contact:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2 className="text-base font-bold text-foreground">1. Information we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Beta / account details you submit (username, name, email, phone, country, preferred plan,
          billing preference, and marketing preferences).
        </li>
        <li>
          Authentication secrets stored as password hashes (we do not store plaintext passwords).
        </li>
        <li>Technical data such as IP address, device/browser information, and basic usage logs.</li>
        <li>
          Prediction inputs and results you generate so you can view history inside the product.
        </li>
        <li>
          Optional analytics events (for example Vercel Analytics) about page views and performance.
        </li>
      </ul>

      <h2 className="text-base font-bold text-foreground">2. How we use information</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To operate, secure, and improve the Service.</li>
        <li>
          To manage beta requests, approvals (pending / accepted / rejected), invites, trials, and
          (when enabled) subscriptions.
        </li>
        <li>To authenticate sign-in for accepted accounts.</li>
        <li>To respond to support requests and send service or marketing messages you opt into.</li>
        <li>To comply with law and enforce our Terms.</li>
      </ul>

      <h2 className="text-base font-bold text-foreground">3. Legal bases (GDPR / EU)</h2>
      <p>
        Where GDPR or similar rules apply, we rely on contract performance (providing the Service),
        legitimate interests (securing and improving the Service), consent (where required for
        marketing), and legal obligation.
      </p>

      <h2 className="text-base font-bold text-foreground">4. Sharing and processors</h2>
      <p>
        We do not sell personal data. We may share data with processors who help us host, store, or
        analyse the Service (for example database hosting such as Supabase, application hosting such
        as Vercel, and analytics). We may disclose information when required by law. Third-party
        football data and odds providers used for match statistics are listed on our{" "}
        <Link href="/sources" className="font-semibold text-primary">
          data sources
        </Link>{" "}
        page and have their own privacy policies. We do not send your account password to those
        providers.
      </p>

      <h2 className="text-base font-bold text-foreground">5. International transfers</h2>
      <p>
        Processors may store or process data in the EU, UK, US, or other regions. Where required, we
        rely on appropriate safeguards (such as standard contractual clauses) provided by those
        processors.
      </p>

      <h2 className="text-base font-bold text-foreground">6. Retention</h2>
      <p>
        We keep information as long as needed for the purposes above, including beta records, account
        history, and legal retention requirements, then delete or anonymise where practical. Rejected
        or inactive beta requests may be deleted after a reasonable period.
      </p>

      <h2 className="text-base font-bold text-foreground">7. Security</h2>
      <p>
        We use reasonable technical and organisational measures, including hashed passwords and
        access controls on production databases. No method of transmission or storage is fully
        secure.
      </p>

      <h2 className="text-base font-bold text-foreground">8. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict
        processing of your personal data, to data portability, and to withdraw marketing consent.
        Contact{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary">
          {CONTACT_EMAIL}
        </a>
        . You may also lodge a complaint with your local supervisory authority.
      </p>

      <h2 className="text-base font-bold text-foreground">9. Children</h2>
      <p>The Service is for users 18+. We do not knowingly collect data from minors.</p>

      <h2 className="text-base font-bold text-foreground">10. Changes</h2>
      <p>
        We may update this policy. Continued use after updates means you acknowledge the revised
        policy where permitted by law.
      </p>
    </LegalDocLayout>
  );
}
