import { cookies } from "next/headers";

/**
 * Copies the cookies an auth endpoint set onto the server action's response.
 *
 * Better Auth's `nextCookies` plugin does this for the endpoints the browser
 * calls itself, but a server action that invokes `auth.api.*` directly has its
 * own response, and the session cookie has to be moved across by hand -
 * otherwise the swap happens in the database and the browser never hears about
 * it, which is exactly what an impersonation that appears to do nothing looks
 * like.
 */
export async function applyAuthCookies(response: Response): Promise<void> {
  const jar = await cookies();

  for (const header of response.headers.getSetCookie()) {
    const parsed = parseSetCookie(header);
    if (parsed) jar.set(parsed);
  }
}

type ParsedCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

function parseSetCookie(header: string): ParsedCookie | null {
  const [pair, ...attributes] = header.split(";");
  const separator = pair.indexOf("=");
  if (separator <= 0) return null;

  const parsed: ParsedCookie = {
    name: pair.slice(0, separator).trim(),
    value: decodeURIComponent(pair.slice(separator + 1).trim()),
  };

  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();

    if (key === "path") parsed.path = value;
    else if (key === "domain") parsed.domain = value;
    else if (key === "max-age") parsed.maxAge = Number(value);
    else if (key === "expires") parsed.expires = new Date(value);
    else if (key === "httponly") parsed.httpOnly = true;
    else if (key === "secure") parsed.secure = true;
    else if (key === "samesite") {
      const mode = value.toLowerCase();
      if (mode === "lax" || mode === "strict" || mode === "none") {
        parsed.sameSite = mode;
      }
    }
  }

  return parsed;
}
