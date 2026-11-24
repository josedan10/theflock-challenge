import { AppError } from "../../../platform/http/errors.js";
import { ProfileNotFoundError } from "../domain/errors.js";

/** Maps profile failures onto the HTTP error envelope (AC-A03.2). */
export function mapProfileError(error: unknown): never {
  if (error instanceof ProfileNotFoundError) {
    throw new AppError("NOT_FOUND", "That profile does not exist.");
  }
  throw error;
}
