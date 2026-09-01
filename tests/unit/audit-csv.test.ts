import { describe, expect, it } from "vitest";

import { auditCsv, escapeCsv, type AuditCsvRow } from "@/lib/audit/csv";

function row(overrides: Partial<AuditCsvRow> = {}): AuditCsvRow {
  return {
    createdAt: new Date("2026-03-04T11:30:00.000Z"),
    action: "application.submitted",
    actorName: "Dr. Meera Shenoy",
    actorEmail: "faculty@manipal.edu",
    summary: "Submitted application PROM-2026-0001.",
    targetType: "application",
    targetLabel: "PROM-2026-0001",
    applicationId: "app-1",
    ipAddress: "10.0.0.4",
    ...overrides,
  };
}

describe("escapeCsv", () => {
  it("leaves an ordinary value alone", () => {
    expect(escapeCsv("Signed in")).toBe("Signed in");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsv("Shenoy, Meera")).toBe('"Shenoy, Meera"');
  });

  it("doubles an embedded quote", () => {
    expect(escapeCsv('Outcome "Recommend"')).toBe('"Outcome ""Recommend"""');
  });

  it("quotes a value spanning lines", () => {
    expect(escapeCsv("first\nsecond")).toBe('"first\nsecond"');
  });

  it("writes an empty cell for a missing value", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });

  it("defuses a value a spreadsheet would treat as a formula", () => {
    // Someone can name a role anything, and that name reaches the export.
    expect(escapeCsv("=1+1")).toBe("'=1+1");
    expect(escapeCsv("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsv("@import")).toBe("'@import");
    expect(escapeCsv("-2")).toBe("'-2");
  });

  it("still quotes a defused value that also needs quoting", () => {
    expect(escapeCsv('=cmd|"x"')).toBe('"\'=cmd|""x"""');
  });
});

describe("auditCsv", () => {
  it("starts with a header row", () => {
    const [header] = auditCsv([]).split("\r\n");
    expect(header).toBe(
      "Timestamp,Action,Action key,Actor,Actor email,Summary,Target type,Target,Application,IP address",
    );
  });

  it("writes both the readable label and the underlying key", () => {
    const line = auditCsv([row()]).split("\r\n")[1]!;

    expect(line).toContain("Application submitted");
    expect(line).toContain("application.submitted");
  });

  it("writes the timestamp in a form that sorts", () => {
    const line = auditCsv([row()]).split("\r\n")[1]!;
    expect(line.startsWith("2026-03-04T11:30:00.000Z")).toBe(true);
  });

  it("accepts a timestamp that arrived as a string", () => {
    const line = auditCsv([
      row({ createdAt: "2026-03-04T11:30:00.000Z" }),
    ]).split("\r\n")[1]!;

    expect(line.startsWith("2026-03-04T11:30:00.000Z")).toBe(true);
  });

  it("keeps one line per entry even when a summary contains a comma", () => {
    const csv = auditCsv([
      row({ summary: "Completed HOD Review, outcome Recommend." }),
      row(),
    ]);

    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("leaves an unknown action under its own key", () => {
    const line = auditCsv([row({ action: "something.new" })]).split("\r\n")[1]!;
    expect(line).toContain("something.new,something.new");
  });
});
