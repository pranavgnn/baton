import { mergeAttributes, Node } from "@tiptap/core";

/**
 * A call-to-action button for email templates.
 *
 * Rendered as a plain anchor carrying inline styles, because email clients
 * ignore stylesheets - the same reason `lib/mail/` uses literal colours. It is
 * an atomic block so it behaves like one object in the editor rather than text
 * that happens to be styled.
 */

export const EMAIL_BUTTON_TAG = "a";
export const EMAIL_BUTTON_MARKER = "data-email-button";

/** Mirrors the brand colours in `lib/mail/layout.tsx`. */
const BUTTON_STYLE = [
  "background-color:#173a6b",
  "border-radius:6px",
  "color:#ffffff",
  "display:inline-block",
  "font-size:14px",
  "font-weight:600",
  "padding:10px 20px",
  "text-decoration:none",
].join(";");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailButton: {
      setEmailButton: (attributes: {
        href: string;
        label: string;
      }) => ReturnType;
    };
  }
}

export const EmailButton = Node.create({
  name: "emailButton",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: {
        default: "#",
        parseHTML: (element) => element.getAttribute("href") ?? "#",
        renderHTML: (attributes) => ({ href: attributes.href as string }),
      },
      label: {
        default: "Open the portal",
        parseHTML: (element) => element.textContent ?? "",
        // The label is the anchor's text, not an attribute.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `${EMAIL_BUTTON_TAG}[${EMAIL_BUTTON_MARKER}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      EMAIL_BUTTON_TAG,
      mergeAttributes(HTMLAttributes, {
        [EMAIL_BUTTON_MARKER]: "true",
        style: BUTTON_STYLE,
        target: "_blank",
        rel: "noreferrer",
      }),
      (node.attrs.label as string) || "Open the portal",
    ];
  },

  addCommands() {
    return {
      setEmailButton:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
    };
  },
});
