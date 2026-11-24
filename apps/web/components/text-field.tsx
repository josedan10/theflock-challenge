import type { InputHTMLAttributes } from "react";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "aria-describedby" | "aria-invalid" | "id" | "name"
>;

export interface TextFieldProps extends InputProps {
  name: string;
  label: string;
  hint?: string;
  errors?: string[] | undefined;
}

/**
 * Labelled input whose hint and errors are linked with `aria-describedby`,
 * so screen readers announce them with the field.
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
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint === undefined ? null : (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      <input
        {...input}
        aria-describedby={describedBy}
        aria-invalid={errors.length > 0}
        id={id}
        name={name}
      />
      {errorId === undefined ? null : (
        <ul className="field-error" id={errorId}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
