import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  hydrate,
  hydrateText,
  htmlToText,
  sanitizeTemplateHtml,
} from "@/lib/mail/template";

describe("hydrate", () => {
  it("replaces placeholders with their values", () => {
    expect(
      hydrate("<p>Dear {{applicant_name}},</p>", {
        applicant_name: "Dr. Anita Rao",
      }),
    ).toBe("<p>Dear Dr. Anita Rao,</p>");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(hydrate("{{  applicant_name  }}", { applicant_name: "A" })).toBe(
      "A",
    );
  });

  it("blanks unknown placeholders rather than leaking raw braces", () => {
    expect(hydrate("Hello {{nope}}!", {})).toBe("Hello !");
  });

  it("escapes values so a name cannot inject markup", () => {
    expect(
      hydrate("<p>{{applicant_name}}</p>", {
        applicant_name: '<script>alert("x")</script>',
      }),
    ).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
  });

  it("does not escape in plain-text contexts such as the subject", () => {
    expect(
      hydrateText("Re: {{application_reference}}", {
        application_reference: "PROM-2026-0001",
      }),
    ).toBe("Re: PROM-2026-0001");
    expect(hydrateText("{{x}}", { x: "A & B" })).toBe("A & B");
  });
});

describe("escapeHtml", () => {
  it("escapes every dangerous character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("sanitizeTemplateHtml", () => {
  it("keeps the formatting tags the editor produces", () => {
    const html =
      "<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul>";
    expect(sanitizeTemplateHtml(html)).toBe(html);
  });

  it("strips script elements and their contents", () => {
    expect(
      sanitizeTemplateHtml("<p>Hi</p><script>steal()</script><p>Bye</p>"),
    ).toBe("<p>Hi</p><p>Bye</p>");
  });

  it("strips style and iframe elements", () => {
    expect(
      sanitizeTemplateHtml(
        "<style>p{}</style><iframe src='x'></iframe><p>ok</p>",
      ),
    ).toBe("<p>ok</p>");
  });

  it("removes inline event handlers", () => {
    expect(sanitizeTemplateHtml('<p onclick="steal()">Hi</p>')).toBe(
      "<p>Hi</p>",
    );
  });

  it("neutralises javascript: URLs", () => {
    expect(sanitizeTemplateHtml(`<a href="javascript:steal()">Click</a>`)).toBe(
      '<a href="#">Click</a>',
    );
  });

  it("drops tags outside the allow list but keeps their text", () => {
    expect(sanitizeTemplateHtml("<marquee>Hello</marquee>")).toBe("Hello");
  });

  it("keeps ordinary links intact", () => {
    expect(
      sanitizeTemplateHtml('<a href="https://manipal.edu">Portal</a>'),
    ).toBe('<a href="https://manipal.edu">Portal</a>');
  });
});

describe("htmlToText", () => {
  it("produces a readable plain-text alternative", () => {
    expect(htmlToText("<h2>Hello</h2><p>Line one</p><p>Line two</p>")).toBe(
      "Hello\nLine one\nLine two",
    );
  });

  it("decodes the common entities", () => {
    expect(htmlToText("<p>A &amp; B &lt;C&gt; &quot;D&quot;</p>")).toBe(
      'A & B <C> "D"',
    );
  });

  it("drops script and style content entirely", () => {
    expect(
      htmlToText(
        "<style>p{color:red}</style><p>Visible</p><script>x()</script>",
      ),
    ).toBe("Visible");
  });
});

describe("email buttons", () => {
  const button =
    '<a data-email-button="true" href="https://portal.manipal.edu/applications/1" style="background-color:#173a6b;border-radius:6px;color:#ffffff;display:inline-block;padding:10px 20px;text-decoration:none" target="_blank" rel="noreferrer">Open the portal</a>';

  it("survives sanitisation intact", () => {
    // The inline styles are the whole point: email clients ignore stylesheets.
    expect(sanitizeTemplateHtml(button)).toBe(button);
  });

  it("still has its placeholders hydrated", () => {
    const withPlaceholder = button.replace(
      "https://portal.manipal.edu/applications/1",
      "{{application_url}}",
    );
    const rendered = hydrate(sanitizeTemplateHtml(withPlaceholder), {
      application_url: "https://portal.manipal.edu/applications/42",
    });
    expect(rendered).toContain(
      'href="https://portal.manipal.edu/applications/42"',
    );
    expect(rendered).not.toContain("{{");
  });

  it("cannot smuggle a javascript: target through the button", () => {
    const hostile = button.replace(
      "https://portal.manipal.edu/applications/1",
      "javascript:steal()",
    );
    expect(sanitizeTemplateHtml(hostile)).toContain('href="#"');
  });

  it("keeps its label in the plain-text alternative", () => {
    expect(htmlToText(button)).toBe("Open the portal");
  });
});
