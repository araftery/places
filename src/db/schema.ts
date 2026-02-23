import {
  pgTable,
  serial,
  text,
  real,
  smallint,
  timestamp,
  jsonb,
  primaryKey,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const places = pgTable("places", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  city: text("city"),
  neighborhood: text("neighborhood"),
  placeType: text("place_type"),
  cuisineType: jsonb("cuisine_type").$type<string[]>(),
  priceRange: smallint("price_range"),
  websiteUrl: text("website_url"),
  menuUrl: text("menu_url"),
  phone: text("phone"),
  status: text("status").notNull().default("want_to_try"),
  personalNotes: text("personal_notes"),
  source: text("source"),
  googlePlaceId: text("google_place_id").unique(),
  hoursJson: jsonb("hours_json"),
  hoursLastFetched: timestamp("hours_last_fetched"),
  closedPermanently: boolean("closed_permanently").default(false).notNull(),
  businessStatusCheckedAt: timestamp("business_status_checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#3b82f6"),
});

export const placeTags = pgTable(
  "place_tags",
  {
    placeId: integer("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.placeId, table.tagId] })]
);

export const placeRatings = pgTable("place_ratings", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id")
    .notNull()
    .references(() => places.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  rating: text("rating"),
  notes: text("notes"),
  ratingUrl: text("rating_url"),
  lastFetched: timestamp("last_fetched"),
});
