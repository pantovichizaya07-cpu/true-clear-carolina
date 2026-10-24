import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings } from "../../db/schema.js";
import { error, json } from "../../lib/server.js";

const MAX_PHOTOS = 8;
const MAX_BYTES = 4 * 1024 * 1024;

export default async (req: Request, context: Context) => {
  const ref = context.params.ref;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.ref, ref), eq(bookings.accessToken, token)));
  if (!booking) return error("Booking not found.", 404);
  if (booking.photoCount >= MAX_PHOTOS) return error(`Up to ${MAX_PHOTOS} photos per booking.`);

  const type = req.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return error("Photos must be JPEG, PNG or WebP.");
  const data = await req.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_BYTES) return error("That photo is too large.");

  // Atomically claim the next photo number
  const [{ n }] = await db
    .update(bookings)
    .set({ photoCount: sql`${bookings.photoCount} + 1` })
    .where(eq(bookings.id, booking.id))
    .returning({ n: bookings.photoCount });

  await getStore("booking-photos").set(`${ref}/${n}`, data, { metadata: { contentType: type } });
  return json({ ok: true, n }, 201);
};

export const config: Config = { path: "/api/booking/:ref/photos", method: "POST" };
