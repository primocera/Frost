# Deploying Frost

Frost has **two pieces** that deploy to **two different places**:

| Piece | What | Host |
|---|---|---|
| **Client** | the static Vite/React build (`dist/`) | **Vercel** |
| **Game server** | the authoritative PartyKit room (`src/party/server.ts`) | **Cloudflare** (via PartyKit) |

Vercel can **not** host the game server — it's a stateful, always-running WebSocket
process, and Vercel only runs short-lived stateless functions. So the server goes
to PartyKit/Cloudflare, and the client (on Vercel) connects to it over `wss://`.

## 1. Deploy the game server (PartyKit → Cloudflare)

```bash
npx partykit deploy
```

The first run asks you to log in (GitHub) and links a Cloudflare account.
It prints your server URL, e.g.:

```
Deployed frost to https://frost.<your-account>.partykit.dev
```

Copy that hostname (without `https://`).

## 2. Deploy the client (Vercel)

Connect the repo to Vercel (or `npx vercel`). Vercel auto-detects Vite via
`vercel.json` (build `npm run build`, output `dist`).

**Set one environment variable** in the Vercel project settings:

```
VITE_PARTYKIT_HOST = frost.<your-account>.partykit.dev
```

(No protocol, no trailing slash.) This is what the client connects to. The client
auto-uses secure `wss://` because the Vercel site is served over HTTPS.

> If `VITE_PARTYKIT_HOST` is **not** set, the deployed site still works but runs in
> **solo (offline)** mode — it can't reach a multiplayer server. The HUD shows the
> connection status (top-right).

## 3. Play

Open the Vercel URL in two browsers / share the link. Everyone auto-joins the same
shared world (room `frost`). The badge should read **● multiplayer**.

## Local dev (no deploy)

```bash
npm run party   # PartyKit server on :1999
npm run dev      # Vite client (prints a localhost URL)
```

The client falls back to `localhost:1999` when `VITE_PARTYKIT_HOST` is unset.
