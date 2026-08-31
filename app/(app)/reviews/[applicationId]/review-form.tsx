"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FormWizard } from "@/components/form-runtime/form-wizard";
import { Button } from "@/components/ui/button";
import type {
  FormSchema,
  SectionData,
  StageOutcome,
} from "@/lib/workflow/types";
import { clearStageDraft, completeStage, saveStageDraft } from "../actions";

export function ReviewForm({
  applicationId,
  stageLabel,
  form,
  outcomes,
  defaultValues,
}: {
  applicationId: string;
  stageLabel: string;
  form: FormSchema;
  outcomes: StageOutcome[];
  defaultValues: SectionData | null;
}) {
  const router = useRouter();

  return (
    <FormWizard
      form={form}
      defaultValues={defaultValues}
      submitHeading={`Confirm your ${stageLabel.toLowerCase()}`}
      submitDescription="Choose the outcome that decides where this application goes next."
      onSaveDraft={(data) => saveStageDraft(applicationId, data)}
      onClear={() => clearStageDraft(applicationId)}
      renderSubmitActions={({ getValues, validate, busy, setBusy }) => (
        <>
          {outcomes.map((outcome) => (
            <Button
              key={outcome.id}
              disabled={busy}
              variant={
                outcome.tone === "positive"
                  ? "default"
                  : outcome.tone === "negative"
                    ? "destructive"
                    : "outline"
              }
              data-testid={`outcome-${outcome.label}`}
              onClick={async () => {
                if (outcome.requiresForm && !(await validate())) return;
                setBusy(true);
                try {
                  const result = await completeStage(
                    applicationId,
                    outcome.id,
                    getValues(),
                  );
                  if (result.ok) {
                    toast.success(
                      `Recorded "${outcome.label}". The application is now at ${result.data.destination}.`,
                    );
                    router.push("/reviews");
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {outcome.label}
            </Button>
          ))}
        </>
      )}
    />
  );
}
