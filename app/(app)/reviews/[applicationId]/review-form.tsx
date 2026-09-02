"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormWizard } from "@/components/form-runtime/form-wizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PrefillProfile } from "@/lib/workflow/autofill";
import type {
  FormSchema,
  SectionData,
  StageOutcome,
} from "@/lib/workflow/types";
import { clearStageDraft, completeStage, saveStageDraft } from "../actions";

export type Nominee = { id: string; name: string; email: string };

/**
 * What the confirmation asks.
 *
 * An outcome is admin-defined, so this reads its label rather than its tone -
 * a tone is a colour, and "Send to associate dean" is a positive step that is
 * not an approval. The two words the process almost always uses are named for
 * what they mean; anything else is quoted back as it was written.
 */
function confirmTitle(outcome: StageOutcome): string {
  const label = outcome.label.trim().toLowerCase();
  if (label === "approve") return "Confirm approval";
  if (label === "reject") return "Confirm rejection";
  return `Confirm “${outcome.label}”`;
}

export function ReviewForm({
  applicationId,
  stageLabel,
  form,
  outcomes,
  defaultValues,
  nomineesByOutcome,
  profile,
}: {
  applicationId: string;
  stageLabel: string;
  form: FormSchema;
  outcomes: StageOutcome[];
  defaultValues: SectionData | null;
  /** The reviewer's own account, for any question that draws on it. */
  profile: PrefillProfile;
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
  /** The outcome whose confirmation is open, if any. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const nominating = outcomes.filter(
    (outcome) => nomineesByOutcome[outcome.id] != null,
  );

  return (
    <FormWizard
      form={form}
      defaultValues={defaultValues}
      profile={profile}
      submitHeading="Your decision"
      submitDescription={`You are acting as ${stageLabel}. Choose the outcome that decides where this application goes next.`}
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

          <div className="outcome-bar">
            {outcomes.map((outcome) => {
              const mustName = nomineesByOutcome[outcome.id] != null;
              const chosen = nomineeByOutcome[outcome.id] ?? "";
              return (
                <AlertDialog
                  key={outcome.id}
                  open={confirming === outcome.id}
                  onOpenChange={(open) => {
                    if (!open) setConfirming(null);
                  }}
                >
                  <Button
                    size="lg"
                    className="outcome-button"
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
                      // Checked before the dialog opens: being asked to
                      // confirm and then told the form is wrong reads as the
                      // confirmation itself having failed.
                      if (outcome.requiresForm && !(await validate())) return;
                      setConfirming(outcome.id);
                    }}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {outcome.label}
                  </Button>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {confirmTitle(outcome)}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This records &ldquo;{outcome.label}&rdquo; at{" "}
                        {stageLabel} and moves the application on. It cannot be
                        undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Go back</AlertDialogCancel>
                      <AlertDialogAction
                        data-testid={`confirm-${outcome.label}`}
                        className={
                          outcome.tone === "negative"
                            ? "bg-destructive text-white hover:bg-destructive/90"
                            : undefined
                        }
                        onClick={async (event) => {
                          event.preventDefault();
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
                        {confirmTitle(outcome)}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            })}
          </div>
        </>
      )}
    />
  );
}
