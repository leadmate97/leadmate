"use client";

import { useEffect, useState } from "react";

export type AccessStatus = {
  authenticated: boolean;
  isAdmin?: boolean;
  accessAllowed: boolean;
  reason: string;
  subscriptionStatus?: string;
  trialEndsAt?: string | null;
  nextBillingAt?: string | null;
  billingFailures?: number;
};

export function useAccessStatus() {
  const [status, setStatus] = useState<AccessStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await fetch("/api/access/me", { cache: "no-store" });
        const result = await response.json();
        if (mounted) setStatus(result);
      } catch {
        if (mounted) {
          setStatus({
            authenticated: true,
            accessAllowed: false,
            reason: "ACCESS_CHECK_FAILED"
          });
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  return status;
}
