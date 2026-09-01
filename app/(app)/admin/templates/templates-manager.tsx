"use client";

import type { Editor } from "@tiptap/react";
import { Loader2, Mail, Plus, Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { TEMPLATE_VARIABLES } from "@/lib/workflow/types";
import {
  createTemplate,
  deleteTemplate,
  sendTestEmail,
  updateTemplate,
} from "./actions";

export type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  description: string;
  bodyHtml: string;
  updatedAt: string;
};

const BLANK_BODY = "<p>Dear {{applicant_name}},</p><p></p>";

export function TemplatesManager({ templates }: { templates: TemplateRow[] }) {
  const pagination = usePagination(templates, 25);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);
  const [isDeleting, startDelete] = useTransition();

  return (
    <>
      <div className="toolbar justify-end">
        <Button onClick={() => setCreating(true)} data-testid="new-template">
          <Plus className="size-4" />
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">
          No templates yet. Create one so your email steps have something to
          send.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pagination.items.map((template) => (
            <Card key={template.id} data-testid={`template-${template.name}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="size-4" />
                  {template.name}
                </CardTitle>
                <CardDescription>
                  {template.description || template.subject}
                </CardDescription>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${template.name}`}
                    className="text-destructive"
                    onClick={() => setPendingDelete(template)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Subject: </span>
                  {template.subject}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setEditing(template)}
                >
                  Edit template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ListPagination pagination={pagination} label="templates" />

      <TemplateEditor
        key={editing?.id ?? "new"}
        open={creating || Boolean(editing)}
        template={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Templates still referenced by an email step in the workflow cannot
              be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                const target = pendingDelete;
                if (!target) return;
                startDelete(async () => {
                  const result = await deleteTemplate(target.id);
                  if (result.ok) {
                    toast.success("Template deleted.");
                    setPendingDelete(null);
                  } else {
                    toast.error(result.error);
                  }
                });
              }}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TemplateEditor({
  open,
  template,
  onOpenChange,
}: {
  open: boolean;
  template: TemplateRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? BLANK_BODY);
  const [bodyJson, setBodyJson] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();

  function handleSave() {
    setFieldErrors({});
    startSave(async () => {
      const payload = { name, subject, description, bodyHtml, bodyJson };
      const result = template
        ? await updateTemplate(template.id, payload)
        : await createTemplate(payload);

      if (result.ok) {
        toast.success(template ? "Template saved." : "Template created.");
        onOpenChange(false);
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  function handleTest() {
    startTest(async () => {
      const result = await sendTestEmail({ subject, bodyHtml });
      if (result.ok) toast.success("Test email sent to your inbox.");
      else toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit template" : "New email template"}
          </DialogTitle>
          <DialogDescription>
            Insert placeholders like{" "}
            <code className="template-var">{"{{applicant_name}}"}</code>{" "}
            anywhere in the subject or body - they are replaced with real values
            when the email is sent.
          </DialogDescription>
        </DialogHeader>

        <div className="form-stack">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(fieldErrors.name)}>
              <FieldLabel htmlFor="template-name">Template name</FieldLabel>
              <Input
                id="template-name"
                value={name}
                placeholder="Application Received"
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              <FieldError errors={[{ message: fieldErrors.name }]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="template-description">
                Internal note
              </FieldLabel>
              <Input
                id="template-description"
                value={description}
                placeholder="When this template is used"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>

          <Field data-invalid={Boolean(fieldErrors.subject)}>
            <FieldLabel htmlFor="template-subject">Subject line</FieldLabel>
            <Input
              id="template-subject"
              value={subject}
              placeholder="Application {{application_reference}} received"
              onChange={(event) => setSubject(event.target.value)}
              aria-invalid={Boolean(fieldErrors.subject)}
            />
            <FieldError errors={[{ message: fieldErrors.subject }]} />
          </Field>

          <Field data-invalid={Boolean(fieldErrors.bodyHtml)}>
            <FieldLabel>Message body</FieldLabel>
            <RichTextEditor
              value={bodyHtml}
              onChange={(html, json) => {
                setBodyHtml(html);
                setBodyJson(json);
              }}
              toolbarExtras={(editor) => (
                <VariablePalette editor={editor} onInsertSubject={setSubject} />
              )}
            />
            <FieldError errors={[{ message: fieldErrors.bodyHtml }]} />
            <FieldDescription>
              The body is wrapped in the portal&apos;s branded responsive email
              shell before sending.
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !subject}
          >
            {isTesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send test to me
          </Button>
          <div className="toolbar">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              data-testid="save-template"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              {template ? "Save changes" : "Create template"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariablePalette({
  editor,
  onInsertSubject,
}: {
  editor: Editor;
  onInsertSubject: (updater: (current: string) => string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-x border-b bg-muted/30 p-2">
      <span className="mr-1 text-xs text-muted-foreground">Insert:</span>
      {TEMPLATE_VARIABLES.map((variable) => (
        <Button
          key={variable.key}
          type="button"
          variant="ghost"
          size="sm"
          title={variable.description}
          className="h-7 px-2"
          onClick={() =>
            editor.chain().focus().insertContent(`{{${variable.key}}}`).run()
          }
        >
          <span className="template-var">{`{{${variable.key}}}`}</span>
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() =>
          onInsertSubject(
            (current) =>
              `${current}${current ? " " : ""}{{application_reference}}`,
          )
        }
      >
        Add reference to subject
      </Button>
    </div>
  );
}
