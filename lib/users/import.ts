import { z } from "zod";

/**
 * Parsing for bulk user import. Pure and separately tested: a bad import is
 * tedious to undo, so the parsing rules are worth pinning down.
 */

export type ImportRow = {
  /** 1-based line number in the source, for reporting. */
  line: number;
  email: string;
  name: string;
  employeeId: string;
  school: string;
  designation: string;
  /** Role names exactly as written; resolved to ids on the server. */
  roles: string[];
};

export type ImportIssue = { line: number; message: string };

export type ParsedImport = {
  rows: ImportRow[];
  issues: ImportIssue[];
};

export const IMPORT_COLUMNS = [
  "email",
  "name",
  "employee_id",
  "school",
  "designation",
  "roles",
] as const;

export const CSV_TEMPLATE = `${IMPORT_COLUMNS.join(",")}
a.person@manipal.edu,A Person,MIT-2201,School of Computer Engineering,Professor,Dean
another.person@manipal.edu,Another Person,MIT-4471,School of Electrical Engineering,Assistant Professor,
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

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collect(
  candidates: { line: number; email: string; rest: Partial<ImportRow> }[],
): ParsedImport {
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const email = candidate.email.trim().toLowerCase();
    if (!email) continue;

    if (!emailSchema.safeParse(email).success) {
      issues.push({
        line: candidate.line,
        message: `"${candidate.email}" is not a valid email address.`,
      });
      continue;
    }

    if (seen.has(email)) {
      issues.push({
        line: candidate.line,
        message: `${email} appears more than once in this file.`,
      });
      continue;
    }
    seen.add(email);

    rows.push({
      line: candidate.line,
      email,
      name: candidate.rest.name?.trim() || nameFromEmail(email),
      employeeId: candidate.rest.employeeId?.trim() ?? "",
      school: candidate.rest.school?.trim() ?? "",
      designation: candidate.rest.designation?.trim() ?? "",
      roles: candidate.rest.roles ?? [],
    });
  }

  return { rows, issues };
}

/**
 * Parses a CSV. The header is matched by name so column order does not matter,
 * and only `email` is required.
 */
export function parseUserCsv(text: string): ParsedImport {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], issues: [{ line: 0, message: "The file is empty." }] };
  }

  const header = splitCsvLine(lines[0]).map((cell) =>
    cell.toLowerCase().replace(/\s+/g, "_"),
  );
  const emailIndex = header.indexOf("email");

  if (emailIndex < 0) {
    return {
      rows: [],
      issues: [
        {
          line: 1,
          message: `The header row needs an "email" column. Found: ${header.join(", ") || "nothing"}.`,
        },
      ],
    };
  }

  const at = (cells: string[], column: string) => {
    const index = header.indexOf(column);
    return index >= 0 ? (cells[index] ?? "") : "";
  };

  const candidates = lines.slice(1).map((line, offset) => {
    const cells = splitCsvLine(line);
    return {
      // +2: one for the header, one to make it 1-based.
      line: offset + 2,
      email: cells[emailIndex] ?? "",
      rest: {
        name: at(cells, "name"),
        employeeId: at(cells, "employee_id"),
        school: at(cells, "school"),
        designation: at(cells, "designation"),
        roles: at(cells, "roles")
          .split(/[;|]/)
          .map((role) => role.trim())
          .filter(Boolean),
      },
    };
  });

  return collect(candidates);
}

/**
 * Parses a pasted list of addresses, one per line. Accepts a bare address or
 * the `Name <address>` form that mail clients produce.
 */
export function parseEmailList(text: string): ParsedImport {
  const candidates = text
    .split(/[\r\n,]+/)
    .map((line, index) => ({ raw: line.trim(), line: index + 1 }))
    .filter((entry) => entry.raw.length > 0)
    .map((entry) => {
      const angled = entry.raw.match(/^(.*?)<([^>]+)>$/);
      return angled
        ? {
            line: entry.line,
            email: angled[2],
            rest: { name: angled[1].replace(/["']/g, "").trim() },
          }
        : { line: entry.line, email: entry.raw, rest: {} };
    });

  return collect(candidates);
}
