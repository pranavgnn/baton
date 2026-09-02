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
  applyCalculations,
  applyPrefill,
  type PrefillProfile,
} from "@/lib/workflow/autofill";
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
  /**
   * Persists partially-filled data. Called on step change and on a timer.
   * Omit in `preview`, where there is nothing to persist.
   */
  onSaveDraft?: (data: SectionData) => Promise<WizardActionResult>;
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
  /**
   * The account values behind any prefilled question. Applied to what the
   * wizard starts from, and again on the server, so what is shown read-only is
   * also what is stored.
   */
  profile?: PrefillProfile | null;
  /**
   * A rehearsal rather than a form: the builder showing an admin what they
   * have written.
   *
   * Nothing is saved, nothing is cleared, and every step is reachable without
   * answering anything - an admin checking the wording of section G should not
   * have to fill in sections A to F to see it. The validation itself is not
   * turned off; it simply stops being a gate.
   */
  preview?: boolean;
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
  profile,
  preview = false,
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
    () =>
      applyCalculations(
        form,
        applyPrefill(form, buildDefaultValues(form, defaultValues), profile),
      ),
    [form, defaultValues, profile],
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
      if (disabled || !onSaveDraft) return true;
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
    if (disabled || !onSaveDraft) return;
    const timer = setInterval(() => {
      const snapshot = JSON.stringify(getValues());
      if (snapshot === lastPersisted.current) return;
      lastPersisted.current = snapshot;
      void saveDraft({ silent: true });
    }, AUTOSAVE_DELAY_MS);
    return () => clearInterval(timer);
  }, [saveDraft, getValues, disabled, onSaveDraft]);

  /* -- Navigation --------------------------------------------------------- */

  const currentSection = sections[step];

  /** Validates the step being left; false means stay put. */
  async function leaveCurrentStep(): Promise<boolean> {
    // In a preview the steps are pages to look at, not a form to get through.
    if (preview) return true;
    if (!currentSection) return true;
    const keys = valueFields(currentSection).map((field) => field.key);
    const valid = await trigger(keys, { shouldFocus: true });
    if (!valid) {
      toast.error("Fix the highlighted fields before continuing.");
      return false;
    }
    await saveDraft({ silent: true });
    return true;
  }

  function moveTo(target: number) {
    setStep(target);
    setFurthest((current) => Math.max(current, target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function goNext() {
    if (!(await leaveCurrentStep())) return;
    moveTo(Math.min(step + 1, previewStep));
  }

  function goBack() {
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function jumpTo(target: number) {
    if (target === step) return;
    // Going back never loses work; going forward has to pass validation first.
    if (target > step && !(await leaveCurrentStep())) return;
    moveTo(target);
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
      // Cleared back to what the account can answer, not to nothing.
      const blank = applyCalculations(
        form,
        applyPrefill(form, buildDefaultValues(form, null), profile),
      );
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

  const heading = step < previewStep ? currentSection?.title : submitHeading;
  const description =
    step < previewStep ? currentSection?.description : submitDescription;

  return (
    <div className={cn("wizard", previewStep === 0 && "wizard-railless")}>
      {/* The rail is the whole map of the form: sixteen sections is too many
          to read as a row of chips, and an applicant needs to see where they
          are in it without counting. A step whose form asks nothing - a hand-
          over, say - has no map to draw, so it is not given one. */}
      <nav
        className="wizard-rail"
        aria-label="Form progress"
        hidden={previewStep === 0}
      >
        <div className="wizard-rail-header">
          <p className="wizard-rail-count">
            Step {Math.min(step + 1, previewStep + 1)} of {previewStep + 1}
          </p>
          <div
            className="wizard-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={previewStep + 1}
            aria-valuenow={step + 1}
          >
            <div
              className="wizard-progress-bar"
              style={{ width: `${((step + 1) / (previewStep + 1)) * 100}%` }}
            />
          </div>
        </div>

        <ol className="wizard-steps">
          {sections.map((section, index) => {
            const done = index < furthest && index !== step;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => void jumpTo(index)}
                  disabled={
                    disabled || (!preview && index > furthest && index > step)
                  }
                  aria-current={index === step ? "step" : undefined}
                  data-testid={`wizard-step-${index}`}
                  className={cn(
                    "wizard-step",
                    index === step && "wizard-step-active",
                    done && "wizard-step-done",
                  )}
                >
                  <span className="wizard-step-marker">
                    {done ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span className="wizard-step-title">{section.title}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => void jumpTo(previewStep)}
              disabled={disabled || (!preview && previewStep > furthest)}
              aria-current={step === previewStep ? "step" : undefined}
              data-testid="wizard-step-preview"
              className={cn(
                "wizard-step",
                step === previewStep && "wizard-step-active",
              )}
            >
              <span className="wizard-step-marker">
                <Check className="size-3" />
              </span>
              <span className="wizard-step-title">Review and submit</span>
            </button>
          </li>
        </ol>

        {lastSavedAt && !preview ? (
          <p className="wizard-saved" data-testid="wizard-last-saved">
            Draft saved at {lastSavedAt.toLocaleTimeString()}. You can close
            this page and resume later.
          </p>
        ) : null}
      </nav>

      <div className="wizard-panel">
        <header className="wizard-heading">
          <h2 className="wizard-heading-title">{heading}</h2>
          {description ? <p className="page-subtitle">{description}</p> : null}
        </header>

        {step < previewStep && currentSection ? (
          <div className="field-grid">
            {currentSection.fields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                control={control}
                disabled={disabled}
                profile={profile}
              />
            ))}
          </div>
        ) : (
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
        )}

        <div className={cn("wizard-actions", preview && "wizard-actions-bare")}>
          <div className="toolbar">
            {previewStep > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={step === 0 || busy}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : null}
            {step < previewStep ? (
              <Button
                type="button"
                onClick={() => void goNext()}
                disabled={disabled}
                data-testid="wizard-next"
              >
                {step === previewStep - 1 ? "Review" : "Next"}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              renderSubmitActions({
                getValues: () => getValues() as SectionData,
                validate: validateAll,
                busy,
                setBusy,
              })
            )}
          </div>

          {step < previewStep && !preview ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
