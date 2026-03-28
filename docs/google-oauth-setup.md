# Google OAuth Setup Guide

One-time setup to enable "Continue with Google" sign-in. Takes about 15 minutes.

---

## Prerequisites

- A Google account with access to [Google Cloud Console](https://console.cloud.google.com)
- Your Supabase project reference ID (found in Supabase Dashboard → Project Settings → General)
- Your production domain (e.g. `dropnote.com`) — or at minimum a Vercel deployment URL

---

## Step 1: Create a Google Cloud project (or use existing)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector in the top bar → **New Project**
3. Name it `drop-note` (or any name) → **Create**
4. Select the new project from the project selector

If you already have a project you want to reuse, skip to Step 2.

---

## Step 2: Configure the OAuth consent screen

1. In the left sidebar: **APIs & Services** → **OAuth consent screen**
2. Select **External** → **Create**
3. Fill in the required fields:
   - **App name:** `drop-note`
   - **User support email:** your email
   - **Developer contact information:** your email
4. Click **Save and Continue** through the Scopes and Test Users screens (no changes needed)
5. Back on the Summary screen, click **Publish App** → **Confirm**

   > Publishing moves the app out of "testing" mode so any Google account can sign in — not just test users you explicitly added.

---

## Step 3: Create an OAuth 2.0 Web Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `drop-note web`
5. Leave **Authorized JavaScript origins** and **Authorized redirect URIs** blank for now — you will fill them in Steps 4 and 7
6. Click **Create**
7. Copy the **Client ID** and **Client Secret** — you will need them in Step 5

---

## Step 4: Add the Supabase redirect URI

1. Back in **APIs & Services** → **Credentials** → click your OAuth client
2. Under **Authorized redirect URIs**, click **+ Add URI**
3. Add: `https://<ref>.supabase.co/auth/v1/callback`
   - Replace `<ref>` with your Supabase project reference ID (e.g. `abcdefghijklmnop`)
   - Example: `https://abcdefghijklmnop.supabase.co/auth/v1/callback`
4. Click **Save**

---

## Step 5: Configure Google as a provider in Supabase

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project
2. **Authentication** → **Providers** → **Google**
3. Toggle **Enable Google provider** on
4. Paste in the **Client ID** and **Client Secret** from Step 3
5. Click **Save**

---

## Step 6: Enable account linking in Supabase

This allows a user who previously signed up via magic link to later sign in with Google using the same email address without creating a duplicate account.

1. In Supabase Dashboard: **Authentication** → **User Management**
2. Find the setting **"Allow linking multiple providers to a single user account"**
3. Toggle it **on**
4. Save

---

## Step 7: Add authorized origins for local development

1. Back in Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth client
2. Under **Authorized JavaScript origins**, click **+ Add URI**
3. Add each of the following:
   - `http://localhost:3000`
   - `https://dropnote.com` (production domain)
   - `https://<your-vercel-preview-base>.vercel.app` (Vercel preview base, e.g. `drop-note-pi.vercel.app`)
4. Click **Save**

> Google does not support wildcard origins. If you have multiple Vercel preview URLs (e.g. per-branch), add each one or add the stable preview base URL that Vercel assigns to your project.

---

## Step 8: Verify the setup

1. Run the dev server: `pnpm --filter @drop-note/web dev`
2. Open `http://localhost:3000/login`
3. Click **Continue with Google**
4. You should be redirected to Google's consent screen
5. After approving, you should land on `/items`

If the redirect fails, check:
- The redirect URI in Google Cloud Console exactly matches `https://<ref>.supabase.co/auth/v1/callback`
- The Client ID and Secret are correctly pasted into Supabase (no leading/trailing spaces)
- `http://localhost:3000` is listed under Authorized JavaScript origins

---

## Environment variables

No new env vars are needed for OAuth — the Google credentials are stored in the Supabase project config, not in `.env.local`. The existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are all the frontend needs to call `supabase.auth.signInWithOAuth`.
