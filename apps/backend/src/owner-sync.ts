import { and, eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Database } from "@pgrs/db";
import { schema } from "@pgrs/db";
import { createAuth } from "@pgrs/auth";

/**
 * Keep the owner login in sync with SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD:
 * rotate the password, rename the email or create the owner on a fresh
 * database — without touching catalog data. Runs on every deploy, so
 * changing the credentials is just a variable change + redeploy.
 */
export async function syncOwnerAccount(
  db: Database,
  options: { ownerEmail: string; ownerPassword: string },
): Promise<void> {
  const { ownerEmail, ownerPassword } = options;

  // Never let a customer account shadow the owner login email.
  const [existingByEmail] = await db.select().from(schema.user).where(eq(schema.user.email, ownerEmail));
  if (existingByEmail && existingByEmail.role !== "owner") {
    throw new Error(`SEED_OWNER_EMAIL is already used by a ${existingByEmail.role} account`);
  }

  let owner = existingByEmail ?? null;
  if (!owner) {
    // First owner by creation time (the seed creates exactly one).
    const owners = await db.select().from(schema.user).where(eq(schema.user.role, "owner"));
    owner = owners.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  }

  if (!owner) {
    console.log("No owner account found — creating one …");
    const auth = createAuth({
      db,
      secret: process.env.BETTER_AUTH_SECRET ?? "",
      baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
      sendOtp: async () => {},
    });
    const result = await auth.api.signUpEmail({
      body: { name: "PGRS Owner", email: ownerEmail, password: ownerPassword },
    });
    const ownerUserId = result.user?.id;
    if (!ownerUserId) throw new Error("Failed to create owner account");
    await db
      .update(schema.user)
      .set({ role: "owner", emailVerified: true })
      .where(eq(schema.user.id, ownerUserId));
    console.log(`Owner created → ${ownerEmail}`);
    return;
  }

  const changes: string[] = [];

  if (owner.email !== ownerEmail) {
    await db
      .update(schema.user)
      .set({ email: ownerEmail, emailVerified: true, updatedAt: new Date() })
      .where(eq(schema.user.id, owner.id));
    changes.push(`email ${owner.email} → ${ownerEmail}`);
  }

  const [credential] = await db
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.userId, owner.id), eq(schema.account.providerId, "credential")));

  const passwordVerified = credential?.password
    ? await verifyPassword({ hash: credential.password, password: ownerPassword })
    : false;

  if (credential && passwordVerified) {
    if (changes.length === 0) console.log("Owner credentials already up to date.");
    else console.log(`Owner updated: ${changes.join(", ")}`);
    return;
  }

  const hashed = await hashPassword(ownerPassword);
  if (credential) {
    await db
      .update(schema.account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(schema.account.id, credential.id));
  } else {
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      accountId: owner.id,
      providerId: "credential",
      userId: owner.id,
      password: hashed,
    });
  }
  // Password rotation revokes every signed-in device.
  await db.delete(schema.session).where(eq(schema.session.userId, owner.id));
  changes.push("password rotated (sessions signed out)");
  console.log(`Owner updated: ${changes.join(", ")}`);
}
