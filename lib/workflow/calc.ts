/**
 * Answers worked out from other answers.
 *
 * The paper form is full of totals that a person is asked to add up by hand -
 * total publications from the indexed and non-indexed counts, total experience
 * from the years before and after joining - and every one of them is a chance
 * to disagree with the figures above it. A field carrying a formula is
 * computed instead of typed, from the answers beside it: the other questions
 * of the same form, or the other columns of the same entry.
 *
 * The language is deliberately tiny - numbers, the four operators, brackets
 * and the keys of sibling answers - so it can be read at a glance in the
 * builder and evaluated identically in the browser and on the server. Kept
 * pure, and free of React and Zod, for that second reason above all: what the
 * applicant is shown and what is stored must be the same number.
 */

export type CalcScope = Record<string, unknown>;

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

export type CalcError = { message: string };

function tokenize(formula: string): Token[] | CalcError {
  const tokens: Token[] = [];
  let index = 0;

  while (index < formula.length) {
    const char = formula[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }

    const number = /^\d+(\.\d+)?/.exec(formula.slice(index));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }

    const name = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(formula.slice(index));
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      index += name[0].length;
      continue;
    }

    return { message: `"${char}" cannot be used in a formula.` };
  }

  return tokens;
}

/**
 * Recursive descent over the tiny grammar:
 *
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/") factor)*
 *   factor     := "-"? (number | name | "(" expression ")")
 */
function parse(tokens: Token[]): CalcNode | CalcError {
  let position = 0;

  const peek = () => tokens[position];
  const take = () => tokens[position++];

  function expression(): CalcNode | CalcError {
    let left = term();
    if ("message" in left) return left;

    while (
      peek()?.kind === "operator" &&
      (peek() as { value: string }).value.match(/[+-]/)
    ) {
      const operator = (take() as { value: "+" | "-" }).value;
      const right = term();
      if ("message" in right) return right;
      left = { kind: "binary", operator, left, right };
    }

    return left;
  }

  function term(): CalcNode | CalcError {
    let left = factor();
    if ("message" in left) return left;

    while (
      peek()?.kind === "operator" &&
      (peek() as { value: string }).value.match(/[*/]/)
    ) {
      const operator = (take() as { value: "*" | "/" }).value;
      const right = factor();
      if ("message" in right) return right;
      left = { kind: "binary", operator, left, right };
    }

    return left;
  }

  function factor(): CalcNode | CalcError {
    const token = peek();
    if (!token) return { message: "The formula ends too early." };

    if (token.kind === "operator" && token.value === "-") {
      take();
      const operand = factor();
      if ("message" in operand) return operand;
      return { kind: "negate", operand };
    }

    if (token.kind === "number") {
      take();
      return { kind: "literal", value: token.value };
    }

    if (token.kind === "name") {
      take();
      return { kind: "reference", key: token.value };
    }

    if (token.kind === "paren" && token.value === "(") {
      take();
      const inner = expression();
      if ("message" in inner) return inner;
      const closing = take();
      if (!closing || closing.kind !== "paren" || closing.value !== ")") {
        return { message: "A bracket is left open." };
      }
      return inner;
    }

    return { message: "The formula is not written correctly." };
  }

  const parsed = expression();
  if ("message" in parsed) return parsed;
  if (position < tokens.length) {
    return { message: "The formula is not written correctly." };
  }
  return parsed;
}

type CalcNode =
  | { kind: "literal"; value: number }
  | { kind: "reference"; key: string }
  | { kind: "negate"; operand: CalcNode }
  | {
      kind: "binary";
      operator: "+" | "-" | "*" | "/";
      left: CalcNode;
      right: CalcNode;
    };

export type CompiledFormula = { node: CalcNode; keys: string[] };

/** Parses once, so a form's formulas are not re-parsed on every keystroke. */
export function compileFormula(
  formula: string,
): CompiledFormula | CalcError | null {
  const trimmed = formula.trim();
  if (!trimmed) return null;

  const tokens = tokenize(trimmed);
  if ("message" in tokens) return tokens;
  if (tokens.length === 0) return null;

  const node = parse(tokens);
  if ("message" in node) return node;

  return { node, keys: collectKeys(node) };
}

function collectKeys(node: CalcNode, into: string[] = []): string[] {
  switch (node.kind) {
    case "reference":
      if (!into.includes(node.key)) into.push(node.key);
      return into;
    case "negate":
      return collectKeys(node.operand, into);
    case "binary":
      collectKeys(node.left, into);
      return collectKeys(node.right, into);
    default:
      return into;
  }
}

/** The answers a formula reads. Empty when it cannot be parsed. */
export function formulaKeys(formula: string): string[] {
  const compiled = compileFormula(formula);
  return compiled && !("message" in compiled) ? compiled.keys : [];
}

/** The complaint a formula would draw, or null when it is sound. */
export function formulaError(formula: string): string | null {
  const compiled = compileFormula(formula);
  if (compiled && "message" in compiled) return compiled.message;
  return null;
}

/**
 * Works the formula out against the answers around it.
 *
 * An answer that is missing or not a number counts as zero, so a total is
 * shown while the form is still being filled in rather than only once every
 * part of it is present. Division by zero has no answer, so it gives none.
 */
export function evaluateFormula(
  formula: string | CompiledFormula,
  scope: CalcScope,
): number | null {
  const compiled =
    typeof formula === "string" ? compileFormula(formula) : formula;
  if (!compiled || "message" in compiled) return null;

  return walk(compiled.node, scope);
}

function walk(node: CalcNode, scope: CalcScope): number | null {
  switch (node.kind) {
    case "literal":
      return node.value;

    case "reference":
      return asNumber(scope[node.key]);

    case "negate": {
      const value = walk(node.operand, scope);
      return value === null ? null : -value;
    }

    case "binary": {
      const left = walk(node.left, scope);
      const right = walk(node.right, scope);
      if (left === null || right === null) return null;

      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? null : left / right;
      }
    }
  }
}

/** Anything that is not a number reads as zero rather than stopping the sum. */
function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Rounds off the floating-point dust `0.1 + 0.2` leaves behind. Ten places is
 * far beyond anything a form of this kind counts.
 */
export function tidyNumber(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}
