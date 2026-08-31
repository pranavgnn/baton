import { GraduationCap } from "lucide-react";
import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="centered-viewport">
      <div className="fixed top-4 right-4">
        <ModeToggle />
      </div>

      <Link href="/" className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-6" />
        </span>
        <span className="text-lg font-semibold">
          Manipal Institute of Technology
        </span>
        <span className="text-sm text-muted-foreground">
          Promotion Application Portal
        </span>
      </Link>

      {children}
    </div>
  );
}
