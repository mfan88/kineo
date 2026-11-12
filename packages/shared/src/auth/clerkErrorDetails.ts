import type { ClerkErrorLike } from "./signInErrors";

/**
 * The code and message from whatever Clerk threw or returned. Clerk's v6 errors wrap
 * the API's own code and message in `errors[0]`; plain errors carry them directly.
 */
export function clerkErrorDetails(error: unknown): ClerkErrorLike {
  if (typeof error !== "object" || error === null) return {};
  const wrapped =
    "errors" in error && Array.isArray(error.errors) ? (error.errors[0] as unknown) : undefined;
  const source = typeof wrapped === "object" && wrapped !== null ? wrapped : error;
  const code = "code" in source && typeof source.code === "string" ? source.code : undefined;
  const message =
    "message" in source && typeof source.message === "string" ? source.message : undefined;
  return { code, message };
}
