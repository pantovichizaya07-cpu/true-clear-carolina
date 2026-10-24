import type { Config } from "@netlify/functions";
import { asc, eq, gte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { blockedDays } from "../../db/schema.js";
import { todayET } from "../../lib/pricing.js";
import { clean, error, json, requireAdmin } from "../../lib/server.js";

export default async (req: Request) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const date = clean(body.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("Pick a date.");
    await db.insert(blockedDays).values({ date, reason: clean(body.reason, 200) }).onConflictDoNothing();
  }

  if (req.method === "DELETE") {
    const date = new URL(req.url).searchParams.get("date") ?? "";
    await db.delete(blockedDays).where(eq(blockedDays.date, date));
  }

  const rows = await db.select().from(blockedDays).where(gte(blockedDays.date, todayET())).orderBy(asc(blockedDays.date));
  return json({ days: rows.map((r) => ({ date: r.date, reason: r.reason })) });
};

export const config: Config = { path: "/api/admin/blocked-days", method: ["GET", "POST", "DELETE"] };
