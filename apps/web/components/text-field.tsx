import type { ComponentProps } from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type InputProps = Omit<
  ComponentProps<typeof Input>,
  "aria-describedby" | "aria-invalid" | "id" | "name"
>;

export interface TextFieldProps extends InputProps {
  name: string;
  label: string;
  hint?: string;
  errors?: string[] | undefined;
}

/**
 * A labelled text input composed from shadcn's Field parts. The hint and the
 * errors are linked to the input with `aria-describedby`, so screen readers
 * announce them with the field.
 */
export function TextField({
  errors = [],
  hint,
  label,
  name,
  ...input
}: TextFieldProps) {
  const id = `field-${name}`;
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = errors.length === 0 ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...input}
        aria-describedby={describedBy}
        aria-invalid={errors.length > 0}
        id={id}
        name={name}
      />
      {hint === undefined ? null : (
        <FieldDescription id={hintId}>{hint}</FieldDescription>
      )}
      <FieldError
        errors={errors.map((message) => ({ message }))}
        id={errorId}
      />
    </Field>
  );
}
