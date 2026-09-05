"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";

import { richTextExtensions } from "@/components/rich-text-extensions";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  SquareMousePointer,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useState, type ComponentType } from "react";

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
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string, json: unknown) => void;
  placeholder?: string;
  /** Rendered under the toolbar, used for the template variable palette. */
  toolbarExtras?: (editor: Editor) => React.ReactNode;
};

export function RichTextEditor({
  value,
  onChange,
  toolbarExtras,
}: RichTextEditorProps) {
  const editor = useEditor({
    // Tiptap renders on the client only; SSR would mismatch on hydration.
    immediatelyRender: false,
    extensions: richTextExtensions(),
    content: value,
    editorProps: {
      attributes: {
        class: "prose-email focus:outline-none",
        "data-testid": "rich-text-body",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML(), instance.getJSON());
    },
  });

  /**
   * Link and button targets are typed into a dialog rather than a
   * `window.prompt`: the address is arbitrary - any page, any host, a
   * `mailto:` - and a prompt gives no room to say so, no validation and no
   * keyboard handling.
   */
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);

  function openLinkDialog() {
    if (!editor) return;
    setLinkDialog({
      kind: "link",
      href: (editor.getAttributes("link").href as string) ?? "",
      label: "",
    });
  }

  function openButtonDialog() {
    setLinkDialog({ kind: "button", href: "", label: "Open the portal" });
  }

  function applyLinkDialog(state: LinkDialogState) {
    if (!editor) return;
    const href = state.href.trim();

    if (state.kind === "button") {
      editor
        .chain()
        .focus()
        .setEmailButton({ href, label: state.label.trim() || "Open" })
        .run();
    } else if (href === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }

    setLinkDialog(null);
  }

  if (!editor) {
    return <div className="rich-text-editor" aria-busy="true" />;
  }

  return (
    <div>
      <div className="rich-text-toolbar" role="toolbar" aria-label="Formatting">
        <ToolbarToggle
          editor={editor}
          icon={Bold}
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={Italic}
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={UnderlineIcon}
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={Strikethrough}
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarToggle
          editor={editor}
          icon={Heading1}
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <ToolbarToggle
          editor={editor}
          icon={Heading2}
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarToggle
          editor={editor}
          icon={Heading3}
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarToggle
          editor={editor}
          icon={List}
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={ListOrdered}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={Quote}
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={Code}
          label="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarToggle
          editor={editor}
          icon={AlignLeft}
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={AlignCenter}
          label="Align centre"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarToggle
          editor={editor}
          icon={AlignRight}
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarToggle
          editor={editor}
          icon={Link2}
          label="Add link"
          active={editor.isActive("link")}
          onClick={openLinkDialog}
        />
        <ToolbarButton
          icon={Link2Off}
          label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
        <ToolbarButton
          icon={SquareMousePointer}
          label="Insert button"
          onClick={openButtonDialog}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarButton
          icon={Undo2}
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={Redo2}
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>

      {toolbarExtras ? toolbarExtras(editor) : null}

      <EditorContent editor={editor} className="rich-text-editor" />

      <LinkDialog
        state={linkDialog}
        onCancel={() => setLinkDialog(null)}
        onApply={applyLinkDialog}
      />
    </div>
  );
}

type LinkDialogState = {
  kind: "link" | "button";
  href: string;
  label: string;
};

function LinkDialog({
  state,
  onCancel,
  onApply,
}: {
  state: LinkDialogState | null;
  onCancel: () => void;
  onApply: (state: LinkDialogState) => void;
}) {
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onCancel()}>
      {/* Keyed on the kind so each opening starts from its own draft. */}
      {state ? (
        <LinkDialogBody
          key={state.kind}
          initial={state}
          onCancel={onCancel}
          onApply={onApply}
        />
      ) : null}
    </Dialog>
  );
}

function LinkDialogBody({
  initial,
  onCancel,
  onApply,
}: {
  initial: LinkDialogState;
  onCancel: () => void;
  onApply: (state: LinkDialogState) => void;
}) {
  const [href, setHref] = useState(initial.href);
  const [label, setLabel] = useState(initial.label);

  const isButton = initial.kind === "button";
  const apply = () => onApply({ kind: initial.kind, href, label });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isButton ? "Insert a button" : "Add a link"}</DialogTitle>
        <DialogDescription>
          Any address will do - a page of this portal, an intranet form, a
          public site, or a <code>mailto:</code> address.
        </DialogDescription>
      </DialogHeader>

      <div className="form-stack">
        {isButton ? (
          <Field>
            <FieldLabel htmlFor="link-label">Button text</FieldLabel>
            <Input
              id="link-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              data-testid="link-label"
            />
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="link-href">Address</FieldLabel>
          <Input
            id="link-href"
            value={href}
            placeholder="https://example.org/applications"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }}
            data-testid="link-href"
          />
          <FieldDescription>
            {isButton
              ? "A placeholder such as {{application_url}} works here too, and resolves per application."
              : "Leave it empty to remove the link from the selected text."}
          </FieldDescription>
        </Field>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={apply} data-testid="link-apply">
          {isButton ? "Insert button" : "Save link"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ToolbarToggle({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  editor: Editor;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={active}
          onPressedChange={onClick}
          aria-label={label}
        >
          <Icon className="size-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
