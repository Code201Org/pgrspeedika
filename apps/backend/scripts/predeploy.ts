import "../src/load-env";
import { applyMigrations, getDb, applyStorePresentation } from "@pgrs/db";
import { seedAll } from "../src/seed";
import { syncOwnerAccount } from "../src/owner-sync";

/**
 * Release step — runs as the Railway pre-deploy command (also safe by hand):
 * 1. always applies pending Drizzle migrations;
 * 2. seeds catalog + owner account when SEED_ON_DEPLOY=true (set it for the
 *    very first deploy only — the seed clears catalog tables first);
 * 3. always syncs the owner login to SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD
 *    (rotate credentials = change variables + redeploy).
 * Everything runs in-process (no child processes).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  console.log("Applying migrations …");
  await applyMigrations(url);
  console.log("Migrations applied.");

  if (process.env.SEED_ON_DEPLOY === "true") {
    const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@pgrspeedika.example";
    const ownerPassword = process.env.SEED_OWNER_PASSWORD;
    if (!ownerPassword || ownerPassword.length < 8) {
      throw new Error("SEED_ON_DEPLOY requires SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (8+ chars)");
    }
    console.log("SEED_ON_DEPLOY=true → seeding catalog and owner account");
    await seedAll(getDb(), { ownerEmail, ownerPassword });
    console.log("Seed complete — remove SEED_ON_DEPLOY before the next deploy to avoid reseeding.");
  } else {
    const ownerEmail = process.env.SEED_OWNER_EMAIL;
    const ownerPassword = process.env.SEED_OWNER_PASSWORD;
    if (ownerEmail && ownerPassword) {
      if (ownerPassword.length < 8) {
        throw new Error("SEED_OWNER_PASSWORD must be at least 8 characters");
      }
      console.log("Syncing owner account with SEED_OWNER_* variables …");
      await syncOwnerAccount(getDb(), { ownerEmail, ownerPassword });
    }
  }

  console.log("Updating catalogue photos, categories and WhatsApp contact in place …");
  await applyStorePresentation(getDb(), process.env.WEB_URL ?? "http://localhost:3000");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
