import type { Metadata } from "next";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { PricingCards } from "@/components/marketing/PricingCards";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { BRAND_NAME } from "@/lib/brand";
import { PRICING_TRIAL_DAYS } from "@/lib/marketing/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${BRAND_NAME} plans: Pulse, Edge, and Oracle with monthly or annual billing and a ${PRICING_TRIAL_DAYS}-day trial after beta approval.`,
  alternates: { canonical: "/pricing" },
};

export const revalidate = 3600;

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Pricing"
        title="Three paid tiers. Monthly or annual."
        description={`Every plan includes a ${PRICING_TRIAL_DAYS}-day free trial after beta approval. Annual billing saves 2 months. Request access today - no payment collected on this page.`}
        align="center"
      />

      <div className="mt-10">
        <PricingCards />
      </div>

      <DisclaimerBanner className="mx-auto mt-8 max-w-3xl">
        Subscriptions are not charged on this beta request form. Model outputs remain entertainment
        / research estimates - not betting advice. Past results are not indicative of future
        results. 18+.
      </DisclaimerBanner>

      <div className="mx-auto mt-12 max-w-xl">
        <WaitlistForm source="pricing" />
      </div>
    </div>
  );
}
