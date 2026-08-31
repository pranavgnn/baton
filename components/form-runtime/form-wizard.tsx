"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, type FieldValues } from "react-hook-form";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildDefaultValues, valueFields } from "@/lib/workflow/form";
import { buildFormZodSchema } from "@/lib/workflow/form";
import type { FormSchema, SectionData } from "@/lib/workflow/types";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "./field-renderer";
import { FormPreview } from "./form-preview";

const AUTOSAVE_DELAY_MS = 2000;

export type WizardActionResult = { ok: boolean; error?: string };

export type FormWizardProps = {
  form: FormSchema;
  defaultValues: SectionData | null | undefined;
  /** Persists partially-filled data. Called on step change and on a timer. */
  onSaveDraft: (data: SectionData) => Promise<WizardActionResult>;
  /** Wipes the draft and resets every field. Omit to hide the action. */
  onClear?: () => Promise<WizardActionResult>;
  /**
   * Rendered on the final preview step. Receives the validated payload getter
   * so callers can attach their own submit or per-outcome buttons.
   */
  renderSubmitActions: (args: {
    getValues: () => SectionData;
    validate: () => Promise<boolean>;
    busy: boolean;
    setBusy: (busy: boolean) => void;
  }) => React.ReactNode;
  submitHeading?: string;
  submitDescription?: string;
  disabled?: boolean;
};

export function FormWizard({
  form,
  defaultValues,
  onSaveDraft,
  onClear,
  renderSubmitActions,
  submitHeading = "Review before submitting",
  submitDescription = "Check every answer. Once submitted the application moves to the next stage and can no longer be edited.",
  disabled,
}: FormWizardProps) {
  const sections = form.sections;
  const previewStep = sections.length;

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [savingDraft, setSavingDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const resolver = useMemo(() => zodResolver(buildFormZodSchema(form)), [form]);
  const initialValues = useMemo(
    () => buildDefaultValues(form, defaultValues),
    [form, defaultValues],
  );

  const methods = useForm<FieldValues>({
    resolver,
    defaultValues: initialValues,
    mode: "onTouched",
  });

  const { control, getValues, trigger, reset, formState } = methods;

  // useWatch keeps the preview live without the memoisation hazards of watch().
  const liveValues = useWatch({ control }) as SectionData;

  /* -- Draft persistence -------------------------------------------------- */

  /**
   * Snapshot of the last payload written to the server. Autosave compares
   * against it instead of tracking a dirty flag, so the timer never writes an
   * unchanged document.
   */
  const lastPersisted = useRef(JSON.stringify(initialValues));
  const markPersisted = useCallback((values: SectionData) => {
    lastPersisted.current = JSON.stringify(values);
  }, []);

  const saveDraft = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (disabled) return true;
      setSavingDraft(true);
      try {
        const values = getValues() as SectionData;
        const result = await onSaveDraft(values);
        if (result.ok) {
          markPersisted(values);
          setLastSavedAt(new Date());
          if (!options.silent) toast.success("Draft saved.");
          return true;
        }
        toast.error(result.error ?? "The draft could not be saved.");
        return false;
      } finally {
        setSavingDraft(false);
      }
    },
    [disabled, getValues, markPersisted, onSaveDraft],
  );

  // Background autosave so a closed browser never loses work.
  useEffect(() => {
    if (disabled) return;
    const timer = setInterval(() => {
      const snapshot = JSON.stringify(getValues());
      if (snapshot === lastPersisted.current) return;
      lastPersisted.current = snapshot;
      void saveDraft({ silent: true });
    }, AUTOSAVE_DELAY_MS);
    return () => clearInterval(timer);
  }, [saveDraft, getValues, disabled]);

  /* -- Navigation --------------------------------------------------------- */

  const currentSection = sections[step];

  async function goNext() {
    if (currentSection) {
      const keys = valueFields(currentSection).map((field) => field.key);
      const valid = await trigger(keys, { shouldFocus: true });
      if (!valid) {
        toast.error("Fix the highlighted fields before continuing.");
        return;
      }
    }

    await saveDraft({ silent: true });
    const next = Math.min(step + 1, previewStep);
    setStep(next);
    setFurthest((current) => Math.max(current, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function jumpTo(target: number) {
    if (target === step) return;
    if (target > step) {
      // Forward jumps still have to pass the current step's validation.
      await goNext();
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function validateAll() {
    const valid = await trigger(undefined, { shouldFocus: true });
    if (!valid) {
      const firstBadSection = sections.findIndex((section) =>
        valueFields(section).some((field) => formState.errors[field.key]),
      );
      if (firstBadSection >= 0) setStep(firstBadSection);
      toast.error("Some answers still need attention.");
    }
    return valid;
  }

  async function handleClear() {
    if (!onClear) return;
    const result = await onClear();
    if (result.ok) {
      const blank = buildDefaultValues(form, null);
      markPersisted(blank);
      reset(blank);
      setStep(0);
      setFurthest(0);
      setLastSavedAt(null);
      toast.success("Form cleared.");
    } else {
      toast.error(result.error ?? "The form could not be cleared.");
    }
  }

  /* -- Render ------------------------------------------------------------- */

  return (
    <div className="section-stack">
      <ol className="wizard-steps" aria-label="Form progress">
        {sections.map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => void jumpTo(index)}
              disabled={disabled || (index > furthest && index > step)}
              aria-current={index === step ? "step" : undefined}
              data-testid={`wizard-step-${index}`}
              className={cn(
                "wizard-step",
                index === step && "wizard-step-active",
                index < step && "wizard-step-done",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span>{index + 1}</span>
              {section.title}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => void jumpTo(previewStep)}
            disabled={disabled || previewStep > furthest}
            aria-current={step === previewStep ? "step" : undefined}
            data-testid="wizard-step-preview"
            className={cn(
              "wizard-step",
              step === previewStep && "wizard-step-active",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <Check className="size-3" />
            Preview
          </button>
        </li>
      </ol>

      {step < previewStep && currentSection ? (
        <Card>
          <CardHeader>
            <CardTitle>{currentSection.title}</CardTitle>
            {currentSection.description ? (
              <CardDescription>{currentSection.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-2">
              {currentSection.fields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  control={control}
                  disabled={disabled}
                />
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <div className="toolbar">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={step === 0}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void goNext()}
                disabled={disabled}
                data-testid="wizard-next"
              >
                {step === previewStep - 1 ? "Review" : "Next"}
                <ArrowRight className="size-4" />
              </Button>
            </div>

            <div className="toolbar">
              {onClear ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive"
                      disabled={disabled}
                      data-testid="wizard-clear"
                    >
                      <Trash2 className="size-4" />
                      Clear form
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Clear everything you have entered?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Your saved draft is wiped and every field returns to
                        blank. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(event) => {
                          event.preventDefault();
                          void handleClear();
                        }}
                      >
                        Clear form
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => void saveDraft()}
                disabled={disabled || savingDraft}
                data-testid="wizard-save-draft"
              >
                {savingDraft ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save draft
              </Button>
            </div>
          </CardFooter>
        </Card>
      ) : (
        <div className="section-stack">
          <Card>
            <CardHeader>
              <CardTitle>{submitHeading}</CardTitle>
              <CardDescription>{submitDescription}</CardDescription>
            </CardHeader>
          </Card>

          <FormPreview
            form={form}
            data={liveValues}
            renderSectionAction={(index) => (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(index)}
                data-testid={`preview-edit-${index}`}
              >
                Edit
              </Button>
            )}
          />

          <Card>
            <CardFooter className="flex-wrap justify-between gap-3 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={busy}
              >
                <ArrowLeft className="size-4" />
                Back to last section
              </Button>
              <div className="toolbar">
                {renderSubmitActions({
                  getValues: () => getValues() as SectionData,
                  validate: validateAll,
                  busy,
                  setBusy,
                })}
              </div>
            </CardFooter>
          </Card>
        </div>
      )}

      {lastSavedAt ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="wizard-last-saved"
        >
          Draft saved at {lastSavedAt.toLocaleTimeString()}. You can close this
          page and resume later.
        </p>
      ) : null}
    </div>
  );
}
