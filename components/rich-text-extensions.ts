import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { EmailButton } from "@/components/email-button-extension";

/**
 * The schema behind every template body.
 *
 * Kept apart from the editor component so a saved template can be parsed and
 * re-serialised in a test: an email button that survives the editor but not
 * the round trip through stored HTML is a bug only this list can prove.
 */
export function richTextExtensions() {
  return [
    StarterKit.configure({ link: false, underline: false }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    EmailButton,
  ];
}
