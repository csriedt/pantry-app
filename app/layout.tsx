import { ClerkThemeProvider } from "@/components/providers/clerk-theme-provider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

// Inter — UI / body (variable)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Bricolage Grotesque — display headings, wordmark (variable)
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

// JetBrains Mono — IDs, codes, quote numbers
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs (canonical, OG) resolve against this origin.
  metadataBase: new URL(SITE_URL),
  title: {
    // Fallback for any page without its own title. The home page overrides it.
    default: `${SITE_NAME} — the AI revenue desk for small sales teams`,
    // Inner pages render as "Page · PreviousApp".
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_GB",
    url: SITE_URL,
    title: `${SITE_NAME} — the AI revenue desk for small sales teams`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — the AI revenue desk for small sales teams`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

// Next 16 keeps themeColor in a SEPARATE `viewport` export, not in `metadata`.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${bricolage.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <head>
        {/*
          Synchronous FOUC-prevention script — runs during HTML parsing,
          before React hydration, so the correct light/dark class is on
          <html> before first paint. Server-emitted (RootLayout is a
          server component), so it doesn't trip React 19's "script tag
          rendered inside a React component" guard. See
          components/theme-provider.tsx for the paired client state.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          suppressHydrationWarning
        />
      </head>
      <body className="flex min-h-full flex-col">
        {/*
          Under cacheComponents (see next.config.ts) anything that reads
          cookies/headers/auth must live inside a Suspense boundary so the
          static shell — the <html>/<body> chrome — can prerender without
          blocking on runtime data. Clerk is rendered inside <ClerkThemeProvider>
          (client) so it can read the resolved app theme (next-themes) and match
          it. ThemeProvider must sit ABOVE ClerkThemeProvider so useTheme() is in
          scope. Keep auth/cookie-reading server components inside this Suspense
          boundary so the <html>/<body> shell can prerender without waiting.
        */}
        <Suspense fallback={<div className="flex-1" aria-hidden />}>
          <ThemeProvider>
            <ClerkThemeProvider>
              <QueryProvider>{children}</QueryProvider>
            </ClerkThemeProvider>
          </ThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}
