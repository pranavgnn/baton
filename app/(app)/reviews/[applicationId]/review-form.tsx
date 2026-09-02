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
  nomineesByOutcome,
}: {
  applicationId: string;
  stageLabel: string;
  form: FormSchema;
  outcomes: StageOutcome[];
  defaultValues: SectionData | null;
  /**
   * Per outcome, who it may be addressed to. Null for an outcome that goes to
   * a whole role, which is most of them.
   */
  nomineesByOutcome: Record<string, Nominee[] | null>;
}) {
  const router = useRouter();
  const [nomineeByOutcome, setNomineeByOutcome] = useState<
    Record<string, string>
  >({});

  const nominating = outcomes.filter(
    (outcome) => nomineesByOutcome[outcome.id] != null,
  );

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
          {nominating.map((outcome) => {
            const people = nomineesByOutcome[outcome.id] ?? [];
            return (
              <Field
                key={outcome.id}
                className="w-full"
                data-testid={`nominee-field-${outcome.label}`}
              >
                <FieldLabel htmlFor={`nominee-${outcome.id}`}>
                  {nominating.length > 1
                    ? `Send to, for "${outcome.label}"`
                    : "Send to"}
                </FieldLabel>
                {people.length === 0 ? (
                  <FieldDescription data-testid="no-nominees">
                    Nobody is currently appointed to take this on. Ask an
                    administrator to appoint someone before choosing &ldquo;
                    {outcome.label}&rdquo;.
                  </FieldDescription>
                ) : (
                  <>
                    <Select
                      value={nomineeByOutcome[outcome.id] ?? ""}
                      onValueChange={(value) =>
                        setNomineeByOutcome((current) => ({
                          ...current,
                          [outcome.id]: value,
                        }))
                      }
                    >
                      <SelectTrigger
                        id={`nominee-${outcome.id}`}
                        data-testid={`nominee-${outcome.label}`}
                      >
                        <SelectValue placeholder="Choose a person" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((person) => (
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
            );
          })}

          {outcomes.map((outcome) => {
            const mustName = nomineesByOutcome[outcome.id] != null;
            const chosen = nomineeByOutcome[outcome.id] ?? "";
            return (
              <Button
                key={outcome.id}
                disabled={busy || (mustName && !chosen)}
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
                      chosen || null,
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
            );
          })}
        </>
      )}
    />
  );
}
