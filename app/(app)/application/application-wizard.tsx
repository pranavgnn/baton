"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FormWizard } from "@/components/form-runtime/form-wizard";
import { Button } from "@/components/ui/button";
import type { FormSchema, SectionData } from "@/lib/workflow/types";
import {
  clearApplicationDraft,
  saveApplicationDraft,
  submitApplication,
} from "./actions";

export function ApplicationWizard({
  form,
  defaultValues,
}: {
  form: FormSchema;
  defaultValues: SectionData | null;
}) {
  const router = useRouter();

  return (
    <FormWizard
      form={form}
      defaultValues={defaultValues}
      onSaveDraft={saveApplicationDraft}
      onClear={clearApplicationDraft}
      renderSubmitActions={({ getValues, validate, busy, setBusy }) => (
        <Button
          disabled={busy}
          data-testid="submit-application"
          onClick={async () => {
            if (!(await validate())) return;
            setBusy(true);
            try {
              const result = await submitApplication(getValues());
              if (result.ok) {
                toast.success(
                  `Application submitted. It is now with ${result.data.destination}.`,
                );
                router.refresh();
              } else {
                toast.error(result.error);
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Submit application
        </Button>
      )}
    />
  );
}
