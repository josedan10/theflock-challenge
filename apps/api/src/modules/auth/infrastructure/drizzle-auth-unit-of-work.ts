import { createDrizzleSessionRepository } from "./drizzle-session-repository.js";
import { createDrizzleUserRepository } from "./drizzle-user-repository.js";

import type { Database } from "../../../platform/database/client.js";
import type { AuthUnitOfWork } from "../application/ports.js";


/** Binds every repository to the same transaction handle. */
export function createDrizzleAuthUnitOfWork(db: Database): AuthUnitOfWork {
  return {
    run: (work) =>
      db.transaction((tx) =>
        work({
          sessions: createDrizzleSessionRepository(tx),
          users: createDrizzleUserRepository(tx),
        }),
      ),
  };
}
