# Explore Poker Replica

A high-fidelity interactive recreation of the Explore card-based AI workspace,
built as a full-stack Next.js app and deployed to **Vercel**.

## Prerequisites

- Node.js `>=22.13.0`
- npm

## Local Development

```bash
npm install
npm run dev        # Next.js dev server on http://localhost:3000
```

## Build & Preview

```bash
npm run build       # next build
npm run start       # serve the production build locally
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

## Deploy to Vercel

The project is connected to the GitHub repository
`ShiWu-scholar/Poker` via Vercel Git integration — pushing to the deploy
branch (`master`) triggers an automatic production build.

1. Link the project once (creates a local `.vercel/` dir, gitignored):

   ```bash
   npx vercel link --yes --project explore-poker-replica --scope shiwu-scholar
   ```

2. Push to trigger a deployment:

   ```bash
   git push origin main:master
   ```

   Project settings: Framework Preset **Next.js**, build command `next build`,
   install command `npm install`, Node.js **22.x**.

### Deploying without Git integration (manual)

```bash
npx vercel      # preview deployment
npx vercel --prod
```

## Architecture

- `app/page.tsx` — the entire application UI (client component): card-based
  conversation workspace, markdown/KaTeX/mermaid rendering, clickable-term
  annotation, file upload, and BYOK (bring-your-own-key) model settings.
- `app/api/ai/route.ts` — OpenAI-compatible streaming proxy. The client sends
  `{ endpoint, apiKey, model, messages, stream }`; the server forwards to the
  user-supplied HTTPS endpoint and re-streams SSE. Includes an SSRF guard
  (`validateEndpoint`) that blocks private IPs, `localhost`, `.local`/`.internal`
  hostnames, and non-HTTPS URLs.
- `app/api/terms/route.ts` — standalone term-extraction endpoint used by the
  client to re-fetch annotations after a streaming reply closes.
- `app/api/upload/route.ts` — multipart text-file upload with a 10 MB cap and
  80 KB text truncation.
- `app/layout.tsx` — root layout (Geist fonts via `next/font/google`,
  self-hosted at build time).

All API routes use only Web-standard APIs (`fetch`, `ReadableStream`, SSE,
`AbortSignal.timeout`, `FormData`) and run on Vercel's Node.js runtime — no
Cloudflare-specific or Node.js-specific code.

## Configuration

The app is **BYOK** (bring-your-own-key): the client holds the model API key,
endpoint, and model in browser storage (`localStorage`/`sessionStorage`) and
sends them to the server routes, which proxy to the provider. **No server-side
environment variables are required.** The default API URL/model point at
DeepSeek for out-of-the-box debugging.

> Note: a convenience default API key is bundled into the client build for
> quick debugging. Treat it as a demo default — production use should supply
> your own key via the in-app model settings.

## Tests

```bash
node --test tests/interaction-contract.test.mjs
```

A static source-contract suite that regexes the app source to guard interaction
contracts (modals, panels, card branching, BYOK settings, accessibility). It is
runtime-agnostic.

## Learn More

- [Next.js](https://nextjs.org/docs)
- [Vercel](https://vercel.com/docs)
