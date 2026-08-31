"use client";

import { GripVertical, PenLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { FormBuilder } from "@/components/form-builder/form-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createOutcome } from "@/lib/workflow/defaults";
import type {
  EndResult,
  FormSchema,
  OutcomeTone,
  RecipientMode,
  StageOutcome,
  WorkflowNode,
} from "@/lib/workflow/types";

export type RoleOption = { id: string; name: string };
export type TemplateOption = { id: string; name: string };

export type NodeInspectorProps = {
  node: WorkflowNode | null;
  roles: RoleOption[];
  templates: TemplateOption[];
  onChange: (nodeId: string, data: WorkflowNode["data"]) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
};

export function NodeInspector({
  node,
  roles,
  templates,
  onChange,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  const [formEditorOpen, setFormEditorOpen] = useState(false);

  if (!node) return null;

  const patch = (values: Record<string, unknown>) =>
    onChange(node.id, { ...node.data, ...values } as WorkflowNode["data"]);

  const hasForm = node.kind === "start" || node.kind === "stage";
  const form: FormSchema | null = hasForm ? node.data.form : null;
  const fieldCount =
    form?.sections.reduce(
      (total, section) => total + section.fields.length,
      0,
    ) ?? 0;

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto sm:max-w-md"
          data-testid="node-inspector"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {node.data.label}
              <Badge variant="outline">{KIND_LABEL[node.kind]}</Badge>
            </SheetTitle>
            <SheetDescription>{KIND_HINT[node.kind]}</SheetDescription>
          </SheetHeader>

          <div className="form-stack px-4 pb-4">
            <Field>
              <FieldLabel htmlFor="node-label">Label</FieldLabel>
              <Input
                id="node-label"
                value={node.data.label}
                onChange={(event) => patch({ label: event.target.value })}
                data-testid="node-label"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="node-description">
                Internal description
              </FieldLabel>
              <Textarea
                id="node-description"
                rows={2}
                value={node.data.description ?? ""}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </Field>

            {node.kind === "stage" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="node-role">Authorised role</FieldLabel>
                  <Select
                    value={node.data.roleId ?? ""}
                    onValueChange={(value) => patch({ roleId: value })}
                  >
                    <SelectTrigger id="node-role" data-testid="node-role">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Every holder of this role sees the application in their
                    queue; the first to act moves it on.
                  </FieldDescription>
                </Field>

                <OutcomesEditor
                  outcomes={node.data.outcomes}
                  onChange={(outcomes) => patch({ outcomes })}
                />
              </>
            ) : null}

            {node.kind === "email" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="node-template">Template</FieldLabel>
                  <Select
                    value={node.data.templateId ?? ""}
                    onValueChange={(value) => patch({ templateId: value })}
                  >
                    <SelectTrigger
                      id="node-template"
                      data-testid="node-template"
                    >
                      <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="node-recipient">Send to</FieldLabel>
                  <Select
                    value={node.data.recipientMode}
                    onValueChange={(value) =>
                      patch({ recipientMode: value as RecipientMode })
                    }
                  >
                    <SelectTrigger
                      id="node-recipient"
                      data-testid="node-recipient"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applicant">The applicant</SelectItem>
                      <SelectItem value="role">Everyone with a role</SelectItem>
                      <SelectItem value="custom">A fixed address</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {node.data.recipientMode === "role" ? (
                  <Field>
                    <FieldLabel htmlFor="node-recipient-role">
                      Recipient role
                    </FieldLabel>
                    <Select
                      value={node.data.recipientRoleId ?? ""}
                      onValueChange={(value) =>
                        patch({ recipientRoleId: value })
                      }
                    >
                      <SelectTrigger id="node-recipient-role">
                        <SelectValue placeholder="Choose a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                {node.data.recipientMode === "custom" ? (
                  <Field>
                    <FieldLabel htmlFor="node-recipient-email">
                      Recipient address
                    </FieldLabel>
                    <Input
                      id="node-recipient-email"
                      type="email"
                      value={node.data.recipientEmail}
                      placeholder="registrar@manipal.edu"
                      onChange={(event) =>
                        patch({ recipientEmail: event.target.value })
                      }
                    />
                  </Field>
                ) : null}

                <FieldDescription>
                  Email steps are automatic: the application passes straight
                  through to the next node after the message is dispatched.
                </FieldDescription>
              </>
            ) : null}

            {node.kind === "end" ? (
              <Field>
                <FieldLabel htmlFor="node-result">Final status</FieldLabel>
                <Select
                  value={node.data.result}
                  onValueChange={(value) =>
                    patch({ result: value as EndResult })
                  }
                >
                  <SelectTrigger id="node-result" data-testid="node-result">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="withdrawn">Withdrawn</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {hasForm ? (
              <Field>
                <FieldLabel>Form</FieldLabel>
                <FieldDescription>
                  {form!.sections.length} section
                  {form!.sections.length === 1 ? "" : "s"} · {fieldCount} field
                  {fieldCount === 1 ? "" : "s"}. Each section renders as one
                  page of the wizard.
                </FieldDescription>
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => setFormEditorOpen(true)}
                  data-testid="edit-form"
                >
                  <PenLine className="size-4" />
                  Edit form
                </Button>
              </Field>
            ) : null}
          </div>

          <SheetFooter>
            {node.kind === "start" ? (
              <p className="text-xs text-muted-foreground">
                The submission node is the entry point and cannot be deleted.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => onDelete(node.id)}
                data-testid="delete-node"
              >
                <Trash2 className="size-4" />
                Delete this node
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {hasForm ? (
        <Dialog open={formEditorOpen} onOpenChange={setFormEditorOpen}>
          <DialogContent
            className="max-h-[88vh] w-[92vw] flex-col overflow-y-auto p-6 sm:max-w-6xl"
            data-testid="form-builder-dialog"
          >
            <DialogHeader>
              <DialogTitle>
                Form for &ldquo;{node.data.label}&rdquo;
              </DialogTitle>
              <DialogDescription>
                Drag to reorder. Every section becomes its own step, and a step
                must pass validation before the user can continue.
              </DialogDescription>
            </DialogHeader>

            <FormBuilder
              value={form!}
              onChange={(next) => patch({ form: next })}
            />

            <DialogFooter>
              <Button onClick={() => setFormEditorOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

const KIND_LABEL: Record<WorkflowNode["kind"], string> = {
  start: "Submission",
  stage: "Stage",
  email: "Email",
  end: "End",
};

const KIND_HINT: Record<WorkflowNode["kind"], string> = {
  start: "The form the applicant fills in. Exactly one per workflow.",
  stage: "Halts the workflow until an authorised reviewer acts.",
  email: "Sends a templated message, then continues automatically.",
  end: "Terminates the workflow with a final status.",
};

function OutcomesEditor({
  outcomes,
  onChange,
}: {
  outcomes: StageOutcome[];
  onChange: (outcomes: StageOutcome[]) => void;
}) {
  function update(id: string, patch: Partial<StageOutcome>) {
    onChange(
      outcomes.map((outcome) =>
        outcome.id === id ? { ...outcome, ...patch } : outcome,
      ),
    );
  }

  return (
    <Field>
      <FieldLabel>Outcomes</FieldLabel>
      <FieldDescription>
        Each outcome is a button for the reviewer and its own connector on the
        canvas, so different decisions can lead to different next steps.
      </FieldDescription>

      <div className="flex flex-col gap-2">
        {outcomes.map((outcome, index) => (
          <div
            key={outcome.id}
            className="flex items-center gap-2 rounded-md border p-2"
            data-testid={`outcome-${index}`}
          >
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={outcome.label}
              placeholder="Approve"
              onChange={(event) =>
                update(outcome.id, { label: event.target.value })
              }
              aria-label={`Outcome ${index + 1} label`}
            />
            <Select
              value={outcome.tone}
              onValueChange={(value) =>
                update(outcome.id, { tone: value as OutcomeTone })
              }
            >
              <SelectTrigger
                className="w-32"
                aria-label={`Outcome ${index + 1} tone`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove outcome ${outcome.label || index + 1}`}
              onClick={() =>
                onChange(outcomes.filter((entry) => entry.id !== outcome.id))
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange([...outcomes, createOutcome("New outcome")])}
          data-testid="add-outcome"
        >
          <Plus className="size-4" />
          Add outcome
        </Button>
      </div>
    </Field>
  );
}
