import Link from "next/link";

import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="centered-viewport">
      <div className="fixed top-4 right-4">
        <ModeToggle />
      </div>

      <Link href="/" className="flex flex-col items-center gap-2 text-center">
        <Logo className="size-10" />
        <span className="text-lg font-semibold">Baton</span>
        <span className="text-sm text-muted-foreground">
          Applications that pass from hand to hand
        </span>
      </Link>

      {children}
    </div>
  );
}
