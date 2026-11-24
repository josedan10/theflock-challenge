/**
 * Form-level error. The `alert` role makes screen readers announce it as soon
 * as the message appears; the region stays mounted so updates are noticed.
 */
export function FormAlert({ message }: Readonly<{ message: string | null }>) {
  return (
    <div
      className="rounded-lg border-2 border-destructive p-3 text-destructive empty:hidden"
      role="alert"
    >
      {message}
    </div>
  );
}
