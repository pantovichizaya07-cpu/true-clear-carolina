import { getUser } from "@netlify/identity";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// Only Identity users with the "admin" role may use admin endpoints.
export async function requireAdmin(): Promise<Response | null> {
  const user = await getUser();
  if (!user) return error("Please log in.", 401);
  if (!user.roles?.includes("admin")) return error("This account doesn't have admin access.", 403);
  return null;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRef(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return `TCC-${out}`;
}

export function newToken(): string {
  return btoa(String.fromCharCode(...randomBytes(18))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function statusUrl(origin: string, ref: string, token: string): string {
  return `${origin}/booking/?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(token)}`;
}

export function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
