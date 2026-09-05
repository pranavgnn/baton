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
  RecipientScope,
  StageAssignment,
  StageOutcome,
  WorkflowNode,
} from "@/lib/workflow/types";

/**
 * The two dimensions of an assignment - whether a name is required and where
 * the names come from - are one choice to an admin, so they are offered as one
 * list and split apart again on the way into the node.
 */
const ASSIGNMENT_CHOICES = [
  {
    value: "role",
    assignment: { mode: "role", pool: "role_holders", scope: "all_holders" },
    label: "Anyone holding the role",
    description:
      "The application appears in every holder's queue and the first to act moves it on.",
  },
  {
    value: "role_in_department",
    assignment: {
      mode: "role",
      pool: "role_holders",
      scope: "applicant_department",
    },
    label: "Anyone holding the role, in the applicant's department",
    description:
      "Only holders attached to the applicant's own department - whoever signs for it, and whoever names it as theirs - see it at all.",
  },
  {
    value: "nominated",
    assignment: {
      mode: "nominated",
      pool: "role_holders",
      scope: "all_holders",
    },
    label: "One person, named by the previous reviewer",
    description:
      "Whoever routes the application here must choose a holder of this role, and it is held for them alone.",
  },
  {
    value: "nominated_deputy",
    assignment: {
      mode: "nominated",
      pool: "department_deputies",
      scope: "all_holders",
    },
    label: "One deputy of the applicant's department",
    description:
      "The candidates are the deputies of the applicant's own department who hold this role.",
  },
] as const satisfies readonly {
  value: string;
  assignment: StageAssignment;
  label: string;
  description: string;
}[];

/**
 * The three parts of an assignment - whether a name is required, where the
 * names come from, and how far the role reaches - are one choice to an admin,
 * so they are offered as one list and split apart again on the way into the
 * node.
 */
function assignmentValue(assignment: StageAssignment): string {
  const match = ASSIGNMENT_CHOICES.find(
    (choice) =>
      choice.assignment.mode === assignment.mode &&
      choice.assignment.pool === assignment.pool &&
      // Snapshots saved before scopes existed carry none, and meant the role.
      choice.assignment.scope === (assignment.scope ?? "all_holders"),
  );
  return match?.value ?? "role";
}

function parseAssignment(value: string): StageAssignment {
  const match = ASSIGNMENT_CHOICES.find((choice) => choice.value === value);
  return match
    ? { ...match.assignment }
    : { mode: "role", pool: "role_holders", scope: "all_holders" };
}

/** How far a role-addressed notification reaches. */
const RECIPIENT_SCOPE_CHOICES = [
  {
    value: "all_holders",
    label: "Everyone holding the role",
    description: "Every holder of the role is written to.",
  },
  {
    value: "applicant_department",
    label: "Only the applicant's department",
    description:
      "Only holders attached to the applicant's own department, which is what telling the head usually means.",
  },
  {
    value: "assigned_person",
    label: "Only the person it was just handed to",
    description:
      "Written only to whoever the application was named for on this step. Nothing is sent if it was not named for anybody.",
  },
] as const;

export type RoleOption = { id: string; name: string };
export type TemplateOption = { id: string; name: string };

export type NodeInspectorProps = {
  node: WorkflowNode | null;
  roles: RoleOption[];
  templates: TemplateOption[];
  /** False hides everything that would change the shape of the process. */
  canManageFlow: boolean;
  onChange: (nodeId: string, data: WorkflowNode["data"]) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
};

export function NodeInspector({
  node,
  roles,
  templates,
  canManageFlow,
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

            {node.kind === "stage" && canManageFlow ? (
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

                <Field>
                  <FieldLabel htmlFor="node-assignment">Taken by</FieldLabel>
                  <Select
                    value={assignmentValue(node.data.assignment)}
                    onValueChange={(value) =>
                      patch({ assignment: parseAssignment(value) })
                    }
                  >
                    <SelectTrigger
                      id="node-assignment"
                      data-testid="node-assignment"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNMENT_CHOICES.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {
                      ASSIGNMENT_CHOICES.find(
                        (choice) =>
                          choice.value ===
                          assignmentValue(node.data.assignment),
                      )?.description
                    }
                  </FieldDescription>
                </Field>

                <OutcomesEditor
                  outcomes={node.data.outcomes}
                  onChange={(outcomes) => patch({ outcomes })}
                />
              </>
            ) : null}

            {node.kind === "email" && canManageFlow ? (
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

                {node.data.recipientMode === "role" ? (
                  <Field>
                    <FieldLabel htmlFor="node-recipient-scope">
                      Which holders
                    </FieldLabel>
                    <Select
                      value={node.data.recipientScope ?? "all_holders"}
                      onValueChange={(value) =>
                        patch({ recipientScope: value as RecipientScope })
                      }
                    >
                      <SelectTrigger
                        id="node-recipient-scope"
                        data-testid="node-recipient-scope"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPIENT_SCOPE_CHOICES.map((choice) => (
                          <SelectItem key={choice.value} value={choice.value}>
                            {choice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {
                        RECIPIENT_SCOPE_CHOICES.find(
                          (choice) =>
                            choice.value ===
                            (node.data.recipientScope ?? "all_holders"),
                        )?.description
                      }
                    </FieldDescription>
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

            {node.kind === "end" && canManageFlow ? (
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
            {!canManageFlow ? (
              <p className="text-xs text-muted-foreground">
                Editing the questions on this step only. Its role, outcomes and
                connections need workflow permission.
              </p>
            ) : node.kind === "start" ? (
              <p className="text-xs text-muted-foreground">
                The application starts here, so this step cannot be removed.
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
  start: "The form the applicant fills in. There is exactly one.",
  stage: "The application waits here until the role responsible acts on it.",
  email: "Sends a message and lets the application carry on.",
  end: "Closes the application with a final outcome.",
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
