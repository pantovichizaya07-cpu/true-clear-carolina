import type { Config, Context } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings } from "../../db/schema.js";
import { getService, slotLabel } from "../../lib/pricing.js";
import { error, json } from "../../lib/server.js";

async function findBooking(req: Request, ref: string) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token) return null;
  const [row] = await db.select().from(bookings).where(and(eq(bookings.ref, ref), eq(bookings.accessToken, token)));
  return row ?? null;
}

export default async (req: Request, context: Context) => {
  const booking = await findBooking(req, context.params.ref);
  if (!booking) return error("We couldn't find that booking. Check the link and try again.", 404);

  if (req.method === "POST") {
    const { action } = await req.json().catch(() => ({}));
    if (action !== "cancel") return error("Unknown action.");
    if (!["pending", "confirmed"].includes(booking.status)) return error("This booking can't be cancelled.");
    await db.update(bookings).set({ status: "cancelled", updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    booking.status = "cancelled";
  }

  return json({
    ref: booking.ref,
    status: booking.status,
    name: booking.name.split(" ")[0],
    service: getService(booking.service)?.name ?? booking.service,
    date: booking.date,
    slot: booking.slot,
    slotLabel: slotLabel(booking.slot),
    address: `${booking.address}, ${booking.town}`,
    windows: booking.windows,
    estimate: booking.estimateCents / 100,
    finalPrice: booking.finalPriceCents == null ? null : booking.finalPriceCents / 100,
    message: booking.customerMessage,
  });
};

export const config: Config = { path: "/api/booking/:ref", method: ["GET", "POST"] };
