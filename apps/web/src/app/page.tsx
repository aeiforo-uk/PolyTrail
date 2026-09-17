import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="eyebrow">Polytrail</p>
      <h1 className="display text-5xl">Digital Product Passports for textiles.</h1>
      <p className="max-w-xl text-lg text-ink-muted">
        Build, verify and publish passports for apparel, footwear and home textiles.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/console">Open console</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/p/demo">See a passport</Link>
        </Button>
      </div>
    </main>
  );
}
