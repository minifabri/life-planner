import { ImageResponse } from "next/og";

// Icone dell'app generate in fase di build: nessun file binario nel repository.
const ICONS = {
  "icon-192.png": { size: 192, maskable: false, badge: false },
  "icon-512.png": { size: 512, maskable: false, badge: false },
  "icon-maskable-512.png": { size: 512, maskable: true, badge: false },
  "apple-touch-icon.png": { size: 180, maskable: false, badge: false },
  "badge-96.png": { size: 96, maskable: false, badge: true },
} as const;

type IconFile = keyof typeof ICONS;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[file]">) {
  const { file } = await ctx.params;
  const spec = ICONS[file as IconFile];
  if (!spec) return new Response("Not found", { status: 404 });

  const { size, maskable, badge } = spec;
  const inner = Math.round(size * (badge ? 0.38 : maskable ? 0.3 : 0.36));
  const halo = Math.round(inner * 1.35);
  const radius = Math.round(size * 0.07);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: badge ? "transparent" : "#0b0a0f",
        }}
      >
        <div
          style={{
            width: halo,
            height: halo,
            borderRadius: radius * 1.4,
            background: badge ? "transparent" : "#26203c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: inner, height: inner, borderRadius: radius, background: badge ? "#ffffff" : "#5b3fd1" }} />
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
