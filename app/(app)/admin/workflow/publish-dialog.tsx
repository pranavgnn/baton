"use client";

import { Loader2, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Version number this publish will create. */
  nextVersion: number;
  busy: boolean;
  onConfirm: (memo: string) => void;
};

/**
 * Asks for an optional note before publishing. The note is what makes the
 * version history readable months later, so it is offered every time - but
 * never required, because forcing one just produces "update".
 */
export function PublishDialog({
  open,
  onOpenChange,
  nextVersion,
  busy,
  onConfirm,
}: PublishDialogProps) {
  const [memo, setMemo] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMemo("");
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="publish-dialog">
        <DialogHeader>
          <DialogTitle>Publish version {nextVersion}</DialogTitle>
          <DialogDescription>
            New applications will start on this workflow. Anything already in
            flight keeps the version it started on.
          </DialogDescription>
        </DialogHeader>

        <div className="form-stack">
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="publish-memo">
              What changed? (optional)
            </FieldLabel>
            <Textarea
              id="publish-memo"
              rows={3}
              value={memo}
              placeholder="Added the Registrar sign-off stage before the Head."
              onChange={(event) => setMemo(event.target.value)}
              data-testid="publish-memo"
            />
            <FieldDescription>
              Shown beside this version in the history.
            </FieldDescription>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(memo.trim())}
            disabled={busy}
            data-testid="confirm-publish"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Publish version {nextVersion}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
