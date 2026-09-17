'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Light by default, and the operating system's preference is not
     * consulted. The product's look is a light workspace beside a dark
     * navigation rail; with `system` enabled, anyone whose OS runs dark got a
     * fully dark console they never asked this app for — and since no screen
     * offers a theme toggle, no way back. The dark palette stays defined in
     * globals.css for the day a toggle ships; until then, dark is something a
     * person must choose, not something their OS imposes.
     */
    <NextThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
