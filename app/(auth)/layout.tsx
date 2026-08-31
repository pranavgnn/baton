import Image from "next/image";
import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="centered-viewport">
      <div className="fixed top-4 right-4">
        <ModeToggle />
      </div>

      <Link href="/" className="flex flex-col items-center gap-2 text-center">
        <Image
          src="/mu_logo.png"
          alt="Manipal University Logo"
          width={48}
          height={48}
          className="size-12 object-contain"
        />
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
