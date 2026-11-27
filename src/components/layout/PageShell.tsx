import type { ReactNode } from "react";
import { PAGE_SHELL_CLASS } from "@/lib/layout";

export function PageShell({
  children,
  className = "",
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  /** Narrow reading width for empty / error states. */
  narrow?: boolean;
}) {
  if (narrow) {
    return (
      <div
        className={`mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-6 sm:py-8${className ? ` ${className}` : ""}`}
      >
        {children}
      </div>
    );
  }
  return (
    <div className={`${PAGE_SHELL_CLASS}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
