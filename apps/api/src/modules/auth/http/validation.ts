import { AppError } from "../../../platform/http/errors.js";

import type { z } from "zod";

/** Groups Zod issues by top-level field for the contract's `fields` map. */
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? "body" : String(issue.path[0]);
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

/**
 * Parses a request body with a shared contract schema.
 *
 * @throws {AppError} `VALIDATION_ERROR` (422) with per-field messages.
 */
export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Some fields are invalid.",
      fieldErrors(parsed.error),
    );
  }
  return parsed.data;
}
