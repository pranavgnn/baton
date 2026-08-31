import { describe, expect, it } from "vitest";

import {
  grants,
  grantsAny,
  isPermissionKey,
  PERMISSION_KEYS,
  SUPER_ADMIN_PERMISSION,
} from "@/lib/auth/permissions";
import { displayValue } from "@/lib/workflow/display";
import { createField } from "@/lib/workflow/defaults";
import { formatBytes } from "@/lib/format";

describe("grants", () => {
  it("grants a permission that is explicitly held", () => {
    expect(grants(["users.manage"], "users.manage")).toBe(true);
  });

  it("denies a permission that is not held", () => {
    expect(grants(["users.manage"], "workflow.manage")).toBe(false);
  });

  it("lets the super admin wildcard satisfy anything", () => {
    for (const key of PERMISSION_KEYS) {
      expect(grants([SUPER_ADMIN_PERMISSION], key)).toBe(true);
    }
  });

  it("denies everything when no permissions are held", () => {
    expect(grants([], "admin.access")).toBe(false);
    expect(grantsAny([], ["admin.access", "users.manage"])).toBe(false);
  });
});

describe("grantsAny", () => {
  it("passes when at least one permission matches", () => {
    expect(grantsAny(["roles.manage"], ["users.manage", "roles.manage"])).toBe(
      true,
    );
  });

  it("fails when none match", () => {
    expect(
      grantsAny(["applications.apply"], ["users.manage", "roles.manage"]),
    ).toBe(false);
  });

  it("respects the wildcard", () => {
    expect(grantsAny([SUPER_ADMIN_PERMISSION], ["users.manage"])).toBe(true);
  });
});

describe("isPermissionKey", () => {
  it("recognises real keys and rejects invented ones", () => {
    expect(isPermissionKey("users.manage")).toBe(true);
    expect(isPermissionKey("users.destroy")).toBe(false);
    expect(isPermissionKey(SUPER_ADMIN_PERMISSION)).toBe(false);
  });
});

describe("displayValue", () => {
  it("renders a select as its option label, not its stored value", () => {
    const field = createField({
      type: "select",
      key: "dept",
      label: "Department",
      options: [{ id: "o1", label: "Computer Science", value: "cse" }],
    });
    expect(displayValue(field, "cse")).toEqual({
      kind: "text",
      value: "Computer Science",
    });
  });

  it("falls back to the raw value for an option that has been removed", () => {
    const field = createField({
      type: "select",
      key: "dept",
      label: "Department",
      options: [],
    });
    expect(displayValue(field, "gone")).toEqual({
      kind: "text",
      value: "gone",
    });
  });

  it("joins multiselect labels", () => {
    const field = createField({
      type: "multiselect",
      key: "areas",
      label: "Areas",
      options: [
        { id: "o1", label: "Teaching", value: "teaching" },
        { id: "o2", label: "Research", value: "research" },
      ],
    });
    expect(displayValue(field, ["teaching", "research"])).toEqual({
      kind: "text",
      value: "Teaching, Research",
    });
  });

  it("renders checkboxes as Yes or No", () => {
    const field = createField({ type: "checkbox", key: "a", label: "A" });
    expect(displayValue(field, true)).toEqual({ kind: "text", value: "Yes" });
    expect(displayValue(field, false)).toEqual({ kind: "text", value: "No" });
  });

  it("formats ISO dates for display", () => {
    const field = createField({ type: "date", key: "d", label: "D" });
    expect(displayValue(field, "2016-07-18")).toEqual({
      kind: "text",
      value: "18 July 2016",
    });
  });

  it("shows a dash for an unanswered field", () => {
    const field = createField({ type: "text", key: "t", label: "T" });
    expect(displayValue(field, "")).toEqual({ kind: "text", value: "-" });
    expect(displayValue(field, null)).toEqual({ kind: "text", value: "-" });
  });

  it("returns file values as a list", () => {
    const field = createField({ type: "file", key: "f", label: "F" });
    const file = {
      id: "1",
      key: "k",
      name: "cv.pdf",
      size: 10,
      contentType: "application/pdf",
    };
    expect(displayValue(field, file)).toEqual({ kind: "files", files: [file] });
    expect(displayValue(field, null)).toEqual({ kind: "files", files: [] });
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "2 KB"],
    [1024 * 1024, "1.0 MB"],
    [10 * 1024 * 1024, "10.0 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
