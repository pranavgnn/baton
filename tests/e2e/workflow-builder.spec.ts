import { expect, test, type Page } from "@playwright/test";

import { closeOverlays, expectToast, storageStatePath } from "./helpers";

test.use({ storageState: storageStatePath("superAdmin") });

async function openBuilder(page: Page) {
  await page.goto("/admin/workflow");
  await expect(
    page.getByRole("heading", { name: "Workflow builder" }),
  ).toBeVisible();
  // fitView has to settle before nodes are measurable.
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
}

/**
 * The seeded process: one submission, seven review stages, three endings and
 * the notifications that ride alongside each hand-off. Declared here so a
 * change to the seeded workflow fails in one obvious place.
 */
const NODE_COUNT = 33;
const EDGE_COUNT = 38;

const nodes = (page: Page) => page.locator(".react-flow__node");
const edges = (page: Page) => page.locator(".react-flow__edge");

/** Restores the published graph so each test starts from a known canvas. */
async function revert(page: Page) {
  // Sheets and dialogs render a modal overlay that would swallow the click.
  await closeOverlays(page);
  await page.getByTestId("revert-workflow").click();
  await expectToast(page, "Draft reset to the published version.");
}

test.describe("workflow builder canvas", () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page);
  });

  test.afterEach(async ({ page }) => {
    await revert(page);
  });

  test("renders the published graph with every node and connection", async ({
    page,
  }) => {
    await expect(nodes(page)).toHaveCount(NODE_COUNT);
    // Every hand-off carries a continuation plus its parallel notifications.
    await expect(edges(page)).toHaveCount(EDGE_COUNT);

    await expect(page.getByTestId("node-start")).toBeVisible();
    for (const stage of [
      "Dean Recommendation",
      "Associate Dean Review",
      "HR Initial Review",
      "R&C Research Evaluation",
      "FD&W Formal Evaluation",
      "HR Final Eligibility Declaration",
      "Director Review",
    ]) {
      await expect(page.getByTestId(`node-stage-${stage}`)).toBeVisible();
    }

    await expect(page.getByTestId("node-end-Approved")).toBeVisible();
    await expect(page.getByTestId("node-end-Closed - Rejected")).toBeVisible();
    await expect(
      page.getByTestId("node-end-Closed - Not Eligible"),
    ).toBeVisible();
  });

  test("labels each outcome edge so branching is readable", async ({
    page,
  }) => {
    for (const label of [
      "Send to associate dean",
      "Forward to HR",
      "Forward to R&C",
      "Forward to FD&W",
      "Eligible",
      "Not eligible",
      "Approve",
      "Reject",
    ]) {
      await expect(
        page.locator(".react-flow__edge-text", { hasText: label }).first(),
      ).toBeVisible();
    }
  });

  test("reports the published workflow as valid and publishable", async ({
    page,
  }) => {
    await expect(page.getByText("No problems found")).toBeVisible();
    await expect(page.getByTestId("publish-workflow")).toBeEnabled();
  });

  test("opens an inspector when a node is selected", async ({ page }) => {
    await page.getByTestId("node-stage-Director Review").click();

    const inspector = page.getByTestId("node-inspector");
    await expect(inspector).toBeVisible();
    await expect(page.getByTestId("node-label")).toHaveValue("Director Review");
    await expect(page.getByTestId("node-role")).toContainText("Director");
    await expect(page.getByTestId("outcome-0")).toBeVisible();
    await expect(page.getByTestId("outcome-1")).toBeVisible();
  });

  test("renaming a node updates the canvas immediately", async ({ page }) => {
    await page.getByTestId("node-stage-Director Review").click();
    await page.getByTestId("node-label").fill("Director & Registrar Review");
    await closeOverlays(page);
    await expect(
      page.getByTestId("node-stage-Director & Registrar Review"),
    ).toBeVisible();
  });

  test("adding an outcome adds a connector and flags it as unwired", async ({
    page,
  }) => {
    await page.getByTestId("node-stage-Director Review").click();
    await page.getByTestId("add-outcome").click();
    await page
      .getByRole("textbox", { name: "Outcome 4 label" })
      .fill("Defer to next cycle");
    await closeOverlays(page);

    await expect(page.getByTestId("issue-list")).toContainText(
      'Outcome "Defer to next cycle" on "Director Review" goes nowhere.',
    );
    await expect(page.getByTestId("publish-workflow")).toBeDisabled();
  });

  test("a new stage blocks publishing until it has a role", async ({
    page,
  }) => {
    await page.getByTestId("add-stage-node").click();
    await expect(page.getByTestId("node-inspector")).toBeVisible();
    await expect(nodes(page)).toHaveCount(NODE_COUNT + 1);

    await closeOverlays(page);
    await expect(page.getByTestId("issue-list")).toContainText(
      '"New Review Stage" has no role assigned.',
    );
    await expect(page.getByTestId("publish-workflow")).toBeDisabled();

    // Assigning one clears that particular complaint.
    await page.getByTestId("node-stage-New Review Stage").click();
    await page.getByTestId("node-role").click();
    await page.getByRole("option", { name: "HR Officer", exact: true }).click();
    await closeOverlays(page);

    await expect(page.getByTestId("issue-list")).not.toContainText(
      "has no role assigned",
    );
  });

  test("deleting a node removes it and its connections", async ({ page }) => {
    await page.getByTestId("add-email-node").click();
    await expect(nodes(page)).toHaveCount(NODE_COUNT + 1);

    await page.getByTestId("delete-node").click();
    await closeOverlays(page);
    await expect(nodes(page)).toHaveCount(NODE_COUNT);
    await expect(edges(page)).toHaveCount(EDGE_COUNT);
    await expect(page.getByTestId("publish-workflow")).toBeEnabled();
  });

  test("saving a draft persists across a reload", async ({ page }) => {
    await page.getByTestId("node-stage-Director Review").click();
    await page.getByTestId("node-label").fill("Director Sign-off");
    await closeOverlays(page);

    await page.getByTestId("save-workflow").click();
    await expectToast(page, "Draft saved.");

    await page.reload();
    await expect(
      page.getByTestId("node-stage-Director Sign-off"),
    ).toBeVisible();
    await expect(page.getByText("draft has unpublished changes")).toBeVisible();
  });

  test("dragging a node keeps the graph on screen", async ({ page }) => {
    // React Flow reports an unmeasured node by logging, not by throwing, so
    // the console is the only place the regression shows up.
    const complaints: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("not initialized")) {
        complaints.push(message.text());
      }
    });

    const node = page.getByTestId("node-stage-Director Review");
    await expect(node).toBeVisible();

    const box = (await node.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();

    // Mid-drag the canvas must still be intact: the regression this guards
    // against blanked the dragged node and its edges out while the pointer
    // was down.
    for (const offset of [40, 80, 120]) {
      await page.mouse.move(
        box.x + box.width / 2 + offset,
        box.y + 12 + offset,
      );
      await expect(nodes(page)).toHaveCount(NODE_COUNT);
      await expect(edges(page)).toHaveCount(EDGE_COUNT);
      await expect(node).toBeVisible();
    }

    await page.mouse.up();
    await expect(nodes(page)).toHaveCount(NODE_COUNT);
    await expect(edges(page)).toHaveCount(EDGE_COUNT);
    expect(complaints).toEqual([]);
  });

  test("reverting throws away draft edits", async ({ page }) => {
    await page.getByTestId("node-stage-Director Review").click();
    await page.getByTestId("node-label").fill("Temporary Name");
    await closeOverlays(page);
    await page.getByTestId("save-workflow").click();
    await expectToast(page, "Draft saved.");

    await page.getByTestId("revert-workflow").click();
    await expectToast(page, "Draft reset to the published version.");
    await expect(page.getByTestId("node-stage-Director Review")).toBeVisible();
    await expect(page.getByTestId("node-stage-Temporary Name")).toHaveCount(0);
  });

  test("publishing asks for a memo and bumps the version", async ({ page }) => {
    // Scoped to the subtitle: the success toast repeats the same text.
    const subtitle = page.locator(".page-subtitle");
    const version = Number((await subtitle.innerText()).match(/\d+/)![0]);

    await page.getByTestId("publish-workflow").click();
    await expect(page.getByTestId("publish-dialog")).toBeVisible();
    await page
      .getByTestId("publish-memo")
      .fill("Tightened the Director review wording.");
    await page.getByTestId("confirm-publish").click();

    await expectToast(page, `Published version ${version + 1}.`);
    await expect(subtitle).toContainText(`Published version ${version + 1}`);

    // And the memo is optional: the next publish goes through without one.
    await page.getByTestId("publish-workflow").click();
    await page.getByTestId("confirm-publish").click();
    await expectToast(page, `Published version ${version + 2}.`);
  });

  test("lists every revision and protects the live one", async ({ page }) => {
    await page.getByTestId("open-version-history").click();
    const history = page.getByTestId("version-history");
    await expect(history).toBeVisible();

    // The seed publishes version 1 with a memo of its own.
    await expect(page.getByTestId("version-1")).toContainText(
      "Initial process: submission, dean, associate dean, HR, R&C, FD&W, HR final and the Director, who may hand the decision to an associate director.",
    );

    // The live revision offers neither restoring nor deleting: it is what the
    // portal is running.
    const live = history.locator("li").filter({ hasText: "Live" }).first();
    await expect(live).toBeVisible();
    await expect(live.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await closeOverlays(page);
  });

  test("deletes an older revision", async ({ page }) => {
    await page.getByTestId("open-version-history").click();
    await expect(page.getByTestId("version-1")).toBeVisible();

    await page.getByTestId("delete-version-1").click();
    await expect(page.getByTestId("delete-version-dialog")).toBeVisible();
    await page.getByTestId("confirm-delete-version").click();

    await expectToast(page, "Version 1 deleted.");
    await expect(page.getByTestId("version-1")).toHaveCount(0);

    // And it is gone for good, not just hidden until the sheet reopens.
    await closeOverlays(page);
    await page.reload();
    await page.getByTestId("open-version-history").click();
    await expect(page.getByTestId("version-1")).toHaveCount(0);

    await closeOverlays(page);
  });
});

test.describe("form builder", () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page);
  });

  test.afterEach(async ({ page }) => {
    await revert(page);
  });

  async function openForm(page: Page, nodeTestId: string) {
    await page.getByTestId(nodeTestId).click();
    await page.getByTestId("edit-form").click();
    await expect(page.getByTestId("form-builder-dialog")).toBeVisible();
  }

  test("opens the applicant form with its seeded sections", async ({
    page,
  }) => {
    await openForm(page, "node-start");

    // The lettered sections of STN 023 R5, in order.
    await expect(page.getByTestId("section-tab-0")).toContainText(
      "The Post Applied For",
    );
    await expect(page.getByTestId("section-tab-1")).toContainText(
      "A. Personal & Employment Details",
    );
    await expect(page.getByTestId("section-tab-5")).toContainText(
      "E. Research Accomplishments Checklist",
    );
    await expect(page.getByTestId("section-tab-9")).toContainText(
      "Supporting Documents",
    );
    await expect(page.getByTestId("section-tab-10")).toContainText(
      "Declaration",
    );
  });

  test("switching sections shows that section's fields", async ({ page }) => {
    await openForm(page, "node-start");

    await page.getByTestId("section-tab-1").click();
    await expect(page.getByTestId("field-row-full_name")).toBeVisible();

    await page.getByTestId("section-tab-4").click();
    await expect(
      page.getByTestId("field-row-total_publications"),
    ).toBeVisible();
    await expect(page.getByTestId("field-row-full_name")).toHaveCount(0);
  });

  test("adds a field of a chosen type and exposes its editor", async ({
    page,
  }) => {
    await openForm(page, "node-start");

    await page.getByTestId("add-field").click();
    await page.getByTestId("add-field-date").click();

    const row = page.getByTestId("field-row-untitled_date");
    await expect(row).toBeVisible();

    await page.getByTestId("field-toggle-untitled_date").click();
    await expect(
      page.getByRole("textbox", { name: "Label", exact: true }),
    ).toHaveValue("Untitled date");
  });

  test("derives the data key from the label until it is edited by hand", async ({
    page,
  }) => {
    await openForm(page, "node-start");

    await page.getByTestId("add-field").click();
    await page.getByTestId("add-field-text").click();
    await page.getByTestId("field-toggle-untitled_short_text").click();

    await page
      .getByRole("textbox", { name: "Label", exact: true })
      .fill("Research Grant Value");
    await expect(page.getByRole("textbox", { name: "Answer key" })).toHaveValue(
      "research_grant_value",
    );
  });

  test("warns when two fields share a data key", async ({ page }) => {
    await openForm(page, "node-start");

    await page.getByTestId("section-tab-1").click();
    await page.getByTestId("field-toggle-full_name").click();
    await page
      .getByRole("textbox", { name: "Answer key" })
      .fill("employee_code");

    await expect(
      page.getByText("Another question on this form already uses this key."),
    ).toBeVisible();
  });

  test("adds and removes a section", async ({ page }) => {
    await openForm(page, "node-start");

    await page.getByTestId("add-section").click();
    await expect(page.getByTestId("section-tab-11")).toBeVisible();
    await expect(page.getByTestId("section-title")).toHaveValue("Section 12");

    await page.getByRole("button", { name: "Delete Section 12" }).click();
    await expect(page.getByTestId("section-tab-11")).toHaveCount(0);
  });

  test("duplicating a field gives the copy its own key", async ({ page }) => {
    await openForm(page, "node-start");

    await page.getByTestId("section-tab-1").click();
    await page.getByRole("button", { name: "Duplicate Full name" }).click();
    await expect(page.getByTestId("field-row-full_name_copy")).toBeVisible();
  });

  test("deleting every field in a stage form leaves the node valid", async ({
    page,
  }) => {
    await openForm(page, "node-stage-Director Review");

    await page.getByRole("button", { name: "Delete Remarks" }).click();
    await expect(page.getByTestId("field-row-remarks")).toHaveCount(0);
  });
});
