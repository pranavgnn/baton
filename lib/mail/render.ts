import { render } from "@react-email/render";
import { createElement } from "react";

import { EmailShell } from "./layout";
import { hydrate, hydrateText, sanitizeTemplateHtml } from "./template";
import type { TemplateVariables } from "@/lib/workflow/types";

export {
  escapeHtml,
  hydrate,
  hydrateText,
  sanitizeTemplateHtml,
} from "./template";

export type RenderTemplateInput = {
  subject: string;
  bodyHtml: string;
  variables: TemplateVariables | Record<string, string | undefined>;
  heading?: string;
};

export type RenderedEmail = { subject: string; html: string };

export async function renderTemplate({
  subject,
  bodyHtml,
  variables,
  heading,
}: RenderTemplateInput): Promise<RenderedEmail> {
  const hydratedSubject = hydrateText(subject, variables);
  const hydratedBody = hydrate(sanitizeTemplateHtml(bodyHtml), variables);

  const html = await render(
    createElement(EmailShell, {
      preview: hydratedSubject,
      heading,
      html: hydratedBody,
    }),
  );

  return { subject: hydratedSubject, html };
}
