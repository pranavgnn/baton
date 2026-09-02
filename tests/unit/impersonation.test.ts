import { describe, expect, it } from "vitest";

import {
  coversPrivileges,
  refuseImpersonation,
} from "@/lib/auth/impersonation";

const party = (
  id: string,
  permissions: string[],
  disabled = false,
): { id: string; disabled: boolean; permissions: string[] } => ({
  id,
  disabled,
  permissions,
});

describe("who may act as whom", () => {
  const admin = party("admin", ["users.manage", "applications.viewAll"]);

  it("lets an administrator act as an ordinary user of the portal", () => {
    // Not a permission the administrator holds, and deliberately not a
    // barrier: seeing the applicant's own screens is the point.
    expect(refuseImpersonation(admin, party("e", ["applications.apply"]))).toBe(
      null,
    );
    expect(
      refuseImpersonation(admin, party("r", ["applications.review"])),
    ).toBe(null);
  });

  it("refuses an account that holds something the administrator does not", () => {
    // The rule the whole feature rests on: impersonation must not be a way to
    // borrow a permission.
    expect(refuseImpersonation(admin, party("hr", ["roles.manage"]))).toBe(
      "privileged",
    );
    expect(refuseImpersonation(admin, party("root", ["*"]))).toBe("privileged");
  });

  it("refuses yourself and a disabled account", () => {
    expect(refuseImpersonation(admin, party("admin", []))).toBe("self");
    expect(refuseImpersonation(admin, party("gone", [], true))).toBe(
      "disabled",
    );
  });

  it("lets a super admin act as anyone", () => {
    const root = party("root", ["*"]);
    expect(refuseImpersonation(root, party("other", ["*"]))).toBe(null);
  });

  it("weighs only the permissions that administer the portal", () => {
    expect(coversPrivileges(["roles.manage"], ["roles.manage"])).toBe(true);
    expect(coversPrivileges(["users.manage"], ["roles.manage"])).toBe(false);
    // Using the portal is not administering it.
    expect(coversPrivileges([], ["applications.apply"])).toBe(true);
    expect(coversPrivileges(["users.manage"], ["*"])).toBe(false);
  });
});
