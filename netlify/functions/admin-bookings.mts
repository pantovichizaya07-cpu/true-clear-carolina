import type { Config, Context } from "@netlify/functions";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings } from "../../db/schema.js";
import { addDays, formatDate, getService, slotLabel, todayET } from "../../lib/pricing.js";
import { clean, error, json, requireAdmin, statusUrl } from "../../lib/server.js";

type Booking = typeof bookings.$inferSelect;

function present(b: Booking, origin: string) {
  const link = statusUrl(origin, b.ref, b.accessToken);
  const when = `${formatDate(b.date, { weekday: "short", month: "short", day: "numeric" })} at ${slotLabel(b.slot)}`;
  const price = b.finalPriceCents != null ? `$${b.finalPriceCents / 100}` : `about $${b.estimateCents / 100}`;
  const first = b.name.split(" ")[0];
  const sms =
    b.status === "confirmed"
      ? `Hi ${first}, this is True Clear Carolina. You're confirmed for ${when}, ${price}. Details: ${link}`
      : b.status === "declined"
        ? `Hi ${first}, this is True Clear Carolina. Unfortunately we can't take your ${when} booking. Details: ${link}`
        : `Hi ${first}, this is True Clear Carolina about your window cleaning request for ${when}. Details: ${link}`;

  return {
    id: b.id,
    ref: b.ref,
    status: b.status,
    name: b.name,
    email: b.email,
    phone: b.phone,
    address: b.address,
    town: b.town,
    service: b.service,
    serviceName: getService(b.service)?.name ?? b.service,
    stories: b.stories,
    windows: b.windows,
    screens: b.screens,
    firstClean: b.firstClean === 1,
    notes: b.notes,
    date: b.date,
    slot: b.slot,
    slotLabel: slotLabel(b.slot),
    estimate: b.estimateCents / 100,
    finalPrice: b.finalPriceCents == null ? null : b.finalPriceCents / 100,
    flags: b.flags ? b.flags.split("\n") : [],
    customerMessage: b.customerMessage,
    adminNotes: b.adminNotes,
    photos: Array.from({ length: b.photoCount }, (_, i) => `/api/admin/photos/${b.ref}/${i + 1}`),
    createdAt: b.createdAt,
    reviewedAt: b.reviewedAt,
    statusUrl: link,
    smsBody: sms,
  };
}

async function list(view: string) {
  const today = todayET();
  switch (view) {
    case "upcoming":
      return db.select().from(bookings).where(and(eq(bookings.status, "confirmed"), gte(bookings.date, today))).orderBy(asc(bookings.date), asc(bookings.slot));
    case "past":
      return db
        .select()
        .from(bookings)
        .where(or(eq(bookings.status, "completed"), and(eq(bookings.status, "confirmed"), lt(bookings.date, today))))
        .orderBy(desc(bookings.date))
        .limit(200);
    case "closed":
      return db.select().from(bookings).where(inArray(bookings.status, ["declined", "cancelled"])).orderBy(desc(bookings.updatedAt)).limit(200);
    default:
      return db.select().from(bookings).where(eq(bookings.status, "pending")).orderBy(asc(bookings.date), asc(bookings.slot));
  }
}

async function stats() {
  const today = todayET();
  const monthAgo = addDays(today, -30);
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending')`,
      upcoming: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed' and ${bookings.date} >= ${today})`,
      upcomingValue: sql<number>`coalesce(sum(coalesce(${bookings.finalPriceCents}, ${bookings.estimateCents})) filter (where ${bookings.status} = 'confirmed' and ${bookings.date} >= ${today}), 0)`,
      toClose: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed' and ${bookings.date} < ${today})`,
      earned30: sql<number>`coalesce(sum(coalesce(${bookings.finalPriceCents}, ${bookings.estimateCents})) filter (where ${bookings.status} = 'completed' and ${bookings.date} >= ${monthAgo}), 0)`,
    })
    .from(bookings);
  return {
    pending: Number(row.pending),
    upcoming: Number(row.upcoming),
    upcomingValue: Number(row.upcomingValue) / 100,
    toClose: Number(row.toClose),
    earned30: Number(row.earned30) / 100,
  };
}

async function act(id: number, body: Record<string, unknown>): Promise<Response | Booking> {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!b) return error("Booking not found.", 404);

  const action = clean(body.action, 20);
  const message = clean(body.message, 1000);
  const now = new Date();
  let patch: Partial<Booking>;

  switch (action) {
    case "confirm": {
      if (!["pending", "confirmed"].includes(b.status)) return error(`Can't confirm a ${b.status} booking.`);
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0 || price > 10000) return error("Enter a price in dollars, like 145.");
      patch = { status: "confirmed", finalPriceCents: Math.round(price * 100), customerMessage: message, reviewedAt: now };
      break;
    }
    case "decline":
      if (!["pending", "confirmed"].includes(b.status)) return error(`Can't decline a ${b.status} booking.`);
      if (!message) return error("Add a short reason for the customer.");
      patch = { status: "declined", customerMessage: message, reviewedAt: now };
      break;
    case "complete":
      if (b.status !== "confirmed") return error("Only confirmed bookings can be marked completed.");
      patch = { status: "completed", ...(Number(body.price) > 0 ? { finalPriceCents: Math.round(Number(body.price) * 100) } : {}) };
      break;
    case "cancel":
      if (!["pending", "confirmed"].includes(b.status)) return error(`Can't cancel a ${b.status} booking.`);
      patch = { status: "cancelled", ...(message ? { customerMessage: message } : {}) };
      break;
    case "reopen":
      if (!["declined", "cancelled"].includes(b.status)) return error("Only declined or cancelled bookings can be reopened.");
      patch = { status: "pending" };
      break;
    case "notes":
      patch = { adminNotes: clean(body.adminNotes, 2000) };
      break;
    default:
      return error("Unknown action.");
  }

  try {
    const [updated] = await db.update(bookings).set({ ...patch, updatedAt: now }).where(eq(bookings.id, id)).returning();
    return updated;
  } catch (e) {
    if (/unique|23505/i.test(String((e as { code?: string }).code ?? e))) {
      return error("That time slot has been taken by another booking since this one was closed.", 409);
    }
    throw e;
  }
}

export default async (req: Request, context: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;
  const origin = new URL(req.url).origin;

  if (req.method === "POST") {
    const id = Number(context.params.id);
    if (!Number.isInteger(id)) return error("Missing booking id.");
    const body = await req.json().catch(() => ({}));
    const result = await act(id, body);
    if (result instanceof Response) return result;
    return json({ booking: present(result, origin), stats: await stats() });
  }

  const view = new URL(req.url).searchParams.get("view") ?? "review";
  const [rows, s] = await Promise.all([list(view), stats()]);
  return json({ view, stats: s, bookings: rows.map((b) => present(b, origin)) });
};

export const config: Config = { path: ["/api/admin/bookings", "/api/admin/bookings/:id"], method: ["GET", "POST"] };
