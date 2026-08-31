import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AccountDisabledPage() {
  return (
    <div className="centered-viewport">
      <Lock className="size-10 text-muted-foreground" />
      <div className="text-center">
        <h1 className="page-title">Your account has been disabled</h1>
        <p className="page-subtitle">
          Contact the Office of the Registrar to have access restored.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </div>
  );
}
