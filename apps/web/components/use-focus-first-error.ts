"use client";

import { type RefObject, useEffect } from "react";

import type { FormErrors } from "../lib/form-errors";

/** Moves focus to the first invalid field whenever new errors are shown. */
export function useFocusFirstError(
  formRef: RefObject<HTMLFormElement | null>,
  errors: FormErrors,
): void {
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors, formRef]);
}
