import { z } from "zod";

import {
  parseUserDate,
  parseUserType,
  USER_FIELDS,
  type UserFieldKey,
} from "./profile";

/**
 * Parsing for bulk user import. Pure and separately tested: a bad import is
 * tedious to undo, so the parsing rules are worth pinning down.
 *
 * A file is read in two steps - split into a table, then read through a
 * mapping of portal field to column - so an institute's own spreadsheet can be
 * imported as it stands. The header is only ever used to *guess* that mapping;
 * a file whose columns are named nothing in particular, or named nothing at
 * all, is mapped by hand and imports just the same.
 */

export type ImportRow = {
  /** 1-based line number in the source, for reporting. */
  line: number;
  email: string;
  name: string;
  employeeId: string;
  school: string;
  designation: string;
  institution: string;
  userType: string;
  dateOfBirth: string;
  dateOfJoining: string;
  dateOfLastPromotion: string;
  phone: string;
  personalEmail: string;
  address: string;
  /** Role names exactly as written; resolved to ids on the server. */
  roles: string[];
};

export type ImportIssue = { line: number; message: string };

export type ParsedImport = {
  rows: ImportRow[];
  issues: ImportIssue[];
};

/** Field key to zero-based column index. A field left out is not imported. */
export type ColumnMapping = Partial<Record<UserFieldKey, number>>;

export type CsvTable = {
  /** The first line when it is a header, otherwise generated column names. */
  header: string[];
  rows: { line: number; cells: string[] }[];
};

export const IMPORT_COLUMNS = USER_FIELDS.map((field) => field.csv);

export const CSV_TEMPLATE = `email,name,employee_id,school,designation,user_type,date_of_joining,roles
a.person@manipal.edu,A Person,MIT-2201,School of Computer Engineering,Professor,regular,01/06/2017,Dean
another.person@manipal.edu,Another Person,MIT-4471,School of Electrical Engineering,Assistant Professor,contract,15/07/2021,
`;

const emailSchema = z.email();

/**
 * Splits one CSV line, honouring double quotes so a school name containing a
 * comma survives the round trip.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted cell is a literal quote.
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells.map((value) => value.trim());
}

/**
 * Splits the text into a header and its rows.
 *
 * With `hasHeader` false the first line is data and the columns are named for
 * their position, which is what a file exported without a header needs.
 */
export function parseCsvTable(text: string, hasHeader = true): CsvTable {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { header: [], rows: [] };

  const body = hasHeader ? lines.slice(1) : lines;
  const width = Math.max(
    ...lines.map((line) => splitCsvLine(line).length),
    hasHeader ? 0 : 1,
  );

  const header = hasHeader
    ? splitCsvLine(lines[0])
    : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);

  return {
    header,
    rows: body.map((line, offset) => ({
      // Line numbers count the header, and are 1-based.
      line: offset + (hasHeader ? 2 : 1),
      cells: splitCsvLine(line),
    })),
  };
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "");
}

/**
 * The mapping a header suggests.
 *
 * Matched on the column name and on the field's own label, so both
 * `employee_id` and `Employee code` land on the same field. Whatever it gets
 * wrong, the admin corrects before anything is written.
 */
export function guessMapping(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();

  for (const field of USER_FIELDS) {
    const candidates = [field.csv, field.label, field.key].map(normalise);
    const index = header.findIndex(
      (column, position) =>
        !taken.has(position) && candidates.includes(normalise(column)),
    );
    if (index >= 0) {
      mapping[field.key] = index;
      taken.add(index);
    }
  }

  return mapping;
}

const BLANK: Omit<ImportRow, "line" | "email" | "roles"> = {
  name: "",
  employeeId: "",
  school: "",
  designation: "",
  institution: "",
  userType: "",
  dateOfBirth: "",
  dateOfJoining: "",
  dateOfLastPromotion: "",
  phone: "",
  personalEmail: "",
  address: "",
};

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Reads the table through the mapping.
 *
 * A row is only ever skipped over its address; every other value that cannot
 * be read - a date in no recognisable form, an employment type that is not one
 * - is reported and left blank, so one bad cell does not cost the account.
 */
export function buildImportRows(
  table: CsvTable,
  mapping: ColumnMapping,
): ParsedImport {
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();

  const emailIndex = mapping.email;
  if (emailIndex === undefined) {
    return {
      rows: [],
      issues: [
        { line: 0, message: "Choose which column holds the email address." },
      ],
    };
  }

  for (const row of table.rows) {
    const at = (key: UserFieldKey) => {
      const index = mapping[key];
      return index === undefined ? "" : (row.cells[index] ?? "").trim();
    };

    const email = at("email").toLowerCase();
    if (!email) continue;

    if (!emailSchema.safeParse(email).success) {
      issues.push({
        line: row.line,
        message: `"${email}" is not a valid email address.`,
      });
      continue;
    }
    if (seen.has(email)) {
      issues.push({
        line: row.line,
        message: `${email} appears more than once in this file.`,
      });
      continue;
    }
    seen.add(email);

    const date = (key: UserFieldKey, label: string) => {
      const written = at(key);
      if (!written) return "";
      const parsed = parseUserDate(written);
      if (!parsed) {
        issues.push({
          line: row.line,
          message: `${label} "${written}" is not a date the portal can read. Use DD/MM/YYYY.`,
        });
        return "";
      }
      return parsed;
    };

    const writtenType = at("userType");
    const userType = writtenType ? parseUserType(writtenType) : null;
    if (writtenType && !userType) {
      issues.push({
        line: row.line,
        message: `"${writtenType}" is not an employment type. Use regular, contract or probation.`,
      });
    }

    rows.push({
      ...BLANK,
      line: row.line,
      email,
      name: at("name") || nameFromEmail(email),
      employeeId: at("employeeId"),
      school: at("school"),
      designation: at("designation"),
      institution: at("institution"),
      userType: userType ?? "",
      dateOfBirth: date("dateOfBirth", "Date of birth"),
      dateOfJoining: date("dateOfJoining", "Date of joining"),
      dateOfLastPromotion: date(
        "dateOfLastPromotion",
        "Date of last promotion",
      ),
      phone: at("phone"),
      personalEmail: at("personalEmail"),
      address: at("address"),
      roles: at("roles")
        .split(/[;|]/)
        .map((role) => role.trim())
        .filter(Boolean),
    });
  }

  return { rows, issues };
}

/**
 * Parses a CSV whose header names its columns - the straightforward case, and
 * what the pasted example produces.
 */
export function parseUserCsv(text: string): ParsedImport {
  const table = parseCsvTable(text);
  if (table.header.length === 0) {
    return { rows: [], issues: [{ line: 0, message: "The file is empty." }] };
  }

  const mapping = guessMapping(table.header);
  if (mapping.email === undefined) {
    return {
      rows: [],
      issues: [
        {
          line: 1,
          message: `The header row needs an "email" column. Found: ${table.header.join(", ") || "nothing"}.`,
        },
      ],
    };
  }

  return buildImportRows(table, mapping);
}

/**
 * Parses a pasted list of addresses, one per line. Accepts a bare address or
 * the `Name <address>` form that mail clients produce.
 */
export function parseEmailList(text: string): ParsedImport {
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();

  const entries = text
    .split(/[\r\n,]+/)
    .map((line, index) => ({ raw: line.trim(), line: index + 1 }))
    .filter((entry) => entry.raw.length > 0);

  for (const entry of entries) {
    const angled = entry.raw.match(/^(.*?)<([^>]+)>$/);
    const email = (angled ? angled[2] : entry.raw).trim().toLowerCase();
    const written = angled ? angled[1].replace(/["']/g, "").trim() : "";

    if (!emailSchema.safeParse(email).success) {
      issues.push({
        line: entry.line,
        message: `"${entry.raw}" is not a valid email address.`,
      });
      continue;
    }
    if (seen.has(email)) {
      issues.push({
        line: entry.line,
        message: `${email} appears more than once in this list.`,
      });
      continue;
    }
    seen.add(email);

    rows.push({
      ...BLANK,
      line: entry.line,
      email,
      name: written || nameFromEmail(email),
      roles: [],
    });
  }

  return { rows, issues };
}
