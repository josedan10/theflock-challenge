import { ApiError } from "./api-client";

import type { z } from "zod";

export type FieldErrors = Record<string, string[]>;

export interface FormErrors {
  fields: FieldErrors;
  /** Message for the whole form, announced to assistive technology. */
  form: string | null;
}

export const NO_ERRORS: FormErrors = { fields: {}, form: null };

/** Groups local validation issues by top-level field, like the API does. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

/**
 * Translates a failed request into form errors. Field messages come from the
 * API; the form-level message never adds detail the API did not give.
 */
export function apiFormErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: "Something went wrong. Please try again." };
  }
  if (error.code === "RATE_LIMITED") {
    return {
      fields: {},
      form: "Too many attempts. Wait a minute and try again.",
    };
  }
  return { fields: error.fields, form: error.message };
}
