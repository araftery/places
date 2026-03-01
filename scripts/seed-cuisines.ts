import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../packages/db/src/schema.js";

const CUISINES = [
  "American",
  "Italian",
  "French",
  "Japanese",
  "Chinese",
  "Thai",
  "Korean",
  "Vietnamese",
  "Indian",
  "Mexican",
  "Mediterranean",
  "Greek",
  "Spanish",
  "Middle Eastern",
  "Turkish",
  "Ethiopian",
  "Southern",
  "Cajun/Creole",
  "Caribbean",
  "Brazilian",
  "Peruvian",
  "Seafood",
  "BBQ",
  "Pizza",
  "Sushi",
  "Ramen",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  console.log(`Seeding ${CUISINES.length} cuisines...`);

  for (const name of CUISINES) {
    await db
      .insert(schema.cuisines)
      .values({ name })
      .onConflictDoNothing();
    console.log(`  ${name}`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
