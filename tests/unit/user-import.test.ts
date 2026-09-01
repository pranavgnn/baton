import { describe, expect, it } from "vitest";

import {
  parseEmailList,
  parseUserCsv,
  splitCsvLine,
  CSV_TEMPLATE,
} from "@/lib/users/import";

describe("splitCsvLine", () => {
  it("splits a plain line", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a comma inside quotes", () => {
    expect(splitCsvLine('a,"Smith, John",c')).toEqual([
      "a",
      "Smith, John",
      "c",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitCsvLine('a,"He said ""hi""",c')).toEqual([
      "a",
      'He said "hi"',
      "c",
    ]);
  });

  it("keeps empty trailing cells", () => {
    expect(splitCsvLine("a,,")).toEqual(["a", "", ""]);
  });
});

describe("parseUserCsv", () => {
  it("parses the shipped example", () => {
    const { rows, issues } = parseUserCsv(CSV_TEMPLATE);

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      email: "r.kamath@manipal.edu",
      name: "Prof. Ravi Kamath",
      employeeId: "MIT-2201",
      roles: ["Head of Department"],
    });
    // The second row names no role, which means the default.
    expect(rows[1].roles).toEqual([]);
  });

  it("does not care what order the columns are in", () => {
    const { rows } = parseUserCsv("name,roles,email\nAnita,Dean,a@b.edu");
    expect(rows[0]).toMatchObject({
      email: "a@b.edu",
      name: "Anita",
      roles: ["Dean"],
    });
  });

  it("accepts several roles separated by a semicolon", () => {
    const { rows } = parseUserCsv("email,roles\na@b.edu,Dean;Registrar");
    expect(rows[0].roles).toEqual(["Dean", "Registrar"]);
  });

  it("lower-cases addresses so duplicates cannot slip through", () => {
    const { rows, issues } = parseUserCsv("email\nA@B.edu\na@b.edu");
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("a@b.edu");
    expect(issues[0].message).toContain("appears more than once");
  });

  it("reports the line number of a bad address", () => {
    const { rows, issues } = parseUserCsv(
      "email\ngood@manipal.edu\nnot-an-email",
    );
    expect(rows).toHaveLength(1);
    expect(issues).toEqual([
      { line: 3, message: '"not-an-email" is not a valid email address.' },
    ]);
  });

  it("refuses a file with no email column", () => {
    const { rows, issues } = parseUserCsv("name,department\nAnita,CSE");
    expect(rows).toEqual([]);
    expect(issues[0].message).toContain('needs an "email" column');
  });

  it("refuses an empty file", () => {
    expect(parseUserCsv("   \n  ").issues[0].message).toBe(
      "The file is empty.",
    );
  });

  it("falls back to a name derived from the address", () => {
    const { rows } = parseUserCsv("email\nanita.rao@manipal.edu");
    expect(rows[0].name).toBe("Anita Rao");
  });

  it("survives Windows line endings and a trailing newline", () => {
    const { rows, issues } = parseUserCsv("email\r\na@b.edu\r\n");
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("keeps a department containing a comma intact", () => {
    const { rows } = parseUserCsv(
      'email,department\na@b.edu,"Electronics, Communication"',
    );
    expect(rows[0].department).toBe("Electronics, Communication");
  });
});

describe("parseEmailList", () => {
  it("takes one address per line", () => {
    const { rows, issues } = parseEmailList("a@manipal.edu\nb@manipal.edu\n");
    expect(issues).toEqual([]);
    expect(rows.map((row) => row.email)).toEqual([
      "a@manipal.edu",
      "b@manipal.edu",
    ]);
  });

  it("understands the Name <address> form mail clients produce", () => {
    const { rows } = parseEmailList("Prof. Ravi Kamath <r.kamath@manipal.edu>");
    expect(rows[0]).toMatchObject({
      email: "r.kamath@manipal.edu",
      name: "Prof. Ravi Kamath",
    });
  });

  it("accepts a comma-separated paste", () => {
    const { rows } = parseEmailList("a@b.edu, c@d.edu");
    expect(rows).toHaveLength(2);
  });

  it("gives every row no roles, so they take the default", () => {
    const { rows } = parseEmailList("a@b.edu");
    expect(rows[0].roles).toEqual([]);
  });

  it("reports a bad address without dropping the good ones", () => {
    const { rows, issues } = parseEmailList("good@b.edu\nrubbish");
    expect(rows).toHaveLength(1);
    expect(issues).toHaveLength(1);
  });
});
