'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, CircleSlash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cancel, type CancelState } from '../actions';

/**
 * Withdrawing an offer.
 *
 * Confirmed rather than instant, because withdrawing kills the recipient's
 * link: they will open it and find nothing, with no way for the sender to undo
 * it short of sending a fresh offer.
 */
export function CancelButton({ transferId }: { transferId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState<CancelState, FormData>(cancel, {});

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <CircleSlash aria-hidden />
        Withdraw
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this transfer?</DialogTitle>
            <DialogDescription>
              The recipient’s link stops working straight away. The offer stays on the record as
              withdrawn — send a new one if you change your mind.
            </DialogDescription>
          </DialogHeader>
          <form action={action}>
            <input type="hidden" name="transferId" value={transferId} />
            <DialogBody>
              {state.error ? (
                <p className="flex items-start gap-2 text-sm text-critical" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {state.error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Keep it open
              </Button>
              <Button type="submit" variant="destructive" loading={pending}>
                Withdraw the offer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
