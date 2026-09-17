import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

/**
 * Two families, one job each.
 *
 * Geist is the product typeface: a neutral grotesque with genuinely good
 * tabular figures and a variable weight axis, which is what a screen full of
 * percentages and identifiers needs. It is also the typeface this product is
 * being measured against, so using it is the honest choice rather than an
 * approximation of it.
 *
 * Instrument Serif appears in exactly one place — the public passport's
 * headline. The console is software and reads as software; the passport is a
 * document about a garment and earns an editorial voice. Mixing the two inside
 * one surface is what makes a design system look undecided.
 *
 * `display: 'swap'` throughout, never `block`: these pages get opened in shops
 * on poor connections, and text that is invisible until a font arrives is worse
 * than text in a fallback.
 */
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans-geist',
  display: 'swap',
  // Only the three weights the scale actually uses. Naming them pins static
  // instances instead of shipping the whole variable axis for 400/500/600.
  weight: ['400', '500', '600'],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono-geist',
  display: 'swap',
  weight: ['400', '500'],
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Polytrail — Digital Product Passports for textiles',
    template: '%s · Polytrail',
  },
  description:
    'Build, verify and publish Digital Product Passports for apparel, footwear and home textiles.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF8' },
    { media: '(prefers-color-scheme: dark)', color: '#16161D' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
