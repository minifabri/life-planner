// Edge Function: le Azioni del GPT personalizzato "Life Planner" (technical-design.md, 9.9).
// Autenticazione: il token personale generato in Impostazioni › ChatGPT, nell'header Authorization; nel database
// c'è solo la sua impronta. Con la chiave di servizio la RLS non vale, quindi ogni query filtra per `owner_id`.
// Non legge né scrive Log, medicine ed elementi riservati.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  addedMessage,
  buildAgenda,
  buildLists,
  eventMessage,
  hashToken,
  localDateString,
  looksLikeToken,
  openApiSpec,
  parseEventInput,
  parseRange,
  parseTaskInput,
  planShopping,
  planWishlist,
  taskMessage,
  uuidv7,
} from "./chatgpt.gen.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BODY_BYTES = 64_000;
const DEFAULT_TZ = "Europe/Rome";

const TASK_COLUMNS = "id, title, notes, date, time, duration_min, due_date, window_start, attention, status, completed_at, original_date, created_at, deleted_at";
const EVENT_COLUMNS =
  "id, title, notes, location, start_at, end_at, all_day, start_date, end_date, tz, rrule, area_id, attention, source, kind, gcal_calendar_id, gcal_event_id, gcal_etag, icloud_calendar_id, icloud_href, icloud_etag, lesson, is_private, deleted_at, created_at, updated_at";

type Ctx = { db: SupabaseClient; owner: string; tz: string; today: string };

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname.replace(/^.*\/chatgpt-actions/, "") || "/";

  // Lo schema è pubblico: serve all'editor del GPT per importare le azioni.
  if (req.method === "GET" && path === "/openapi.json") {
    return json(openApiSpec(`${SUPABASE_URL}/functions/v1/chatgpt-actions`));
  }

  const token = (req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  if (!looksLikeToken(token)) return json({ error: "Token mancante o non valido: generane uno in Impostazioni › ChatGPT." }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await db.from("chatgpt_links").select("owner_id").eq("token_hash", await hashToken(token)).maybeSingle();
  if (linkError) return json({ error: "errore interno" }, 500);
  const owner = link?.owner_id as string | undefined;
  if (!owner) return json({ error: "Token sconosciuto o revocato: generane uno nuovo in Impostazioni › ChatGPT." }, 401);

  const { data: profile } = await db.from("profiles").select("timezone").eq("owner_id", owner).maybeSingle();
  const tz = (profile?.timezone as string | undefined) ?? DEFAULT_TZ;
  const ctx: Ctx = { db, owner, tz, today: localDateString(new Date(), tz) };

  let body: unknown = null;
  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "richiesta troppo grande" }, 413);
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Il corpo della richiesta non è JSON valido." }, 400);
    }
  }

  const route = `${req.method} ${path}`;
  try {
    let res: Response;
    if (route === "GET /agenda") res = await agenda(ctx, new URL(req.url).searchParams);
    else if (route === "GET /lists") res = await lists(ctx);
    else if (route === "POST /tasks") res = await createTask(ctx, body);
    else if (route === "POST /events") res = await createEvent(ctx, body);
    else if (route === "POST /shopping") res = await addShopping(ctx, body);
    else if (route === "POST /wishlist") res = await addWishlist(ctx, body);
    else return json({ error: "azione sconosciuta" }, 404);
    await db.from("chatgpt_links").update({ last_used_at: new Date().toISOString() }).eq("owner_id", owner);
    return res;
  } catch (e) {
    console.error(route, e);
    return json({ error: "errore interno" }, 500);
  }
});

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

async function agenda({ db, owner, tz, today }: Ctx, params: URLSearchParams): Promise<Response> {
  const range = parseRange({ from: params.get("from"), to: params.get("to") }, today);
  if (!range.ok) return json({ error: range.error }, 400);
  const { from, to } = range.value;

  const tasks = () => db.from("tasks").select(TASK_COLUMNS).eq("owner_id", owner).eq("is_private", false).is("deleted_at", null);
  const [inRange, open] = await Promise.all([
    tasks().gte("date", from).lte("date", to).limit(1000),
    // Rimaste indietro e nel periodo: le aperte senza giorno o di un giorno passato.
    tasks().eq("status", "open").or(`date.is.null,date.lt.${today}`).limit(500),
  ]);
  const allTasks = [...new Map([...check(inRange), ...check(open)].map((t) => [t.id, t])).values()];

  // Un margine di un giorno per i fusi; gli eventi su più giorni iniziati prima si prendono dalla fine.
  const startIso = new Date(`${from}T00:00:00Z`).getTime() - 86_400_000;
  const endIso = new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000;
  const [s, e] = [new Date(startIso).toISOString(), new Date(endIso).toISOString()];
  const events = check(
    await db
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("owner_id", owner)
      .eq("is_private", false)
      .is("deleted_at", null)
      .or(
        `rrule.not.is.null,and(start_at.lt.${e},or(end_at.gt.${s},start_at.gte.${s})),and(start_date.lte.${to},or(end_date.gte.${from},start_date.gte.${from}))`,
      )
      .limit(2000),
  );
  const recurring = events.filter((ev) => ev.rrule).map((ev) => ev.id);
  const exceptions = recurring.length
    ? check(await db.from("event_exceptions").select("id, event_id, original_start, cancelled, new_start_at, new_end_at").eq("owner_id", owner).in("event_id", recurring))
    : [];

  return json(buildAgenda(range.value, today, tz, allTasks, events, exceptions));
}

async function lists({ db, owner }: Ctx): Promise<Response> {
  const [shopping, wishlist] = await Promise.all([
    db.from("shopping_items").select("name, quantity, department, urgent").eq("owner_id", owner).eq("checked", false).is("deleted_at", null).order("created_at"),
    db
      .from("wishlist_items")
      .select("name, brand, category, price_amount, price_currency, price_is_estimate, interest, url")
      .eq("owner_id", owner)
      .eq("status", "wanted")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  return json(buildLists(check(shopping), check(wishlist)));
}

async function createTask({ db, owner, today }: Ctx, body: unknown): Promise<Response> {
  const parsed = parseTaskInput(body, today);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const id = uuidv7();
  check(await db.from("tasks").insert({ id, owner_id: owner, ...parsed.value }).select("id"));
  return json({ ok: true, id, message: taskMessage(parsed.value, today) }, 201);
}

async function createEvent({ db, owner, tz, today }: Ctx, body: unknown): Promise<Response> {
  const parsed = parseEventInput(body, today, tz);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const id = uuidv7();
  check(await db.from("events").insert({ id, owner_id: owner, ...parsed.value }).select("id"));
  const input = body as { date: string; start_time?: string };
  return json({ ok: true, id, message: eventMessage(parsed.value, input.date, parsed.value.all_day ? null : (input.start_time ?? null)) }, 201);
}

async function listId(db: SupabaseClient, owner: string, kind: "shopping" | "wishlist"): Promise<string | null> {
  const { data } = await db.from("lists").select("id").eq("owner_id", owner).eq("kind", kind).order("created_at").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function addShopping({ db, owner }: Ctx, body: unknown): Promise<Response> {
  const open = check(await db.from("shopping_items").select("name").eq("owner_id", owner).eq("checked", false).is("deleted_at", null));
  const plan = planShopping(body, open);
  if (!plan.ok) return json({ error: plan.error }, 400);
  const { create, already } = plan.value;
  if (create.length > 0) {
    const list = await listId(db, owner, "shopping");
    if (!list) return json({ error: "La lista della Spesa non esiste ancora: apri l'app una volta e riprova." }, 409);
    // Senza reparto l'articolo eredita quello imparato per lo stesso nome (trigger shopping_items_learn).
    check(
      await db
        .from("shopping_items")
        .insert(create.map((i) => ({ id: uuidv7(), owner_id: owner, list_id: list, name: i.name, quantity: i.quantity, department: null })))
        .select("id"),
    );
  }
  const added = create.map((i) => (i.quantity ? `${i.name} (${i.quantity})` : i.name));
  return json({ ok: true, added, already, message: addedMessage("Spesa", added, already) }, 201);
}

async function addWishlist({ db, owner }: Ctx, body: unknown): Promise<Response> {
  const wanted = check(await db.from("wishlist_items").select("name, brand").eq("owner_id", owner).eq("status", "wanted").is("deleted_at", null));
  const plan = planWishlist(body, wanted);
  if (!plan.ok) return json({ error: plan.error }, 400);
  const { create, already } = plan.value;
  if (create.length > 0) {
    const list = await listId(db, owner, "wishlist");
    if (!list) return json({ error: "La Wishlist non esiste ancora: apri l'app una volta e riprova." }, 409);
    check(await db.from("wishlist_items").insert(create.map((i) => ({ id: uuidv7(), owner_id: owner, list_id: list, ...i }))).select("id"));
  }
  const added = create.map((i) => (i.brand ? `${i.name} (${i.brand})` : i.name));
  return json({ ok: true, added, already, message: addedMessage("Wishlist", added, already) }, 201);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
