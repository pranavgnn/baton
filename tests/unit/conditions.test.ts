import { describe, expect, it } from "vitest";

import {
  conditionDependencies,
  evaluateRule,
  isFieldRequired,
  isFieldVisible,
  matchesConditions,
} from "@/lib/workflow/conditions";
import { createField, createRepeater } from "@/lib/workflow/defaults";
import { validateForm } from "@/lib/workflow/form";
import type {
  ConditionGroup,
  ConditionOperator,
  FormSchema,
} from "@/lib/workflow/types";

/**
 * The paper forms ask plenty of questions that only apply sometimes - "date of
 * eligibility (if eligible)", "patent certificate (if item 10 is above zero)".
 * A rule names another answer beside it.
 */

function rule(field: string, operator: ConditionOperator, value = "") {
  return { id: `rule_${field}_${operator}`, field, operator, value };
}

function group(
  rules: ReturnType<typeof rule>[],
  mode: "all" | "any" = "all",
): ConditionGroup {
  return { mode, rules };
}

describe("evaluating one rule", () => {
  it("compares an answer against a value", () => {
    expect(
      evaluateRule(rule("verdict", "equals", "yes"), { verdict: "yes" }),
    ).toBe(true);
    expect(
      evaluateRule(rule("verdict", "equals", "yes"), { verdict: "no" }),
    ).toBe(false);
    expect(
      evaluateRule(rule("verdict", "notEquals", "yes"), { verdict: "no" }),
    ).toBe(true);
  });

  it("treats a multi-select as matching when it holds the value", () => {
    expect(
      evaluateRule(rule("areas", "equals", "research"), {
        areas: ["teaching", "research"],
      }),
    ).toBe(true);
  });

  it("tells an answered question from a blank one", () => {
    expect(evaluateRule(rule("amount", "isFilled"), { amount: 5 })).toBe(true);
    expect(evaluateRule(rule("amount", "isFilled"), { amount: "" })).toBe(
      false,
    );
    expect(evaluateRule(rule("amount", "isEmpty"), { amount: null })).toBe(
      true,
    );
    // An unticked box and an empty list both count as unanswered.
    expect(evaluateRule(rule("agree", "isEmpty"), { agree: false })).toBe(true);
    expect(evaluateRule(rule("files", "isEmpty"), { files: [] })).toBe(true);
  });

  it("reads a tick box", () => {
    expect(evaluateRule(rule("agree", "isChecked"), { agree: true })).toBe(
      true,
    );
    expect(evaluateRule(rule("agree", "isNotChecked"), { agree: false })).toBe(
      true,
    );
  });

  it("compares numbers, including ones typed as text", () => {
    expect(
      evaluateRule(rule("patents", "greaterThan", "0"), { patents: 2 }),
    ).toBe(true);
    expect(
      evaluateRule(rule("patents", "greaterThan", "0"), { patents: "2" }),
    ).toBe(true);
    expect(
      evaluateRule(rule("patents", "greaterThan", "0"), { patents: 0 }),
    ).toBe(false);
    expect(evaluateRule(rule("patents", "lessThan", "3"), { patents: 2 })).toBe(
      true,
    );
    // Nothing to compare: not a match, rather than an accidental one.
    expect(evaluateRule(rule("patents", "greaterThan", "0"), {})).toBe(false);
  });
});

describe("combining rules", () => {
  it("requires every rule by default", () => {
    const both = group([rule("a", "equals", "1"), rule("b", "equals", "2")]);

    expect(matchesConditions(both, { a: "1", b: "2" })).toBe(true);
    expect(matchesConditions(both, { a: "1", b: "3" })).toBe(false);
  });

  it("accepts any rule when asked to", () => {
    const either = group(
      [
        rule("guided", "greaterThan", "0"),
        rule("co_guided", "greaterThan", "0"),
      ],
      "any",
    );

    expect(matchesConditions(either, { guided: 0, co_guided: 1 })).toBe(true);
    expect(matchesConditions(either, { guided: 0, co_guided: 0 })).toBe(false);
  });

  it("matches when there is nothing to test", () => {
    // A half-written rule in the builder must not hide a question from
    // everybody.
    expect(matchesConditions(null, {})).toBe(true);
    expect(matchesConditions(group([]), {})).toBe(true);
  });
});

describe("what a rule does to a field", () => {
  const conditional = createField({
    type: "date",
    key: "date_of_eligibility",
    label: "Date of eligibility",
    required: true,
    visibleWhen: group([rule("verdict", "equals", "yes")]),
  });

  it("hides a field whose rule does not hold", () => {
    expect(isFieldVisible(conditional, { verdict: "no" })).toBe(false);
    expect(isFieldVisible(conditional, { verdict: "yes" })).toBe(true);
  });

  it("never requires a hidden field", () => {
    expect(isFieldRequired(conditional, { verdict: "no" })).toBe(false);
    expect(isFieldRequired(conditional, { verdict: "yes" })).toBe(true);
  });

  it("lets a rule replace the required flag rather than add to it", () => {
    const remarks = createField({
      type: "textarea",
      key: "remarks",
      label: "Remarks",
      required: false,
      requiredWhen: group([rule("verdict", "equals", "no")]),
    });

    expect(isFieldRequired(remarks, { verdict: "no" })).toBe(true);
    expect(isFieldRequired(remarks, { verdict: "yes" })).toBe(false);
  });

  it("lists the answers a field depends on, once each", () => {
    const field = createField({
      type: "text",
      key: "x",
      label: "X",
      visibleWhen: group([rule("a", "equals", "1")]),
      requiredWhen: group([rule("a", "isFilled"), rule("b", "isFilled")]),
    });

    expect(conditionDependencies(field)).toEqual(["a", "b"]);
  });
});

describe("validating a form that has rules", () => {
  const form: FormSchema = {
    sections: [
      {
        id: "sec_1",
        title: "Verdict",
        description: "",
        fields: [
          createField({
            type: "radio",
            key: "verdict",
            label: "Eligible",
            required: true,
            options: [
              { id: "o1", label: "Yes", value: "yes" },
              { id: "o2", label: "No", value: "no" },
            ],
          }),
          createField({
            type: "date",
            key: "date_of_eligibility",
            label: "Date of eligibility",
            required: true,
            visibleWhen: {
              mode: "all",
              rules: [rule("verdict", "equals", "yes")],
            },
          }),
          createField({
            type: "textarea",
            key: "reason",
            label: "Reason",
            requiredWhen: {
              mode: "all",
              rules: [rule("verdict", "equals", "no")],
            },
          }),
        ],
      },
    ],
  };

  it("insists on a conditional field once its rule holds", () => {
    const result = validateForm(form, { verdict: "yes" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.date_of_eligibility).toBe(
        "Date of eligibility is required",
      );
    }
  });

  it("ignores it entirely while the rule does not hold", () => {
    const result = validateForm(form, {
      verdict: "no",
      reason: "Short of the bar.",
    });
    expect(result.ok).toBe(true);
  });

  it("requires an answer only while the rule says so", () => {
    const missing = validateForm(form, { verdict: "no" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.reason).toBe("Reason is required");

    const notNeeded = validateForm(form, {
      verdict: "yes",
      date_of_eligibility: "2026-07-01",
    });
    expect(notNeeded.ok).toBe(true);
  });

  it("still checks the format of a conditional answer that was given", () => {
    const result = validateForm(form, {
      verdict: "yes",
      date_of_eligibility: "not-a-date",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.date_of_eligibility).toContain("valid date");
    }
  });

  it("applies a rule inside a repeating entry against that entry", () => {
    const withRows: FormSchema = {
      sections: [
        {
          id: "sec_1",
          title: "Projects",
          description: "",
          fields: [
            createRepeater({ key: "projects", label: "Projects" }, [
              createField({
                type: "checkbox",
                key: "external",
                label: "Externally funded",
              }),
              createField({
                type: "number",
                key: "amount",
                label: "Amount",
                requiredWhen: {
                  mode: "all",
                  rules: [rule("external", "isChecked")],
                },
              }),
            ]),
          ],
        },
      ],
    };

    const result = validateForm(withRows, {
      projects: [{ external: false }, { external: true }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Only the entry that ticked the box is asked for an amount.
      expect(result.errors["projects.1.amount"]).toBe("Amount is required");
      expect(result.errors["projects.0.amount"]).toBeUndefined();
    }
  });
});
