import path from "node:path";

import { expect, type Page } from "@playwright/test";

/** One account per role in the seeded process, plus the Super Admin. */
export const ACCOUNTS = {
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL ?? "superadmin@manipal.edu",
    password: process.env.SUPER_ADMIN_PASSWORD ?? "SuperAdmin@123",
  },
  employee: { email: "employee@manipal.edu", password: "Portal@123" },
  hod: { email: "hod@manipal.edu", password: "Portal@123" },
  hr: { email: "hr@manipal.edu", password: "Portal@123" },
  rc: { email: "rc@manipal.edu", password: "Portal@123" },
  fdw: { email: "fdw@manipal.edu", password: "Portal@123" },
  director: { email: "director@manipal.edu", password: "Portal@123" },
  instituteHr: { email: "institutehr@manipal.edu", password: "Portal@123" },
} as const;

export type AccountName = keyof typeof ACCOUNTS;

/** Where `auth.setup.ts` parks each role's signed-in session. */
export function storageStatePath(account: AccountName): string {
  return path.join(
    __dirname,
    "..",
    "..",
    "playwright",
    ".auth",
    `${account}.json`,
  );
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

/* -------------------------------------------------------------------------- */
/*  Mailpit                                                                    */
/* -------------------------------------------------------------------------- */

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

export type MailMessage = { ID: string; Subject: string; To: string[] };

export async function latestMessages(limit = 25): Promise<MailMessage[]> {
  const response = await fetch(`${MAILPIT}/api/v1/messages?limit=${limit}`);
  if (!response.ok) return [];
  const body = (await response.json()) as {
    messages: { ID: string; Subject: string; To: { Address: string }[] }[];
  };
  return body.messages.map((message) => ({
    ID: message.ID,
    Subject: message.Subject,
    To: message.To.map((to) => to.Address),
  }));
}

export async function clearMailbox() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" }).catch(
    () => undefined,
  );
}

/** Polls until a matching message arrives, then reports what was seen if not. */
export async function waitForEmail(
  match: (message: MailMessage) => boolean,
  timeoutMs = 20_000,
): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  let seen: MailMessage[] = [];
  while (Date.now() < deadline) {
    seen = await latestMessages();
    const found = seen.find(match);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `No matching email arrived within ${timeoutMs}ms. Mailbox held:\n${
      seen.map((m) => `  - ${m.To.join(",")} | ${m.Subject}`).join("\n") ||
      "  (empty)"
    }`,
  );
}

/* -------------------------------------------------------------------------- */
/*  UI helpers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Picks an option from a Radix select. The trigger is a button with a
 * combobox role rather than a native <select>, so getByLabel does not apply.
 */
export async function selectOption(
  page: Page,
  triggerLabel: string,
  optionLabel: string,
) {
  await page.getByRole("combobox", { name: triggerLabel, exact: true }).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/**
 * Radix sheets and dialogs render a modal overlay that swallows clicks aimed at
 * the page behind them, so tests have to close them before touching the canvas.
 */
export async function closeOverlays(page: Page) {
  for (let i = 0; i < 3; i += 1) {
    const open = await page
      .locator('[data-state="open"][role="dialog"]')
      .count();
    if (open === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

/**
 * Asserts a Sonner toast. Scoped to the toaster because success copy often
 * repeats text that also appears in the page behind it (a timeline entry, a
 * page subtitle), which would otherwise trip strict mode.
 */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: text }).first(),
  ).toBeVisible();
}
