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
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const cities = pgTable(
  "cities",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    country: text("country").notNull().default("US"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    providers: jsonb("providers").$type<string[]>().notNull().default(["google"]),
    infatuationSlug: text("infatuation_slug"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("cities_name_country_idx").on(table.name, table.country)]
);

export const places = pgTable("places", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  cityId: integer("city_id").references(() => cities.id),
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
  closedPermanently: boolean("closed_permanently").default(false).notNull(),
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
  externalId: text("external_id"),
  rating: real("rating"),
  ratingMax: real("rating_max"),
  notes: text("notes"),
  reviewCount: integer("review_count"),
  ratingUrl: text("rating_url"),
  reviewDate: timestamp("review_date"),
  lastFetched: timestamp("last_fetched"),
});

export const placeAudits = pgTable(
  "place_audits",
  {
    id: serial("id").primaryKey(),
    placeId: integer("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    lastAuditedAt: timestamp("last_audited_at"),
    nextAuditAt: timestamp("next_audit_at"),
    status: text("status").default("pending"),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("place_audits_place_provider_idx").on(
      table.placeId,
      table.provider
    ),
  ]
);
