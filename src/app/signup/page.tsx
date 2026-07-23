import type { Metadata } from "next";
import { SignupForm } from "@/components/marketing/SignupForm";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { BRAND_NAME } from "@/lib/brand";
import { getPricingPlan } from "@/lib/marketing/pricing";

export const metadata: Metadata = {
  title: "Sign up",
  description: `Join the ${BRAND_NAME} waitlist.`,
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const plan = getPricingPlan(params.plan)?.id ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12">
      <SignupForm defaultPlan={plan} />
      <DisclaimerBanner />
    </div>
  );
}
