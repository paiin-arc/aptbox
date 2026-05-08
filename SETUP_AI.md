# aptbox AI overlay — setup guide (Phase 0 + 1A)

This is the manual config you need to flip the AI features on. Until
`NEXT_PUBLIC_AI_FEATURES_ENABLED=true` is set, none of this matters — the
app behaves identically to the pre-AI version.

## TL;DR

```
Supabase project + run db/migrations/0001_init.sql
Inngest free account
Anthropic API key
OpenAI API key (just for embeddings)
Server-side Shelby key (the existing AG- key works)
Set 7 env vars on Vercel
Flip NEXT_PUBLIC_AI_FEATURES_ENABLED=true
```

Estimated total setup time: **~25 minutes**, mostly account signups.

---

## 1. Create a Supabase project (5 min)

1. Sign in at <https://supabase.com>
2. New Project → name it `aptbox` → pick the region closest to your users → save the DB password
3. Wait ~2 min for provisioning
4. Open **SQL Editor** → paste the contents of `db/migrations/0001_init.sql` → **Run**
   - Should create `aptbox_files`, `aptbox_chunks`, `aptbox_access_log` plus the `match_chunks` RPC
5. Go to **Project Settings → API** and grab:
   - `Project URL` (looks like `https://xxxx.supabase.co`)
   - `service_role` key (under "Project API keys" — **NOT** the anon key)

> The service-role key bypasses Row-Level Security. We only use it from
> server-side API routes (never exposed to the browser).

## 2. Create an Inngest account (3 min)

1. Sign in at <https://app.inngest.com>
2. Create a new app — name it `aptbox`
3. Copy:
   - `INNGEST_EVENT_KEY`
   - `INNGEST_SIGNING_KEY`
4. Production deploy: under **Apps → Connect**, point Inngest to
   `https://aptbox.vercel.app/api/inngest` (or your custom domain)
5. Local dev: install the Inngest dev server with `npx inngest-cli@latest dev` —
   it watches `localhost:3000/api/inngest` and runs functions locally without
   touching the cloud.

## 3. Get an Anthropic API key (3 min)

1. Sign in at <https://console.anthropic.com>
2. Top up $5 in credits (more than enough for hundreds of summaries)
3. **API Keys → Create key** → copy `ANTHROPIC_API_KEY`

## 4. Get an OpenAI API key (3 min)

We use OpenAI **only for embeddings** (text-embedding-3-small). It's the
cheapest, fastest option.

1. Sign in at <https://platform.openai.com>
2. **API keys → Create key**
3. Top up $5 (1M embedding tokens ≈ $0.02 — $5 is many months of use)

## 5. Set Vercel env vars (5 min)

In Vercel → your project → **Settings → Environment Variables**, add for
all three environments (Production, Preview, Development):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_AI_FEATURES_ENABLED` | `true` |
| `AI_FEATURES_ENABLED` | `true` |
| `SUPABASE_URL` | `https://<your-project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (the long secret — not the anon key) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `OPENAI_API_KEY` | `sk-...` |
| `SHELBY_API_KEY` | (the existing `AG-` shelbynet key) |
| `SHELBY_API_KEY_SHELBYNET` | same as above (optional override) |
| `SHELBY_API_KEY_TESTNET` | the testnet `AG-NSU…` key |
| `INNGEST_EVENT_KEY` | (from step 2) |
| `INNGEST_SIGNING_KEY` | (from step 2) |
| `AI_MAX_FILE_BYTES` | `8388608` (8 MB cap; optional) |

> **Important**: only `NEXT_PUBLIC_AI_FEATURES_ENABLED` should have the
> `NEXT_PUBLIC_` prefix. All other AI-related keys are server-side only.

## 6. Local dev setup (optional)

If you want to run the AI pipeline locally:

```bash
# In your .env.local (gitignored), add the same vars as Vercel above

# In one terminal:
npm run dev

# In another:
npx inngest-cli@latest dev
```

The Inngest dev server will pick up the function defs from your local
`/api/inngest` route and run them on demand.

## 7. Verify it works

1. Push the branch / deploy to Vercel
2. Open the live site, connect your wallet
3. Upload a small **public** PDF (under 5 MB)
4. Within 30 seconds, the FileCard should show:
   - First: `⌛ AI` badge (processing)
   - Then: `🧠 AI` badge + 2–3 tag chips (ready)
5. Hover the AI badge — the tooltip shows the AI summary
6. Open the file detail page — Phase 1B will add a chat panel here in the next release

## 8. Cost monitoring

Set spend alerts:
- **Anthropic** → Billing → Usage limits → daily $1 hard cap during testing
- **OpenAI** → Billing → Usage limits → daily $0.50 hard cap during testing
- **Supabase** → Free tier covers ~10K users; paid tier is $25/mo

Realistic per-file cost on this stack:
- 1 MB PDF (~10 pages): **$0.003**
- 5 MB PDF (~50 pages): **$0.015**
- Plain text file: **$0.001**

## 9. Reverting / kill switch

To turn AI features OFF without losing the data already in Supabase:

```
NEXT_PUBLIC_AI_FEATURES_ENABLED=false
AI_FEATURES_ENABLED=false
```

UI badges disappear, API routes return `503`. The pipeline stops accepting
new work but processed data stays in Supabase. Flip back to `true` to
re-enable instantly — no data loss.

To **fully remove** all AI data:

```sql
truncate table aptbox_chunks;
truncate table aptbox_files;
truncate table aptbox_access_log;
```

## 10. What's NOT in Phase 1A

The following are scaffolded in code but not wired to UI yet:
- Chat panel on `/f/[id]` (Phase 1B)
- Smart search dialog (Phase 1C)
- Access log writes (Phase 1D)
- Token-gated folders (Phase 1E)

Each ships behind the same `NEXT_PUBLIC_AI_FEATURES_ENABLED` flag, so you
can validate Phase 1A in production for a couple of weeks before adding
the next layer.
