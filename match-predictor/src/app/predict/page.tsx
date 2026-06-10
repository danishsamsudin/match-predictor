import type { Metadata } from "next";
import { PredictionForm } from "@/components/PredictionForm";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Predict | ${BRAND_NAME}`,
};

export default function PredictPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-6xl min-w-0 flex-col items-stretch justify-center px-3 py-6 sm:items-center sm:px-6 sm:py-10">
      <PredictionForm />
    </div>
  );
}
