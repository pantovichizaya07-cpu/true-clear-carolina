import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { blockedDays, bookings } from "../../db/schema.js";
import { MAX_WINDOWS, SLOTS, TOWNS, bookableDates, getService, quote } from "../../lib/pricing.js";
import { clean, error, json, newRef, newToken, statusUrl } from "../../lib/server.js";

export default async (req: Request) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid request.");
  }

  // Honeypot: real people never fill this in
  if (clean(body.company)) return json({ ok: true, ref: "TCC-THANKS" });

  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const address = clean(body.address, 300);
  const town = clean(body.town, 80);
  const notes = clean(body.notes, 2000);
  const service = getService(clean(body.service, 40));
  const date = clean(body.date, 10);
  const slot = clean(body.slot, 5);
  const windows = Math.round(Number(body.windows));
  const stories = Math.round(Number(body.stories) || 1);
  const screens = Math.round(Number(body.screens) || 0);
  const firstClean = body.firstClean !== false;

  if (!name) return error("Please enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return error("Please enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 10) return error("Please enter a phone number we can text.");
  if (!address) return error("Please enter your street address.");
  if (!TOWNS.includes(town)) return error("Please choose your town.");
  if (!service) return error("Please choose a service.");
  if (!Number.isFinite(windows) || windows < 1 || windows > MAX_WINDOWS) return error("Please enter how many windows you have.");
  if (stories < 1 || stories > 3) return error("Please choose how many stories your home has.");
  if (screens < 0 || screens > MAX_WINDOWS) return error("Please check the number of screens.");
  if (!bookableDates().includes(date)) return error("That date isn't available. Please pick another day.");
  if (!SLOTS.some((s) => s.id === slot)) return error("Please pick a time.");

  const [blocked] = await db.select().from(blockedDays).where(eq(blockedDays.date, date));
  if (blocked) return error("Sorry, we're not booking that day. Please pick another.", 409);

  const q = quote({ service: service.id, windows, stories, screens, firstClean, town });
  const ref = newRef();
  const token = newToken();

  try {
    await db.insert(bookings).values({
      ref,
      accessToken: token,
      name,
      email,
      phone,
      address,
      town,
      service: service.id,
      stories,
      windows,
      screens,
      firstClean: firstClean ? 1 : 0,
      notes,
      date,
      slot,
      estimateCents: q.total * 100,
      flags: q.flags.join("\n"),
    });
  } catch (e) {
    // Unique index on live (date, slot) — someone else grabbed it first
    if (String((e as { code?: string }).code ?? e).includes("23505") || /unique/i.test(String(e))) {
      return error("Someone just booked that time. Please pick another slot.", 409);
    }
    throw e;
  }

  const origin = new URL(req.url).origin;
  return json({ ok: true, ref, token, estimate: q.total, statusUrl: statusUrl(origin, ref, token) }, 201);
};

export const config: Config = { path: "/api/bookings", method: "POST" };
