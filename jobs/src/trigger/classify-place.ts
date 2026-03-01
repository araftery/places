import { task, logger } from "@trigger.dev/sdk";
import { db } from "@places/db";
import { places, placeRatings, cuisines, placeCuisines } from "@places/db/schema";
import { eq, and } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PLACE_TYPE_DEFINITIONS = [
  { type: "fine_dining", description: "Upscale restaurant, tasting menus, prix fixe, elevated service" },
  { type: "casual_dining", description: "Sit-down restaurant, table service, not upscale" },
  { type: "fast_casual", description: "Counter service, quick meals, Sweetgreen/Chipotle tier" },
  { type: "deli", description: "Sandwich shops, delis, bodega-style food" },
  { type: "cocktail_bar", description: "Craft cocktails focus, mixology-oriented" },
  { type: "wine_bar", description: "Wine-focused bar, wine list is the draw" },
  { type: "dive_bar", description: "No-frills bar, cheap drinks, casual" },
  { type: "sports_bar", description: "TVs, game day crowd, pub food" },
  { type: "pub", description: "British-style pub, gastropub, beer focus" },
  { type: "brewery", description: "Brewery or taproom, makes their own beer" },
  { type: "cafe", description: "Coffee shop, daytime hours, light food" },
  { type: "bakery", description: "Bread, pastry, baked goods focus" },
  { type: "night_club", description: "Late-night dancing, DJ, club scene" },
  { type: "retail", description: "Shop, store, non-food retail" },
  { type: "tourist_site", description: "Attraction, museum, landmark, park" },
  { type: "food_truck", description: "Mobile food vendor, food stand" },
  { type: "other", description: "Doesn't fit any category" },
];

const SYSTEM_PROMPT = `You are classifying a restaurant/bar/venue into a specific place type and cuisine categories.

You will be given the place name, address, neighborhood, Google's raw place type, and review excerpts from multiple sources.

You may also use Google Search to look up additional information about the place.

## Place Type Taxonomy

Choose exactly ONE place type from this list:
${PLACE_TYPE_DEFINITIONS.map((d) => `- "${d.type}": ${d.description}`).join("\n")}

## Cuisine Classification

Assign one or more cuisines from this list (or suggest new ones if none fit):
American, Italian, French, Japanese, Chinese, Thai, Korean, Vietnamese, Indian, Mexican, Mediterranean, Greek, Spanish, Middle Eastern, Turkish, Ethiopian, Southern, Cajun/Creole, Caribbean, Brazilian, Peruvian, Seafood, BBQ, Pizza, Sushi, Ramen

Guidelines:
- Only assign cuisines that are genuinely relevant. A generic American bar doesn't need a cuisine.
- Bars, cafes, bakeries, retail, and tourist sites usually have NO cuisines — leave the array empty.
- If a restaurant clearly specializes (e.g., a sushi restaurant), include that specific cuisine.
- You may suggest a cuisine not in the list if it's clearly needed (e.g., "Georgian", "Filipino"). Keep suggestions to established cuisine categories.

## Response Format

You MUST respond with ONLY a valid JSON object, no markdown, no code blocks, no extra text:
{"placeType": "casual_dining", "cuisines": ["Italian", "Pizza"], "reasoning": "Based on reviews..."}

If the place is a bar/cafe/retail/tourist site with no relevant cuisine, use an empty array:
{"placeType": "cocktail_bar", "cuisines": [], "reasoning": "This is a cocktail bar..."}`;

interface ClassifyResult {
  placeType: string;
  cuisines: string[];
  reasoning: string;
}

function buildUserPrompt(
  place: {
    name: string;
    address: string | null;
    neighborhood: string | null;
    googlePlaceType: string | null;
  },
  reviews: { source: string; notes: string | null }[]
): string {
  const parts = [
    `Place: ${place.name}`,
    place.address ? `Address: ${place.address}` : null,
    place.neighborhood ? `Neighborhood: ${place.neighborhood}` : null,
    place.googlePlaceType ? `Google Place Type: ${place.googlePlaceType}` : null,
  ].filter(Boolean);

  const reviewParts = reviews
    .filter((r) => r.notes)
    .map((r) => {
      const truncated = r.notes!.length > 500 ? r.notes!.slice(0, 500) + "..." : r.notes!;
      return `[${r.source}]: ${truncated}`;
    });

  if (reviewParts.length > 0) {
    parts.push("", "## Review Excerpts", ...reviewParts);
  }

  return parts.join("\n");
}

function parseGeminiResponse(text: string): ClassifyResult {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned);

  const validTypes = PLACE_TYPE_DEFINITIONS.map((d) => d.type);
  if (!validTypes.includes(parsed.placeType)) {
    throw new Error(`Invalid placeType: ${parsed.placeType}`);
  }

  return {
    placeType: parsed.placeType,
    cuisines: Array.isArray(parsed.cuisines) ? parsed.cuisines : [],
    reasoning: parsed.reasoning || "",
  };
}

export const classifyPlaceTask = task({
  id: "classify-place",
  queue: { name: "classification", concurrencyLimit: 10 },
  run: async (payload: { placeId: number }) => {
    const { placeId } = payload;
    logger.info("Starting place classification", { placeId });

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      logger.error("GEMINI_API_KEY not set");
      return;
    }

    // 1. Fetch place data
    const [place] = await db
      .select()
      .from(places)
      .where(eq(places.id, placeId));

    if (!place) {
      logger.error("Place not found", { placeId });
      return;
    }

    // 2. Fetch ratings/reviews
    const ratings = await db
      .select({ source: placeRatings.source, notes: placeRatings.notes })
      .from(placeRatings)
      .where(eq(placeRatings.placeId, placeId));

    // 3. Build prompt
    const userPrompt = buildUserPrompt(
      {
        name: place.name,
        address: place.address,
        neighborhood: place.neighborhood,
        googlePlaceType: place.googlePlaceType,
      },
      ratings
    );

    logger.info("Calling Gemini for classification", {
      placeId,
      placeName: place.name,
      googlePlaceType: place.googlePlaceType,
      reviewSources: ratings.filter((r) => r.notes).map((r) => r.source),
    });

    // 4. Call Gemini with Google Search grounding
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      tools: [
        { googleSearch: {} } as any, // googleSearch type not in @google/generative-ai v0.24.1 typedefs
      ],
      systemInstruction: SYSTEM_PROMPT,
    });

    const geminiResult = await model.generateContent(userPrompt);
    const responseText = geminiResult.response.text();
    logger.info("Gemini response", { placeId, responseText });

    // 5. Parse response
    let classification: ClassifyResult;
    try {
      classification = parseGeminiResponse(responseText);
    } catch (err) {
      logger.error("Failed to parse Gemini response", {
        placeId,
        responseText,
        error: String(err),
      });
      return;
    }

    logger.info("Classification result", {
      placeId,
      placeName: place.name,
      placeType: classification.placeType,
      cuisines: classification.cuisines,
      reasoning: classification.reasoning,
    });

    // 6. Update place type
    await db
      .update(places)
      .set({
        placeType: classification.placeType,
        updatedAt: new Date(),
      })
      .where(eq(places.id, placeId));

    // 7. Add cuisines (additive — don't delete existing ones)
    if (classification.cuisines.length > 0) {
      for (const cuisineName of classification.cuisines) {
        // Upsert cuisine (auto-grow the table)
        let [cuisine] = await db
          .select()
          .from(cuisines)
          .where(eq(cuisines.name, cuisineName));

        if (!cuisine) {
          [cuisine] = await db
            .insert(cuisines)
            .values({ name: cuisineName })
            .onConflictDoNothing()
            .returning();

          // Handle race condition: if onConflictDoNothing returned nothing, re-fetch
          if (!cuisine) {
            [cuisine] = await db
              .select()
              .from(cuisines)
              .where(eq(cuisines.name, cuisineName));
          }

          if (cuisine) {
            logger.info("Created new cuisine", { cuisineName });
          }
        }

        if (cuisine) {
          await db
            .insert(placeCuisines)
            .values({ placeId, cuisineId: cuisine.id })
            .onConflictDoNothing();
        }
      }
    }

    logger.info("Classification complete", {
      placeId,
      placeName: place.name,
      placeType: classification.placeType,
      cuisines: classification.cuisines,
    });
  },
});
