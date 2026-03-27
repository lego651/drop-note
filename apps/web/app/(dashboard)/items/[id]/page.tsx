import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ItemDetailEditor } from '@/components/ItemDetailEditor'
import { AttachmentsSection } from '@/components/AttachmentsSection'
import { format } from 'date-fns'

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('items')
    .select('subject')
    .eq('id', params.id)
    .single()
  return { title: `${data?.subject ?? 'Item'} — drop-note` }
}

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: item } = await supabase
    .from('items')
    .select('*, item_tags(tags(id, name))')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!item) notFound()

  // Fetch all user tags for type-ahead
  const { data: userTags } = await supabase
    .from('tags')
    .select('id, name')
    .eq('user_id', user.id)
    .order('name')

  // Prev/next navigation
  const { data: prev } = await supabase
    .from('items')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .eq('type', 'email_body')
    .lt('created_at', item.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: next } = await supabase
    .from('items')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .eq('type', 'email_body')
    .gt('created_at', item.created_at)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  // Fetch attachments (if group_id exists)
  let attachments: {
    id: string
    filename: string | null
    storage_path: string | null
    ai_summary: string | null
    created_at: string
  }[] = []

  if (item.group_id) {
    const { data } = await supabase
      .from('items')
      .select('id, filename, storage_path, ai_summary, created_at')
      .eq('group_id', item.group_id)
      .eq('user_id', user.id)
      .eq('type', 'attachment')
      .is('deleted_at', null)
    attachments = data ?? []
  }

  // Generate signed URLs server-side
  const signedUrls = await Promise.all(
    attachments.map(async (att) => {
      if (!att.storage_path) return { id: att.id, url: null }
      const { data } = await supabase.storage
        .from('attachments')
        .createSignedUrl(att.storage_path, 3600)
      return { id: att.id, url: data?.signedUrl ?? null }
    })
  )

  const currentTags = (item.item_tags as { tags: { id: string; name: string } | null }[] | null)
    ?.map((it) => it.tags)
    .filter((t): t is { id: string; name: string } => t !== null) ?? []

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/items" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to items
        </Link>
        <div className="flex gap-2">
          {prev && (
            <Link href={`/items/${prev.id}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Previous
            </Link>
          )}
          {next && (
            <Link href={`/items/${next.id}`} className="text-sm text-muted-foreground hover:text-foreground">
              Next →
            </Link>
          )}
        </div>
      </div>

      {/* YouTube embed */}
      {item.source_type === 'youtube' && item.source_url && (
        <div className="mb-6 w-full overflow-hidden rounded-lg aspect-video bg-muted">
          {(() => {
            const videoIdMatch = item.source_url.match(
              /(?:[?&]v=|youtu\.be\/|youtube\.com\/(?:shorts|live|embed)\/)([a-zA-Z0-9_-]{11})/
            )
            const videoId = videoIdMatch?.[1]
            return videoId ? (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title={item.subject ?? 'YouTube video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            ) : (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-full text-sm text-muted-foreground underline"
              >
                Watch on YouTube
              </a>
            )
          })()}
        </div>
      )}

      {/* Read-only metadata */}
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold">{item.subject ?? item.filename ?? 'Untitled'}</h1>
        <p className="text-sm text-muted-foreground">{item.sender_email}</p>
        <p className="text-sm text-muted-foreground">
          {format(new Date(item.created_at), 'PPP p')}
        </p>
      </div>

      {/* Editable fields */}
      <ItemDetailEditor
        itemId={item.id}
        initialSummary={item.ai_summary ?? ''}
        initialNotes={item.notes ?? ''}
        initialTags={currentTags}
        userTags={userTags ?? []}
      />

      {/* Attachments */}
      <AttachmentsSection
        attachments={attachments.map((att) => ({
          ...att,
          signedUrl: signedUrls.find(u => u.id === att.id)?.url ?? null,
        }))}
      />
    </div>
  )
}
