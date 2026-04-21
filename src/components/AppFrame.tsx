"use client";

import type { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import { pageClass } from "@/lib/ui";

export default function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-[1640px] px-4 py-4 sm:px-5 sm:py-5 lg:px-5">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[60px_minmax(0,1fr)] lg:gap-4">
          <AppSidebar />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
