# DB Performance — Sprint 6

## Indexes

### Existing (pre-S6)
- `items_search_vector_gin` — GIN index on `fts_vector` (created in S4 migration `20260326000005_s4_fts_index.sql`)
- `users.drop_token` — implicit unique index from UNIQUE constraint (Sprint 1)
- `tags_user_id_name_lower_idx` — unique index on `(user_id, lower(name))` (Sprint 1)

### New in S6 (`20260326120000_s6_perf_indexes.sql`)
| Index | Table | Columns | Purpose |
|---|---|---|---|
| `idx_items_user_id_created_at` | `items` | `(user_id, created_at DESC) WHERE deleted_at IS NULL` | Dashboard items load — covers the most common query |
| `idx_item_tags_tag_id` | `item_tags` | `(tag_id)` | Tag filter join (from tags → items) |
| `idx_item_tags_item_id` | `item_tags` | `(item_id)` | Tag filter join (from items → tags) |
| `idx_block_list_type_value` | `block_list` | `(type, value)` | Ingest hot path — block list check runs on every email |

## Query Analysis

### 1. Dashboard items load
```sql
SELECT id, subject, ai_summary, status, created_at, pinned
FROM public.items
WHERE user_id = '<user_id>'
  AND deleted_at IS NULL
ORDER BY pinned DESC, created_at DESC
LIMIT 20;
```
**Expected plan after S6:** Bitmap Index Scan on `idx_items_user_id_created_at` → no seq scan on full items table.

### 2. Tag filter join
```sql
SELECT i.id, i.subject, i.created_at
FROM public.items i
JOIN public.item_tags it ON it.item_id = i.id
JOIN public.tags t ON t.id = it.tag_id
WHERE i.user_id = '<user_id>'
  AND t.name_lower = 'technology'
  AND i.deleted_at IS NULL
ORDER BY i.created_at DESC;
```
**Expected plan after S6:** Index Scan on `idx_item_tags_tag_id` and `idx_item_tags_item_id` for join.

### 3. FTS search
```sql
SELECT id, subject, ai_summary, created_at
FROM public.items
WHERE user_id = '<user_id>'
  AND deleted_at IS NULL
  AND fts_vector @@ plainto_tsquery('english', 'machine learning')
ORDER BY ts_rank(fts_vector, plainto_tsquery('english', 'machine learning')) DESC
LIMIT 20;
```
**Expected plan after S6:** Bitmap Index Scan on `items_search_vector_gin` (GIN) — already existed from S4.

## Applying Migrations

```bash
npx supabase db push --linked
npx supabase migration list --linked  # verify
```

Note: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. Supabase CLI applies migrations in a transaction by default — if this causes an error, the indexes can be applied manually via the Supabase SQL editor.
