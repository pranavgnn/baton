// @vitest-environment jsdom
import { generateHTML, generateJSON } from "@tiptap/html";
import { describe, expect, it } from "vitest";

import { richTextExtensions } from "@/components/rich-text-extensions";
import { EMAIL_BUTTON_MARKER } from "@/components/email-button-extension";

/**
 * A template body is stored as HTML and parsed again the next time an admin
 * opens it. Anything that does not survive that round trip is silently lost.
 */

const extensions = richTextExtensions();

function roundTrip(html: string): string {
  return generateHTML(generateJSON(html, extensions), extensions);
}

const BUTTON =
  '<a href="{{application_url}}" data-email-button="true" target="_blank"' +
  ' rel="noreferrer" style="background-color: rgb(23, 58, 107);' +
  " border-radius: 6px; color: rgb(255, 255, 255); display: inline-block;" +
  " font-size: 14px; font-weight: 600; padding: 10px 20px;" +
  ' text-decoration: none;">Open your application</a>';

describe("template body round trip", () => {
  it("keeps an email button a button", () => {
    const result = roundTrip(`<p>Dear {{applicant_name}},</p>${BUTTON}`);

    // The Link mark also claims <a href>. If it wins, the marker is gone and
    // the button comes back as ordinary underlined text.
    expect(result).toContain(EMAIL_BUTTON_MARKER);
    expect(result).toContain("Open your application");
    expect(result).not.toContain("<strong>Open your application</strong>");
  });

  it("keeps the destination, including a placeholder", () => {
    expect(roundTrip(BUTTON)).toContain('href="{{application_url}}"');
  });

  it("still treats an ordinary anchor as a link", () => {
    const result = roundTrip('<p><a href="https://manipal.edu">Portal</a></p>');

    expect(result).toContain('href="https://manipal.edu"');
    expect(result).not.toContain(EMAIL_BUTTON_MARKER);
  });

  it("preserves the formatting an admin applies to the body", () => {
    const result = roundTrip(
      "<p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul>",
    );

    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<em>italic</em>");
    expect(result).toContain("<li>");
  });

  it("leaves placeholders in the text untouched", () => {
    expect(roundTrip("<p>Dear {{applicant_name}},</p>")).toContain(
      "{{applicant_name}}",
    );
  });
});
