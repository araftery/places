import { task, logger } from "@trigger.dev/sdk";
import { db } from "@places/db";
import { places } from "@places/db/schema";
import { eq } from "drizzle-orm";
import {
  detectReservationProvider,
  type PlaceInfo,
  type InfatuationReservationData,
} from "../providers/reservation-detect";
import { generateSessionId } from "../utils/clients";
import { extractError } from "../utils/errors";

interface DetectReservationPayload {
  placeId: number;
  name: string;
  lat: number;
  lng: number;
  websiteUrl: string | null;
  infatuationReservationPlatform?: string | null;
  infatuationReservationUrl?: string | null;
}

/**
 * Parse a human-readable time string into HH:MM:SS format for Postgres time column.
 * Handles: "midnight", "noon", "9 AM", "9AM", "10:00 AM", "2:30 PM", etc.
 * Returns null for unrecognized formats.
 */
function parseTimeString(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim().toLowerCase();

  if (trimmed === "midnight") return "00:00:00";
  if (trimmed === "noon") return "12:00:00";

  // Match patterns like "9 AM", "9AM", "10:00 AM", "2:30 PM", "10:00AM"
  const match = trimmed.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)$/
  );
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3].replace(/\./g, "");

  if (hours < 1 || hours > 12) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (period === "am") {
    if (hours === 12) hours = 0;
  } else {
    // pm
    if (hours !== 12) hours += 12;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export const detectReservationTask = task({
  id: "detect-reservation",
  queue: { name: "reservation", concurrencyLimit: 3 },
  run: async (payload: DetectReservationPayload) => {
    const { placeId } = payload;
    logger.info("Starting reservation detection", {
      placeId,
      name: payload.name,
    });

    const place: PlaceInfo = {
      id: placeId,
      name: payload.name,
      lat: payload.lat,
      lng: payload.lng,
      websiteUrl: payload.websiteUrl,
    };

    const infatuationData: InfatuationReservationData | undefined =
      payload.infatuationReservationPlatform ||
      payload.infatuationReservationUrl
        ? {
            reservationPlatform: payload.infatuationReservationPlatform,
            reservationUrl: payload.infatuationReservationUrl,
          }
        : undefined;

    const sessionId = generateSessionId();

    try {
      logger.info("Calling detectReservationProvider", {
        placeId,
        name: payload.name,
        websiteUrl: payload.websiteUrl,
        hasInfatuationPlatform: !!payload.infatuationReservationPlatform,
        hasInfatuationUrl: !!payload.infatuationReservationUrl,
      });

      const result = await detectReservationProvider(
        place,
        sessionId,
        infatuationData
      );

      logger.info("Detection result received", {
        placeId,
        provider: result.provider,
        externalId: result.externalId,
        url: result.url,
        source: result.source,
        openingWindowDays: result.openingWindowDays,
        openingTime: result.openingTime,
        openingPattern: result.openingPattern,
        lastAvailableDate: result.lastAvailableDate,
        signals: result.signals,
      });

      const parsedTime = parseTimeString(result.openingTime);
      logger.info("Parsed opening time", { raw: result.openingTime, parsed: parsedTime });

      const status: string = result.provider
        ? "success"
        : "no_provider";

      const dbUpdate = {
        reservationProvider: result.provider,
        reservationExternalId: result.externalId,
        reservationUrl: result.url,
        openingWindowDays: result.openingWindowDays,
        openingTime: parsedTime,
        openingPattern: result.openingPattern,
        lastAvailableDate: result.lastAvailableDate,
        lastReservationCheck: new Date(),
        lastSuccessfulReservationCheck: new Date(),
        lastReservationCheckStatus: status,
        reservationNotes: result.signals.length > 0
          ? result.signals.join("\n")
          : null,
        updatedAt: new Date(),
      };

      logger.info("Writing to DB", { placeId, dbUpdate: { ...dbUpdate, reservationNotes: `${result.signals.length} signals` } });

      await db
        .update(places)
        .set(dbUpdate)
        .where(eq(places.id, placeId));

      logger.info("Reservation detection complete — DB updated", {
        placeId,
        provider: result.provider,
        externalId: result.externalId,
        url: result.url,
        openingWindowDays: result.openingWindowDays,
        openingTime: parsedTime,
        openingPattern: result.openingPattern,
        lastAvailableDate: result.lastAvailableDate,
        status,
        signalCount: result.signals.length,
      });
    } catch (err) {
      const { fullMessage } = extractError(err);
      logger.error("Reservation detection failed", {
        placeId,
        error: fullMessage,
      });

      // Still record the check attempt
      try {
        await db
          .update(places)
          .set({
            lastReservationCheck: new Date(),
            lastReservationCheckStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(places.id, placeId));
      } catch (updateErr) {
        logger.error("Failed to update reservation check status", {
          placeId,
          error: extractError(updateErr).fullMessage,
        });
      }

      throw err;
    }
  },
});
