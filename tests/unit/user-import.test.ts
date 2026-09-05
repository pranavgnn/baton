import { describe, expect, it } from "vitest";

import {
  buildImportRows,
  guessMapping,
  parseCsvTable,
  parseEmailList,
  parseUserCsv,
  splitCsvLine,
  CSV_TEMPLATE,
} from "@/lib/users/import";
import { parseUserDate, promotionBar } from "@/lib/users/profile";

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
      email: "a.person@manipal.edu",
      name: "A Person",
      employeeId: "MIT-2201",
      department: "Department of Computer Engineering",
      roles: ["Head"],
    });
    // The second row names no role, which means the default.
    expect(rows[1].roles).toEqual([]);
  });

  it("does not care what order the columns are in", () => {
    const { rows } = parseUserCsv("name,roles,email\nAnita,Head,a@b.edu");
    expect(rows[0]).toMatchObject({
      email: "a@b.edu",
      name: "Anita",
      roles: ["Head"],
    });
  });

  it("accepts several roles separated by a semicolon", () => {
    const { rows } = parseUserCsv("email,roles\na@b.edu,Head;Registrar");
    expect(rows[0].roles).toEqual(["Head", "Registrar"]);
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

  it("keeps a department name containing a comma intact", () => {
    const { rows } = parseUserCsv(
      'email,department\na@b.edu,"Department of Basic Sciences, Humanities & Management"',
    );
    expect(rows[0].department).toBe(
      "Department of Basic Sciences, Humanities & Management",
    );
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

describe("mapping columns by hand", () => {
  const table = () =>
    parseCsvTable(
      [
        "mail id,staff no,who,when they joined",
        "a.person@manipal.edu,MIT-2201,A Person,01/06/2017",
      ].join("\n"),
    );

  it("imports a file whose columns are named nothing in particular", () => {
    // Nothing here matches a portal field, so the guess finds nothing and the
    // admin says which is which.
    expect(guessMapping(table().header)).toEqual({});

    const { rows, issues } = buildImportRows(table(), {
      email: 0,
      employeeId: 1,
      name: 2,
      dateOfJoining: 3,
    });

    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({
      email: "a.person@manipal.edu",
      employeeId: "MIT-2201",
      name: "A Person",
      dateOfJoining: "2017-06-01",
      // Not mapped, so not imported - even though the file has more columns.
      designation: "",
    });
  });

  it("refuses to import without knowing which column is the address", () => {
    const { rows, issues } = buildImportRows(table(), { name: 2 });
    expect(rows).toEqual([]);
    expect(issues[0].message).toMatch(/which column holds the email/i);
  });

  it("reads a file with no header row at all", () => {
    const noHeader = parseCsvTable("a@b.edu,A Person", false);
    expect(noHeader.header).toEqual(["Column 1", "Column 2"]);

    const { rows } = buildImportRows(noHeader, { email: 0, name: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(1);
  });

  it("guesses from the field's own label as well as its column name", () => {
    const guessed = guessMapping(["Email", "Employee code", "Date of birth"]);
    expect(guessed).toEqual({ email: 0, employeeId: 1, dateOfBirth: 2 });
  });

  it("keeps the account when one cell cannot be read", () => {
    const messy = parseCsvTable(
      "email,date_of_birth,user_type\na@b.edu,not a date,visiting",
    );
    const { rows, issues } = buildImportRows(messy, guessMapping(messy.header));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dateOfBirth: "", userType: "" });
    expect(issues).toHaveLength(2);
  });
});

describe("dates as people write them", () => {
  it("reads the day-first form the paper form asks for", () => {
    expect(parseUserDate("01/06/2017")).toBe("2017-06-01");
    expect(parseUserDate("1.6.2017")).toBe("2017-06-01");
    expect(parseUserDate("2017-06-01")).toBe("2017-06-01");
  });

  it("refuses anything it would have to guess at", () => {
    // Not read as a US date, and not read as the 13th month either.
    expect(parseUserDate("06/13/2017")).toBe(null);
    expect(parseUserDate("31/02/2020")).toBe(null);
    expect(parseUserDate("June 2017")).toBe(null);
    expect(parseUserDate("")).toBe(null);
  });
});

describe("who may apply for a promotion", () => {
  it("bars a fixed-term or probationary appointment, and nobody else", () => {
    expect(promotionBar("contract")).toMatch(/not eligible/);
    expect(promotionBar("probation")).toMatch(/not eligible/);
    expect(promotionBar("regular")).toBe(null);
  });

  it("does not bar an account whose employment was never recorded", () => {
    // The portal not knowing something is not the same as knowing it
    // disqualifies them: an import that missed a column must not quietly
    // stop people applying.
    expect(promotionBar(null)).toBe(null);
    expect(promotionBar("")).toBe(null);
  });
});
