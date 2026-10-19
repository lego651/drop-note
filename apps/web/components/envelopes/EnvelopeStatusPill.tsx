import { ENVELOPE_STATUS_DOT } from '@/lib/design-tokens'
import { ENVELOPE_STATUS_LABEL, type EnvelopeListStatus } from '@/lib/envelopes'

/** Status pill for the /envelopes list (DRO-223) — a colored dot carries the
 * status signal, the label stays `--foreground` (AIRMAIL § 8: status colors
 * are for icons/dots, not body text). */
export function EnvelopeStatusPill({ status }: { status: EnvelopeListStatus }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-stroke border-ink bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-foreground">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: `hsl(${ENVELOPE_STATUS_DOT[status]})` }}
        aria-hidden="true"
      />
      {ENVELOPE_STATUS_LABEL[status]}
    </span>
  )
}
