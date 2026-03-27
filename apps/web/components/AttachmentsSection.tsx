import { format } from 'date-fns'

type Attachment = {
  id: string
  filename: string | null
  storage_path: string | null
  ai_summary: string | null
  created_at: string
  signedUrl: string | null
}

interface AttachmentsSectionProps {
  attachments: Attachment[]
}

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif',
])

function getExtension(filename: string | null): string {
  if (!filename) return ''
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

function isImage(filename: string | null): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filename))
}

export function AttachmentsSection({ attachments }: AttachmentsSectionProps) {
  if (attachments.length === 0) return null

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-base font-semibold">Attachments</h2>
      <ul className="space-y-4">
        {attachments.map(att => (
          <li key={att.id} className="rounded-md border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {att.filename ?? 'Unnamed file'}
              </span>
              {att.signedUrl ? (
                <a
                  href={att.signedUrl}
                  download={att.filename ?? true}
                  className="text-xs text-muted-foreground hover:text-foreground underline ml-2 shrink-0"
                >
                  Download
                </a>
              ) : (
                <span className="text-xs text-muted-foreground ml-2 shrink-0">
                  File unavailable
                </span>
              )}
            </div>

            {att.signedUrl && isImage(att.filename) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={att.signedUrl}
                alt={att.filename ?? 'Attachment'}
                loading="lazy"
                style={{ maxHeight: '300px' }}
                className="rounded object-contain"
              />
            )}

            {att.ai_summary && (
              <p className="text-xs text-muted-foreground">{att.ai_summary}</p>
            )}

            <p className="text-xs text-muted-foreground">
              {format(new Date(att.created_at), 'PPP p')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
