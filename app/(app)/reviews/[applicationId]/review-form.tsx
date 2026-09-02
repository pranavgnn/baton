"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormWizard } from "@/components/form-runtime/form-wizard";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  FormSchema,
  SectionData,
  StageOutcome,
} from "@/lib/workflow/types";
import { clearStageDraft, completeStage, saveStageDraft } from "../actions";

export type Nominee = { id: string; name: string; email: string };

export function ReviewForm({
  applicationId,
  stageLabel,
  form,
  outcomes,
  defaultValues,
  nominees,
}: {
  applicationId: string;
  stageLabel: string;
  form: FormSchema;
  outcomes: StageOutcome[];
  defaultValues: SectionData | null;
  /**
   * Who this stage may hand the application on to. Null when the stage does
   * not nominate, which is every stage but the dean's.
   */
  nominees: Nominee[] | null;
}) {
  const router = useRouter();
  const [nomineeId, setNomineeId] = useState("");

  const mustNominate = nominees !== null;
  const noCandidates = mustNominate && nominees.length === 0;

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
          {mustNominate ? (
            <Field className="w-full" data-testid="nominee-field">
              <FieldLabel htmlFor="nominee">Send to</FieldLabel>
              {noCandidates ? (
                <FieldDescription data-testid="no-nominees">
                  This school has no associate dean who can review applications.
                  Ask an administrator to assign one before sending this on.
                </FieldDescription>
              ) : (
                <>
                  <Select value={nomineeId} onValueChange={setNomineeId}>
                    <SelectTrigger id="nominee" data-testid="nominee">
                      <SelectValue placeholder="Choose an associate dean" />
                    </SelectTrigger>
                    <SelectContent>
                      {nominees.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Only the person you choose will see this application next.
                  </FieldDescription>
                </>
              )}
            </Field>
          ) : null}

          {outcomes.map((outcome) => (
            <Button
              key={outcome.id}
              disabled={busy || (mustNominate && !nomineeId)}
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
                    nomineeId || null,
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
