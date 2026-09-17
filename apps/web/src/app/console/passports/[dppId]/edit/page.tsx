import { redirect } from 'next/navigation';
import { SECTIONS } from './config';

/** The editor always opens on the first section rather than a chooser screen. */
export default async function EditPassportPage({
  params,
}: {
  params: Promise<{ dppId: string }>;
}) {
  const { dppId } = await params;
  redirect(`/console/passports/${dppId}/edit/${SECTIONS[0]!.slug}`);
}
