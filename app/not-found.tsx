import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="centered-viewport">
      <FileQuestion className="size-10 text-muted-foreground" />
      <div className="text-center">
        <h1 className="page-title">Page not found</h1>
        <p className="page-subtitle">
          The page you are looking for does not exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
