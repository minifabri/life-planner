import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { AuthProvider } from "@/components/auth/auth-provider";
import "./globals.css";

// Font ospitati localmente (pacchetto `geist`): nessuna richiesta a Google, funzionano offline.
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Planner",
  description: "Il tuo centro di organizzazione personale.",
  applicationName: "Planner",
  appleWebApp: {
    capable: true,
    title: "Planner",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0a0f" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f8" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applica il tema salvato prima del primo paint, per evitare il lampo di colore.
const themeScript = `try{var t=localStorage.getItem('planner-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
