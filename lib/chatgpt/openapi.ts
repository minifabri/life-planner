// Schema OpenAPI 3.1 delle azioni del GPT personalizzato (technical-design.md, 9.9).
// La Edge Function lo serve su /openapi.json, così nell'editor del GPT basta "Importa da URL".
// Le descrizioni restano sotto i 300 caratteri, il limite delle Azioni di ChatGPT.
import { MAX_AGENDA_DAYS, MAX_SHOPPING_ITEMS, MAX_WISHLIST_ITEMS } from "./actions";

const date = { type: "string", format: "date", description: "Data locale AAAA-MM-GG." };
const time = { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Ora locale HH:mm, nel fuso del profilo." };
const attention = {
  type: "string",
  enum: ["low", "medium", "high"],
  description: "Attenzione: low (normale), medium (notifica), high (importante). Di base low.",
};

const reply = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    message: { type: "string", description: "Frase in italiano da riferire a chi usa l'app." },
  },
};

const errorReply = {
  description: "Richiesta non valida: il messaggio dice cosa correggere.",
  content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
};

const okReply = (description: string, extra: Record<string, unknown> = {}) => ({
  description,
  content: { "application/json": { schema: { ...reply, properties: { ...reply.properties, ...extra } } } },
});

export function openApiSpec(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Life Planner",
      version: "1.0.0",
      description: "Agenda, attività, Spesa e Wishlist dell'app Life Planner di chi usa questo GPT.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer", description: "Token personale lp_… da Impostazioni › ChatGPT." } },
      schemas: {},
    },
    security: [{ token: [] }],
    paths: {
      "/agenda": {
        get: {
          operationId: "getAgenda",
          summary: "Legge eventi e attività",
          description: `Eventi e attività giorno per giorno (al massimo ${MAX_AGENDA_DAYS} giorni). Se il periodo comprende oggi, anche le attività rimaste indietro e quelle da fare entro una scadenza. Restituisce anche la data di oggi.`,
          parameters: [
            { name: "from", in: "query", required: false, schema: date, description: "Primo giorno; di base oggi." },
            { name: "to", in: "query", required: false, schema: date, description: "Ultimo giorno compreso; di base 6 giorni dopo from." },
          ],
          responses: {
            "200": {
              description: "Agenda del periodo.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      today: date,
                      timezone: { type: "string" },
                      days: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            date,
                            weekday: { type: "string" },
                            events: { type: "array", items: { type: "object" } },
                            tasks: { type: "array", items: { type: "object" } },
                          },
                        },
                      },
                      overdue: { type: "array", items: { type: "object" } },
                      in_window: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            "400": errorReply,
          },
        },
      },
      "/lists": {
        get: {
          operationId: "getLists",
          summary: "Legge Spesa e Wishlist",
          description: "Articoli ancora da comprare nella Spesa (con il reparto, se noto) e prodotti desiderati nella Wishlist (con prezzo e interesse da 1 a 3).",
          responses: {
            "200": {
              description: "Le due liste.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { shopping: { type: "array", items: { type: "object" } }, wishlist: { type: "array", items: { type: "object" } } },
                  },
                },
              },
            },
          },
        },
      },
      "/tasks": {
        post: {
          operationId: "createTask",
          summary: "Aggiunge un'attività",
          description: "Crea un'attività da spuntare. Con date è per quel giorno (con time anche a un orario); con solo due_date è da fare entro quel giorno; senza nessuna delle due è per oggi.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string", maxLength: 200 },
                    date,
                    time,
                    duration_min: { type: "integer", minimum: 1, maximum: 1440 },
                    due_date: { ...date, description: "Da fare entro questo giorno, se non c'è date." },
                    attention,
                    remind: { type: "boolean", description: "Vero per avere una notifica anche con attenzione low." },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "201": okReply("Attività creata.", { id: { type: "string" } }), "400": errorReply },
        },
      },
      "/events": {
        post: {
          operationId: "createEvent",
          summary: "Aggiunge un evento",
          description: "Crea un evento nel calendario dell'app. Senza start_time è di tutto il giorno (fino a end_date compresa). Un end_time prima dello start_time, senza end_date, è il giorno dopo.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "date"],
                  properties: {
                    title: { type: "string", maxLength: 200 },
                    date,
                    start_time: time,
                    end_time: time,
                    end_date: { ...date, description: "Ultimo giorno, per eventi su più giorni." },
                    location: { type: "string" },
                    attention,
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "201": okReply("Evento creato.", { id: { type: "string" } }), "400": errorReply },
        },
      },
      "/shopping": {
        post: {
          operationId: "addShoppingItems",
          summary: "Aggiunge alla Spesa",
          description: `Aggiunge articoli alla lista della Spesa (al massimo ${MAX_SHOPPING_ITEMS}). Il reparto lo sceglie l'app. Ciò che è già in lista non viene duplicato.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      maxItems: MAX_SHOPPING_ITEMS,
                      items: {
                        type: "object",
                        required: ["name"],
                        properties: {
                          name: { type: "string", description: "Nome dell'articolo, es. latte di avena." },
                          quantity: { type: "string", description: "Es. 2, 500 g, 1 l." },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": okReply("Articoli aggiunti.", { added: { type: "array", items: { type: "string" } }, already: { type: "array", items: { type: "string" } } }),
            "400": errorReply,
          },
        },
      },
      "/wishlist": {
        post: {
          operationId: "addWishlistItems",
          summary: "Salva nella Wishlist",
          description: `Salva prodotti consigliati nella Wishlist come desiderati (al massimo ${MAX_WISHLIST_ITEMS}). Un prodotto già presente con stesso nome e marca non viene duplicato.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      maxItems: MAX_WISHLIST_ITEMS,
                      items: {
                        type: "object",
                        required: ["name"],
                        properties: {
                          name: { type: "string" },
                          brand: { type: "string" },
                          category: { type: "string", description: "Es. Skincare, Casa, Libri." },
                          price: { type: "string", description: "Prezzo indicativo, es. ~25 € o 25-30 €." },
                          url: { type: "string", description: "Link al prodotto, solo se certo." },
                          interest: { type: "integer", enum: [1, 2, 3], description: "1 poco, 2 abbastanza (di base), 3 molto." },
                          notes: { type: "string", description: "Nota breve: perché è consigliato." },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": okReply("Prodotti salvati.", { added: { type: "array", items: { type: "string" } }, already: { type: "array", items: { type: "string" } } }),
            "400": errorReply,
          },
        },
      },
    },
  };
}
