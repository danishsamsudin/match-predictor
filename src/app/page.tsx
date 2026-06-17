import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Sign in | ${BRAND_NAME}`,
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-6xl min-w-0 flex-col items-center justify-center px-3 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-2xl bg-white/30 dark:bg-slate-900/30" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
