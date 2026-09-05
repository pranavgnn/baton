import { describe, expect, it } from "vitest";

import {
  applyCalculations,
  applyPrefill,
  isLockedByProfile,
} from "@/lib/workflow/autofill";
import {
  evaluateFormula,
  formulaError,
  formulaKeys,
} from "@/lib/workflow/calc";
import {
  createField,
  createRepeater,
  createSection,
} from "@/lib/workflow/defaults";
import type { FormSchema } from "@/lib/workflow/types";

describe("formulas", () => {
  const scope = { a: 3, b: 4, written: "7", blank: "" };

  it("works out the four operators, brackets and precedence", () => {
    expect(evaluateFormula("a + b", scope)).toBe(7);
    expect(evaluateFormula("a + b * 2", scope)).toBe(11);
    expect(evaluateFormula("(a + b) * 2", scope)).toBe(14);
    expect(evaluateFormula("b / a * 3", scope)).toBe(4);
    expect(evaluateFormula("-a + b", scope)).toBe(1);
  });

  it("reads a number typed as text, and counts a blank as nothing", () => {
    // A total should appear while the form is still being filled in, not only
    // once every part of it is present.
    expect(evaluateFormula("written + a", scope)).toBe(10);
    expect(evaluateFormula("blank + a", scope)).toBe(3);
    expect(evaluateFormula("missing + a", scope)).toBe(3);
  });

  it("has no answer for a division by zero", () => {
    expect(evaluateFormula("a / 0", scope)).toBe(null);
  });

  it("names the answers it reads", () => {
    expect(formulaKeys("total_indexed + total_non_indexed")).toEqual([
      "total_indexed",
      "total_non_indexed",
    ]);
    expect(formulaKeys("2 * 3")).toEqual([]);
  });

  it("complains about what it cannot read, rather than guessing", () => {
    expect(formulaError("a +")).toBeTruthy();
    expect(formulaError("(a + b")).toBeTruthy();
    expect(formulaError("a % b")).toBeTruthy();
    expect(formulaError("a + b")).toBe(null);
  });
});

describe("filling a form in for the applicant", () => {
  const form: FormSchema = {
    sections: [
      createSection("Particulars", [
        {
          ...createField({ type: "text", key: "name", label: "Name" }),
          prefill: "name",
        },
        {
          ...createField({ type: "text", key: "employee_code", label: "Code" }),
          prefill: "employeeId",
        },
        createField({ type: "number", key: "indexed", label: "Indexed" }),
        createField({ type: "number", key: "other", label: "Other" }),
        {
          ...createField({ type: "number", key: "total", label: "Total" }),
          formula: "indexed + other",
        },
        createRepeater({ key: "posts", label: "Posts" }, [
          createField({ type: "number", key: "years", label: "Years" }),
          createField({ type: "number", key: "months", label: "Months" }),
          {
            ...createField({
              type: "number",
              key: "total_months",
              label: "Total",
            }),
            formula: "years * 12 + months",
          },
        ]),
      ]),
    ],
  };

  const profile = {
    name: "Test Applicant",
    employeeId: "",
    department: "SOCE",
  };

  it("locks a field the account can answer, and leaves the rest alone", () => {
    const fields = form.sections[0].fields;
    expect(isLockedByProfile(fields[0], profile)).toBe(true);
    // The account holds no employee code, so the question is still asked.
    expect(isLockedByProfile(fields[1], profile)).toBe(false);
    expect(isLockedByProfile(fields[2], profile)).toBe(false);
  });

  it("writes account values over what was typed, but only where it has one", () => {
    const filled = applyPrefill(
      form,
      { name: "Someone Else", employee_code: "EMP-1" },
      profile,
    );
    expect(filled.name).toBe("Test Applicant");
    expect(filled.employee_code).toBe("EMP-1");
  });

  it("works out totals, including one per entry of a repeating group", () => {
    const computed = applyCalculations(form, {
      indexed: 4,
      other: 2,
      total: 99,
      posts: [
        { years: 2, months: 3 },
        { years: 0, months: 5 },
      ],
    });

    // The figure that arrived is replaced, which is what stops a browser
    // deciding its own totals.
    expect(computed.total).toBe(6);
    expect(computed.posts).toEqual([
      { years: 2, months: 3, total_months: 27 },
      { years: 0, months: 5, total_months: 5 },
    ]);
  });
});
