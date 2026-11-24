/** Identifier fields whose uniqueness is enforced case-insensitively. */
export type IdentityField = "email" | "username";

/**
 * Raised when a registration collides with an existing email or username.
 * The HTTP layer maps it to `409 CONFLICT` with a field-level error (AC-A01.2).
 */
export class IdentityConflictError extends Error {
  override readonly name = "IdentityConflictError";

  constructor(readonly field: IdentityField) {
    super(`The ${field} is already in use.`);
  }
}
