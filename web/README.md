# Web dashboard (for everyone)

A small **Next.js** app: in the browser, **without wallet keys**, check that **Nado testnet** responds and load **recent candles**. Calls go **server-side** (Next.js API routes) so the browser avoids CORS issues with Nado endpoints.

## Run locally

```powershell
cd .\web\
npm install
npm run dev
```

Open: `http://localhost:3000`

## Deploy (Vercel — good for a public URL)

1. Repo is already on GitHub (`nado-builder-toolkit`).
2. On [vercel.com](https://vercel.com) → **Add New Project** → import `nado-builder-toolkit`.
3. Set **Root Directory** to **`web`** (required).
4. Deploy. You get a URL like `https://<project>.vercel.app` — use it as your **website** or alongside GitHub Pages.

## Limitation

Some cloud IPs may be **blocked by Nado’s edge** (`blocked: true`). If that happens in production, local `npm run dev` often works on a home network; try another host or your own proxy.
