import { cacheLife } from "next/cache";
import { createSerwistRoute } from "@serwist/turbopack";

// Cambia a ogni deploy: le pagine in precache si aggiornano insieme al resto dell'app.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

/** Le schermate dell'app: shell statiche, uguali per tutti (i dati arrivano dal client). */
const PAGES = [
  "/today",
  "/calendar/week",
  "/calendar/month",
  "/lists/shopping",
  "/lists/meals",
  "/lists/wishlist",
  "/log",
  "/capture",
  "/settings",
  "/settings/import",
  "/login",
];

const route = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // Script, stili e font dell'app (i font sono locali: senza rete l'aspetto resta lo stesso).
  globPatterns: [".next/static/**/*.{js,css,woff2}"],
  additionalPrecacheEntries: PAGES.map((url) => ({ url, revision })),
  // Uno script classico: si registra come il service worker precedente, senza `type: "module"`.
  esbuildOptions: { format: "iife" },
});

const FILES = ["sw.js", "sw.js.map"];

export function generateStaticParams() {
  return FILES.map((path) => ({ path }));
}

/** Il file compilato. In cache senza scadenza: nasce in fase di build e cambia solo con un nuovo deploy. */
async function build(path: string): Promise<{ body: string; type: string }> {
  "use cache";
  cacheLife("max");
  const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ path }) });
  return { body: await response.text(), type: response.headers.get("Content-Type") ?? "text/plain" };
}

/** Serve il service worker su /serwist/sw.js, con l'elenco dei file da tenere per l'uso offline. */
export async function GET(_req: Request, ctx: RouteContext<"/serwist/[path]">) {
  const { path } = await ctx.params;
  if (!FILES.includes(path)) return new Response("Not found", { status: 404 });
  const file = await build(path);
  return new Response(file.body, {
    // Lo script sta sotto /serwist/ ma controlla tutta l'app.
    headers: { "Content-Type": file.type, "Service-Worker-Allowed": "/" },
  });
}
