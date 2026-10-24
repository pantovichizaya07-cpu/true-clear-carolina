// Shared by the booking form (live estimate) and the API (authoritative estimate).

export type ServiceId = "exterior" | "full" | "club-monthly" | "club-bimonthly" | "club-quarterly";

export interface Service {
  id: ServiceId;
  name: string;
  short: string;
  oneTime: boolean;
}

export const SERVICES: Service[] = [
  { id: "full", name: "Full In & Out", short: "Inside + outside glass, sills and frames", oneTime: true },
  { id: "exterior", name: "Exterior Only", short: "All outside glass, frames wiped", oneTime: true },
  { id: "club-monthly", name: "Shine Club — Monthly", short: "Exterior every month, free screens", oneTime: false },
  { id: "club-bimonthly", name: "Shine Club — Every 2 Months", short: "Exterior every 2 months", oneTime: false },
  { id: "club-quarterly", name: "Shine Club — Quarterly", short: "Full in & out every 3 months", oneTime: false },
];

export const TOWNS = ["Lexington", "Thomasville", "Burlington", "High Point", "Welcome", "Other nearby town"];
export const CORE_TOWNS = ["Lexington", "Thomasville", "Burlington"];

export const SLOTS = [
  { id: "08:00", label: "8:00 AM" },
  { id: "10:30", label: "10:30 AM" },
  { id: "13:00", label: "1:00 PM" },
  { id: "15:30", label: "3:30 PM" },
];

export const FIRST_CLEAN_DISCOUNT = 0.2;
export const SCREEN_PRICE = 3;
export const SECOND_STORY_FEE = 25;
export const BOOKING_WINDOW_DAYS = 42;
export const MAX_WINDOWS = 150;

export interface QuoteInput {
  service: ServiceId;
  windows: number;
  stories: number;
  screens: number;
  firstClean: boolean;
  town?: string;
}

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface Quote {
  lines: QuoteLine[];
  total: number;
  flags: string[];
}

const CLUB_BASE: Record<string, { price: number; included: number; extra: number }> = {
  "club-monthly": { price: 79, included: 25, extra: 3 },
  "club-bimonthly": { price: 99, included: 25, extra: 4 },
  "club-quarterly": { price: 129, included: 20, extra: 6 },
};

export function getService(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}

export function quote(input: QuoteInput): Quote {
  const windows = Math.max(1, Math.round(input.windows || 0));
  const screens = Math.max(0, Math.round(input.screens || 0));
  const stories = Math.max(1, Math.round(input.stories || 1));
  const service = getService(input.service) ?? SERVICES[0];
  const lines: QuoteLine[] = [];
  const flags: string[] = [];

  if (service.oneTime) {
    const base = service.id === "full" ? Math.max(149, windows * 12) : Math.max(99, windows * 7);
    lines.push({ label: `${service.name} · ${windows} windows`, amount: base });
    if (stories >= 2) lines.push({ label: "Second-story pole work", amount: SECOND_STORY_FEE });
    if (input.firstClean) {
      const clean = lines.reduce((sum, l) => sum + l.amount, 0);
      lines.push({ label: "First-clean coupon (20% off)", amount: -Math.round(clean * FIRST_CLEAN_DISCOUNT) });
    }
    if (screens > 0) lines.push({ label: `Screen cleaning · ${screens} × $${SCREEN_PRICE}`, amount: screens * SCREEN_PRICE });
  } else {
    const plan = CLUB_BASE[service.id];
    lines.push({ label: `${service.name} · per visit`, amount: plan.price });
    if (windows > plan.included) {
      lines.push({ label: `${windows - plan.included} windows over ${plan.included}`, amount: (windows - plan.included) * plan.extra });
    }
    if (stories >= 2) lines.push({ label: "Second-story pole work", amount: SECOND_STORY_FEE });
    if (screens > 0) {
      const free = service.id === "club-monthly";
      lines.push({ label: `Screen cleaning · ${screens}${free ? " (included)" : ` × $${SCREEN_PRICE}`}`, amount: free ? 0 : screens * SCREEN_PRICE });
    }
  }

  if (stories >= 3) flags.push("3+ stories — may need a ladder (we don't use ladders)");
  if (windows > 40) flags.push("Large home — check photos before confirming price");
  if (input.town && !CORE_TOWNS.includes(input.town)) flags.push("Outside core service area — check drive distance");

  return { lines, total: Math.max(0, lines.reduce((sum, l) => sum + l.amount, 0)), flags };
}

export function formatMoney(dollars: number): string {
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function slotLabel(id: string): string {
  return SLOTS.find((s) => s.id === id)?.label ?? id;
}

// Dates are handled as YYYY-MM-DD strings in America/New_York.
export function todayET(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWorkday(iso: string): boolean {
  return dayOfWeek(iso) !== 0;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function bookableDates(now = new Date()): string[] {
  const start = addDays(todayET(now), 1);
  const out: string[] = [];
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i++) {
    const day = addDays(start, i);
    if (isWorkday(day)) out.push(day);
  }
  return out;
}
