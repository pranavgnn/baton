import { env } from "@/lib/env";
import { renderTemplate } from "./render";
import { sendMail, type SendMailResult } from "./transport";

/**
 * Transactional messages the portal owns itself. Everything workflow-driven
 * goes through admin-authored templates instead.
 */

function actionButton(url: string, label: string) {
  return `<p><a href="${url}" style="background-color:#173a6b;border-radius:6px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:10px 20px;text-decoration:none">${label}</a></p>`;
}

export async function sendAccountInviteEmail(params: {
  to: string;
  name: string;
  url: string;
  expiresInHours: number;
}): Promise<SendMailResult> {
  const { subject, html } = await renderTemplate({
    heading: "Account activation",
    subject: "Activate your MIT Promotion Portal account",
    bodyHtml: `
      <h2>Welcome, {{name}}</h2>
      <p>An account has been created for you on the MIT Promotion Application Portal.</p>
      <p>Set a password to activate it. This link expires in {{hours}} hours.</p>
      ${actionButton("{{url}}", "Set your password")}
      <p style="color:#6a7383;font-size:12px">If the button does not work, copy this link into your browser:<br>{{url}}</p>
      <p style="color:#6a7383;font-size:12px">If you were not expecting this email, you can safely ignore it.</p>
    `,
    variables: {
      name: params.name,
      url: params.url,
      hours: String(params.expiresInHours),
    },
  });

  return sendMail({ to: params.to, subject, html });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  url: string;
  expiresInHours: number;
}): Promise<SendMailResult> {
  const { subject, html } = await renderTemplate({
    heading: "Password reset",
    subject: "Reset your MIT Promotion Portal password",
    bodyHtml: `
      <h2>Hello {{name}}</h2>
      <p>We received a request to set a new password for your portal account.</p>
      <p>This link expires in {{hours}} hours and can be used once.</p>
      ${actionButton("{{url}}", "Choose a new password")}
      <p style="color:#6a7383;font-size:12px">If the button does not work, copy this link into your browser:<br>{{url}}</p>
      <p style="color:#6a7383;font-size:12px">If you did not request this, no action is needed - your password stays unchanged.</p>
    `,
    variables: {
      name: params.name,
      url: params.url,
      hours: String(params.expiresInHours),
    },
  });

  return sendMail({ to: params.to, subject, html });
}

export function portalUrl(path = "/"): string {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}
