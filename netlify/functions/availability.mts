import type { Config } from "@netlify/functions";
import { and, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { blockedDays, bookings } from "../../db/schema.js";
import { SLOTS, bookableDates } from "../../lib/pricing.js";
import { json } from "../../lib/server.js";

export default async () => {
  const dates = bookableDates();
  const first = dates[0];
  const last = dates[dates.length - 1];

  const [taken, blocked] = await Promise.all([
    db
      .select({ date: bookings.date, slot: bookings.slot })
      .from(bookings)
      .where(and(gte(bookings.date, first), lte(bookings.date, last), inArray(bookings.status, ["pending", "confirmed"]))),
    db.select({ date: blockedDays.date }).from(blockedDays).where(and(gte(blockedDays.date, first), lte(blockedDays.date, last))),
  ]);

  const takenSet = new Set(taken.map((t) => `${t.date}|${t.slot}`));
  const blockedSet = new Set(blocked.map((b) => b.date));

  return json({
    days: dates.map((date) => ({
      date,
      slots: SLOTS.map((s) => ({ id: s.id, label: s.label, available: !blockedSet.has(date) && !takenSet.has(`${date}|${s.id}`) })),
    })),
  });
};

export const config: Config = { path: "/api/availability", method: "GET" };
