/**
 * The supplier portal shell.
 *
 * Deliberately outside the console layout: nobody here has a session, a role
 * or a workspace, and the page must render for someone who has never heard of
 * Polytrail. No navigation, nothing to get lost in, one task on the page.
 *
 * The column is narrower than the console's because this is prose and form
 * controls read on a phone, not a data table read at a desk.
 */
export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto w-full max-w-xl px-5 py-8 sm:px-6 sm:py-14">{children}</main>
      <footer className="mx-auto w-full max-w-xl px-5 pb-12 sm:px-6">
        <p className="border-t border-line pt-5 text-sm leading-relaxed text-ink-subtle">
          Sent through Polytrail. Your answers go to the brand that asked for them and into the
          product passport for the item you help make. Nothing else on this site is visible to you,
          and no other supplier can see what you write here.
        </p>
      </footer>
    </div>
  );
}
