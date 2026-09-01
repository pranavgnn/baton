import { Lock } from "lucide-react";

import { SignOutButton } from "./sign-out-button";

export default function AccountDisabledPage() {
  return (
    <div className="centered-viewport">
      <Lock className="size-10 text-muted-foreground" />
      <div className="text-center">
        <h1 className="page-title">Your account has been disabled</h1>
        <p className="page-subtitle">
          Contact the Office of the Registrar to have access restored, or sign
          out to use a different account.
        </p>
      </div>
      <SignOutButton />
    </div>
  );
}
