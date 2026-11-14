"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { forgetGroup } from "@/device/store";

/**
 * Drops the group at this address from this device's list: it was deleted,
 * maybe from another device, and the link no longer opens anything.
 */
export function ForgetMissingGroup() {
  const token = /^\/g\/([^/]+)/.exec(usePathname() ?? "")?.[1];
  useEffect(() => {
    if (token) forgetGroup(token);
  }, [token]);
  return null;
}
