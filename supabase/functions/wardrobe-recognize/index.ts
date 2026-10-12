// Edge Function: riconosce il capo da una foto con un modello di visione (technical-design.md, incremento 20).
// Autenticazione: il token dell'utente. La chiave del servizio sta in Vault (segreto `anthropic_api_key`) e non
// arriva mai al client. La foto viene inviata al servizio solo per questa richiesta e non viene salvata qui.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { RECOGNITION_PROMPT, RECOGNITION_SCHEMA, looksLikeJpegBase64, parseRecognition } from "./recognize.gen.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 40_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo non consentito" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user?.id) return json({ error: "non autorizzato" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "richiesta non valida" }, 400);
  }
  if (!looksLikeJpegBase64(input.image)) return json({ error: "richiesta non valida" }, 400);

  const { data: apiKey, error: keyError } = await db.rpc("wardrobe_ai_key");
  if (keyError) return json({ error: "errore interno" }, 500);
  if (typeof apiKey !== "string" || !apiKey) return json({ error: "not_configured" });

  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Se il modello declina la richiesta, il servizio la rifà su quello di riserva nella stessa chiamata.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: RECOGNITION_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: input.image } },
            { type: "text", text: RECOGNITION_PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return json({ error: "unrecognized" });
    const text = response.content.find((block: { type: string }) => block.type === "text") as { text: string } | undefined;
    const recognition = text ? parseRecognition(text.text) : null;
    return recognition ? json({ ok: true, recognition }) : json({ error: "unrecognized" });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return json({ error: "invalid_key" });
    if (error instanceof Anthropic.RateLimitError) return json({ error: "busy" });
    if (error instanceof Anthropic.BadRequestError) return json({ error: "unrecognized" });
    if (error instanceof Anthropic.APIError) return json({ error: "unreachable" });
    return json({ error: "unreachable" });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
