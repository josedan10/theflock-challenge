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
    <div className="grid gap-1">
      <label className="font-semibold" htmlFor={id}>
        {label}
      </label>
      {hint === undefined ? null : (
        <p className="m-0 text-sm text-muted" id={hintId}>
          {hint}
        </p>
      )}
      <input
        {...input}
        aria-describedby={describedBy}
        aria-invalid={errors.length > 0}
        className="min-h-11 rounded-lg border border-border px-3 py-2 aria-invalid:border-2 aria-invalid:border-danger"
        id={id}
        name={name}
      />
      {errorId === undefined ? null : (
        <ul className="m-0 list-none p-0 text-sm text-danger" id={errorId}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
