"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startApplication } from "./actions";

export function StartApplicationButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <Button
      disabled={disabled || isPending}
      data-testid="start-application"
      onClick={() =>
        start(async () => {
          const result = await startApplication();
          if (result.ok) {
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowRight className="size-4" />
      )}
      {disabled ? "Applications are closed" : "Start application"}
    </Button>
  );
}
