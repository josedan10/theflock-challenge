import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import postgres from "postgres";

import { createArgon2PasswordHasher } from "../src/modules/auth/infrastructure/argon2-password-hasher.js";
import { createDatabase } from "../src/platform/database/client.js";

import { demoCount, seedDemo } from "./demo-data.js";
import { localTarget } from "./local-target.js";

const passwordFile = new URL("../../../.env.seed-password", import.meta.url);

async function run() {
  const count = demoCount(process.env.SEED_USER_COUNT);
  const pool = postgres(
    localTarget(process.env.DATABASE_URL, process.env.NODE_ENV),
  );
  try {
    try {
      await writeFile(passwordFile, randomBytes(24).toString("hex") + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    const password = (await readFile(passwordFile, "utf8")).trim();
    if (!/^[a-f0-9]{48}$/.test(password)) {
      throw new Error("Invalid local seed password file.");
    }
    const hasher = createArgon2PasswordHasher();
    const [previous] = await pool<
      { password_hash: string }[]
    >`select password_hash from users where username='demo_1'`;
    if (previous && !(await hasher.verify(previous.password_hash, password))) {
      throw new Error("Local credentials do not match the existing demo.");
    }
    await seedDemo(createDatabase(pool), count, await hasher.hash(password));
    console.log(
      `Seeded ${count} demo accounts. Login: demo_1@example.test; password: repository-root .env.seed-password`,
    );
  } finally {
    await pool.end();
  }
}
run().catch(() => {
  console.error(
    "Local seed failed. Check the development database, migrations, demo names, count (10–100), and .env.seed-password. No seed rows were committed.",
  );
  process.exitCode = 1;
});
