import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/lib/env";
import { htmlToText } from "./template";

const globalForMail = globalThis as unknown as { __mailer?: Transporter };

function createTransport(): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // Mailpit accepts anonymous SMTP; real relays need credentials.
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    tls: { rejectUnauthorized: env.NODE_ENV === "production" },
  });
}

export function mailer(): Transporter {
  if (!globalForMail.__mailer) {
    globalForMail.__mailer = createTransport();
  }
  return globalForMail.__mailer;
}

export { htmlToText } from "./template";

export type SendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendMailResult =
  { ok: true; messageId: string } | { ok: false; error: string };

/**
 * Never throws: a failing mail server must not roll back a workflow
 * transition. Failures surface in the application timeline instead.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  try {
    const info = await mailer().sendMail({
      from: env.MAIL_FROM,
      to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
    });
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mail] delivery failed:", message);
    return { ok: false, error: message };
  }
}
