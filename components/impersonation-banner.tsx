"use client";

import { Eye, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { stopImpersonating } from "@/app/(app)/actions";

/**
 * Says whose session this is, on every page, until it is given back.
 *
 * An impersonation that is not obvious is the dangerous kind: an admin who
 * forgets they are somebody else will act as them without meaning to.
 */
export function ImpersonationBanner({
  viewing,
  admin,
}: {
  viewing: { name: string; email: string };
  admin: { name: string };
}) {
  const router = useRouter();
  const [isStopping, startStop] = useTransition();

  return (
    <div className="impersonation-banner" data-testid="impersonation-banner">
      <span className="flex items-center gap-2 font-medium">
        <Eye className="size-4" />
        You are viewing the portal as {viewing.name} ({viewing.email}).
      </span>
      <span className="text-xs opacity-80">Signed in as {admin.name}.</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={isStopping}
        data-testid="stop-impersonating"
        onClick={() =>
          startStop(async () => {
            const result = await stopImpersonating();
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            router.push("/admin/users");
            router.refresh();
          })
        }
      >
        {isStopping ? <Loader2 className="size-4 animate-spin" /> : null}
        Stop impersonating
      </Button>
    </div>
  );
}
