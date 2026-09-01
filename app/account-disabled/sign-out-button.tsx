"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signOutAndRecord } from "@/lib/audit/session";

/**
 * The only way off this page.
 *
 * A disabled account still holds a valid session, so every route it reaches
 * sends it straight back here - "back to sign in" included. Ending the session
 * is what actually lets someone sign in as somebody else.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await signOutAndRecord();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button onClick={handleSignOut} disabled={busy} data-testid="sign-out">
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      Sign out
    </Button>
  );
}
