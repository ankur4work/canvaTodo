# Deploying the backend to Coolify

The frontend is uploaded to Canva as a bundle and served by Canva. **Only the
backend is deployed here** — nothing on this server serves the app UI.

Target: `https://canva-api.onkra.online` on the Coolify host `91.239.208.85`.

Canva's requirements that constrain all of this: **HTTPS**, publicly reachable,
no free hosting tiers (explicitly rejected in review), no IP-address hostnames,
and a stable hostname you can bake into the bundle before you build it.

## 0. DNS first

```
A    canva-api.onkra.online    →    91.239.208.85
```

Do this before creating the app in Coolify. Traefik asks Let's Encrypt for a
certificate as soon as the domain is attached, and that request fails if DNS
doesn't already resolve. A failed issuance retries, but it's slower than just
getting the order right.

> Do **not** use a `*.91.239.208.85.sslip.io` hostname for this app, even though
> other apps on this host do. Canva's asset URL rules forbid IP addresses, and a
> hostname with the IP embedded in it is an argument you don't want to have
> during review.

## 1. Create the app in Coolify

New **Project** (keep it isolated from the other projects on this host) →
**Production** environment → **New Resource** → **Private Repository**.

| Setting | Value |
|---|---|
| Repository | `ankur4work/canvaTodo` |
| Branch | `main` |
| Build Pack | **Dockerfile** |
| Dockerfile location | `/Dockerfile` |
| Ports Exposed | `3001` |
| Domain | `https://canva-api.onkra.online` |

The `Dockerfile` at the repo root builds a single esbuild bundle and runs it on
`node:22-alpine` as a non-root user, with no `node_modules` in the final image.
See the comments in it for why it's built that way.

## 2. Persistent storage — do not skip this

Add a **persistent volume** mounted at `/data`.

Container filesystems do not survive a redeploy. Without this volume, every
deploy silently discards every brand kit your users have saved — and brand kits
are the differentiator this whole app rests on. The loss is invisible until a
user complains.

```
Mount path:  /data
```

Then set `BRAND_KIT_DATA_FILE=/data/brand-kits.json` below.

## 3. Environment variables

Set these in Coolify → your app → **Environment Variables**. They are not read
from `.env`; that file is gitignored and never reaches the image.

```ini
CANVA_APP_ID=AAHOGNzTe3k
CANVA_APP_ORIGIN=https://app-aahognzte3k.canva-apps.com
CANVA_BACKEND_PORT=3001
CANVA_BACKEND_HOST=https://canva-api.onkra.online
NODE_ENV=production

IMAGE_PROVIDER=openai
OPENAI_API_KEY=<your key>

BRAND_KIT_DATA_FILE=/data/brand-kits.json
FREE_GENERATIONS_PER_DAY=25
MODERATION_FAIL_MODE=open
```

`CANVA_BACKEND_HOST` matters on the server as well as at build time: the backend
reads it to decide whether it can serve images as hosted URLs instead of
inlining ~6MB of base64 per premium generation. See `src/backend/public_url.ts`.

**`PREMIUM_DEV_OVERRIDE` must be absent.** It is ignored when
`NODE_ENV=production` anyway, but don't rely on that alone — it exists to let
premium endpoints run without a real Canva entitlement.

## 4. Deploy, then verify from outside

```bash
# Health check is public.
curl -s -o /dev/null -w '%{http_code}\n' https://canva-api.onkra.online/healthz
# expect 200

# Everything else must reject unauthenticated callers.
curl -s -X POST https://canva-api.onkra.online/api/generate/standard \
  -H 'Content-Type: application/json' -d '{"prompt":"test"}'
# expect 401 TOKEN_MISSING

curl -s -X POST https://canva-api.onkra.online/api/generate/premium \
  -H 'Content-Type: application/json' -d '{"prompt":"test"}'
# expect 401 TOKEN_MISSING

# The asset endpoint is deliberately unauthenticated — it must 404, not 401.
curl -s -o /dev/null -w '%{http_code}\n' \
  https://canva-api.onkra.online/api/assets/doesnotexist
# expect 404
```

That last check is the one people get wrong. Canva fetches asset URLs from its
own infrastructure with no user token to present, so `/api/assets/:id` is
mounted ahead of token verification. A `401` there means someone "fixed" the
mount order and every image insert will fail in production.

## 5. Point the uploaded bundle at it

The frontend bakes the backend URL in at **build time**. On your machine, in
`.env`:

```ini
CANVA_BACKEND_HOST=https://canva-api.onkra.online
```

Then `npm run build`, and upload `dist/` to Canva. The build warns if this still
says localhost — that warning means the bundle you're about to upload cannot
reach a backend.

Set it back to `http://localhost:3001` afterwards for local development.

## 6. First real test of the hosted image path

Locally, images are always returned as base64 data URLs, because there is no
publicly reachable URL to hand Canva from localhost. **The hosted URL path only
runs once deployed**, so the first time it is ever exercised is against this
server. Generate an image in Canva and confirm it inserts.

## Things that will bite you

- **A second set of CORS headers.** The app locks CORS to your Canva app origin
  itself. If you add `Access-Control-Allow-Origin` in Coolify's Traefik labels
  too, browsers reject the response. Let the app own it.
- **Missing the `/data` volume.** Covered above, and worth repeating: it fails
  silently.
- **`npm ci` and workspaces.** `package.json` declares
  `workspaces: ["./examples/*/*"]`, so `examples/` must stay in the Docker build
  context or the build fails. `.dockerignore` documents this.
- **Coolify injects your env vars into the build as `ARG`s.** That includes
  `NODE_ENV=production`, which makes `npm ci` drop devDependencies — where
  esbuild lives. The failure surfaces as `sh: esbuild: not found` with nothing
  pointing at the real cause. The builder stage passes `--include=dev` to be
  immune to it. Don't remove that flag.
- **Your OpenAI key is passed as a build `ARG`.** Docker warns
  `SecretsUsedInArgOrEnv` on every build, and it is a fair warning: ARG values
  can persist in image layer history. The image is local to your own server and
  never pushed to a registry, so the exposure is limited — but if you want it
  gone, untick **Build Variable?** on `OPENAI_API_KEY` in Coolify. The backend
  only reads it at runtime, so nothing breaks.
- **The free-tier counter is in-memory** and resets on every deploy. Fine on one
  instance; move it to Redis before running two.
- **The brand kit store is a single JSON file.** Two containers behind a load
  balancer will clobber each other. Implement `BrandKitStore` against Postgres
  first — it is one interface in `src/backend/brand_kit_store.ts`.
- **OpenAI spend.** Premium generates four images per press, on an endpoint open
  to the internet. Set a billing limit on the OpenAI account *before* going
  live. You pay per generation; Canva pays you monthly.
