# Deploying Frost

Frost has **two pieces** that deploy to **two different places**:

| Piece | What | Host |
|---|---|---|
| **Client** | the static Vite/React build (`dist/`) | **Vercel** |
| **Game server** | a Cloudflare Worker + Durable Object (`src/worker/index.ts`) | **Cloudflare** (via wrangler) |

Vercel can **not** host the game server — it's a stateful, always-running
WebSocket process. So the server is a Cloudflare Worker, and the client (on
Vercel) connects to it over `wss://`.

## 1. Deploy the game server (Cloudflare Worker)

You need a **free Cloudflare account**. Auth either way:

- **Interactive:** `npx wrangler login` (opens a browser, sign in), then deploy.
- **Token:** set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (token made
  from the "Edit Cloudflare Workers" template at
  https://dash.cloudflare.com/profile/api-tokens).

Then, from the project folder:

```bash
npm run party:deploy      # = wrangler deploy
```

It uses a **SQLite-backed Durable Object** (see `wrangler.jsonc`), which the
**Cloudflare free plan supports**. On success it prints your server URL, e.g.:

```
https://frost.<your-subdomain>.workers.dev
```

Copy that hostname (without `https://`). If it says you need a `workers.dev`
subdomain, register one for free under **Workers & Pages** in the dashboard.

## 2. Deploy the client (Vercel)

Connect the repo to Vercel (or `npx vercel`). Vercel auto-detects Vite via
`vercel.json` (build `npm run build`, output `dist`).

**Set one environment variable** in the Vercel project settings:

```
VITE_PARTYKIT_HOST = frost.<your-subdomain>.workers.dev
```

(No protocol, no trailing slash.) The client auto-uses secure `wss://` because
Vercel serves HTTPS. **Redeploy** the Vercel project after setting it so the
build picks it up.

> If `VITE_PARTYKIT_HOST` is not set, the deployed site still works but runs in
> **solo (offline)** mode. The HUD shows connection status (top-right).

## 3. Play

Open the Vercel URL in two browsers / share the link. Everyone auto-joins the
same shared world (room `frost`). The badge should read **● multiplayer**.

## Local dev (no deploy)

```bash
npm run party    # Cloudflare Worker locally via wrangler dev (:8787)
npm run dev      # Vite client (prints a localhost URL)
```

The client falls back to `localhost:8787` when `VITE_PARTYKIT_HOST` is unset.
