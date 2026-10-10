import { fetchPage } from "@/lib/wishlist/fetch-page";
import { extractMetadata, missingFields, type LinkPreviewReply } from "@/lib/wishlist/metadata";

function reply(body: LinkPreviewReply, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Solo chi ha una sessione valida dell'app può usare il recupero: non è un proxy aperto. */
async function isSignedIn(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return false;
  try {
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Legge titolo, immagine, prezzo e marca di una pagina prodotto (technical-design.md, 9.3).
 * L'indirizzo arriva nel corpo della richiesta, non nella query string, così non finisce nei log.
 */
export async function POST(request: Request) {
  if (!(await isSignedIn(request))) return reply({ ok: false, reason: "unauthorized" }, 401);

  let url: unknown;
  try {
    url = ((await request.json()) as { url?: unknown }).url;
  } catch {
    return reply({ ok: false, reason: "invalid" }, 400);
  }
  if (typeof url !== "string" || url.length > 2000) return reply({ ok: false, reason: "invalid" }, 400);

  const page = await fetchPage(url);
  if (!page.ok) return reply({ ok: false, reason: page.reason }, page.reason === "invalid" || page.reason === "blocked" ? 400 : 200);

  const metadata = extractMetadata(page.html, page.finalUrl);
  return reply({ ok: true, metadata, missing: missingFields(metadata) });
}
