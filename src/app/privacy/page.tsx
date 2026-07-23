import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocLayout } from "@/components/marketing/LegalDocLayout";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return (
    <LegalDocLayout title="Privacy policy">
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
          Account / waitlist details you submit (such as username, name, email, phone, country,
          preferred plan, and marketing preferences).
        </li>
        <li>Technical data such as IP address, device/browser information, and basic usage logs.</li>
        <li>
          Prediction inputs and results you generate so you can view history inside the product.
        </li>
      </ul>

      <h2 className="text-base font-bold text-foreground">2. How we use information</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To operate, secure, and improve the Service.</li>
        <li>To manage waitlists, invites, trials, and (when enabled) subscriptions.</li>
        <li>To respond to support requests and send service or marketing messages you opt into.</li>
        <li>To comply with law and enforce our Terms.</li>
      </ul>

      <h2 className="text-base font-bold text-foreground">3. Legal bases</h2>
      <p>
        Where GDPR or similar rules apply, we rely on contract performance, legitimate interests
        (securing and improving the Service), consent (where required for marketing), and legal
        obligation.
      </p>

      <h2 className="text-base font-bold text-foreground">4. Sharing</h2>
      <p>
        We do not sell personal data. We may share data with processors who help us host, store, or
        analyse the Service (for example database and hosting providers), and when required by law.
        Third-party data providers used for match statistics and weather are listed on our{" "}
        <Link href="/sources" className="font-semibold text-primary">
          data sources
        </Link>{" "}
        page and have their own privacy policies.
      </p>

      <h2 className="text-base font-bold text-foreground">5. Retention</h2>
      <p>
        We keep information as long as needed for the purposes above, including waitlist records,
        account history, and legal retention requirements, then delete or anonymise where practical.
      </p>

      <h2 className="text-base font-bold text-foreground">6. Security</h2>
      <p>
        We use reasonable technical and organisational measures. No method of transmission or storage
        is fully secure.
      </p>

      <h2 className="text-base font-bold text-foreground">7. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict
        processing of your personal data, and to withdraw marketing consent. Contact{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2 className="text-base font-bold text-foreground">8. Children</h2>
      <p>The Service is for users 18+. We do not knowingly collect data from minors.</p>

      <h2 className="text-base font-bold text-foreground">9. Changes</h2>
      <p>
        We may update this policy. Continued use after updates means you acknowledge the revised
        policy where permitted by law.
      </p>
    </LegalDocLayout>
  );
}
