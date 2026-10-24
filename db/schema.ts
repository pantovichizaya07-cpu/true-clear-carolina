import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, date, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

// Status flow: pending -> confirmed -> completed
//              pending -> declined | cancelled, confirmed -> cancelled
export const bookings = pgTable(
  "bookings",
  {
    id: serial().primaryKey(),
    ref: text().notNull().unique(),
    accessToken: text("access_token").notNull(),
    status: text().notNull().default("pending"),

    name: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    address: text().notNull(),
    town: text().notNull(),

    service: text().notNull(),
    stories: integer().notNull().default(1),
    windows: integer().notNull(),
    screens: integer().notNull().default(0),
    firstClean: integer("first_clean").notNull().default(1),
    notes: text().notNull().default(""),

    date: date().notNull(),
    slot: text().notNull(),

    estimateCents: integer("estimate_cents").notNull(),
    finalPriceCents: integer("final_price_cents"),
    flags: text().notNull().default(""),
    customerMessage: text("customer_message").notNull().default(""),
    adminNotes: text("admin_notes").notNull().default(""),
    photoCount: integer("photo_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    // A slot can only hold one live booking at a time
    uniqueIndex("bookings_live_slot_idx")
      .on(t.date, t.slot)
      .where(sql`status in ('pending', 'confirmed')`),
    index("bookings_status_idx").on(t.status),
  ],
);

export const blockedDays = pgTable("blocked_days", {
  date: date().primaryKey(),
  reason: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
