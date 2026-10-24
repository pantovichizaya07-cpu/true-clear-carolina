import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { requireAdmin } from "../../lib/server.js";

export default async (_req: Request, context: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await getStore("booking-photos").getWithMetadata(`${context.params.ref}/${context.params.n}`, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });

  return new Response(result.data, {
    headers: { "content-type": String(result.metadata.contentType ?? "image/jpeg"), "cache-control": "private, max-age=3600" },
  });
};

export const config: Config = { path: "/api/admin/photos/:ref/:n", method: "GET" };
