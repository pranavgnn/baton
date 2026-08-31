import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="centered-viewport">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <div className="text-center">
        <h1 className="page-title">You do not have access to this page</h1>
        <p className="page-subtitle">
          Ask a portal administrator if you believe this is a mistake.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
