# Submitting this app

## The order that actually works

Premium Apps is **invitation only**, and eligibility depends on usage you don't
have yet: Canva looks for "consistent monthly active user growth with good
retention". So the sequence is:

1. Ship the free app publicly (this repo's default state).
2. Grow real usage.
3. Apply to the Premium Apps Program.
4. Flip `PREMIUM_APPS_ENROLLED` and ship the premium tier.

Trying to submit with premium UI before step 3 fails review, because the crown
icons are restricted to enrolled apps.

Applications and listing are free. There is no listing fee and Canva takes no
cut of anything, because you never take a payment yourself.

## Before you submit

### Switch off the mock provider

`IMAGE_PROVIDER=mock` generates SVG placeholders so the billing path can be
tested without an API key. It is not shippable. Set `IMAGE_PROVIDER=openai` and
`OPENAI_API_KEY` for real generation.

### Response size — handled, but know how

`gpt-image-1` returns ~1MB PNGs and a premium generation makes four of them, so
base64 data URLs would mean a ~6MB JSON body per generation. The backend
therefore stores images and returns HTTPS URLs instead (`asset_store.ts`,
`routers/assets.ts`), falling back to data URLs only when `CANVA_BACKEND_HOST`
is not a public HTTPS host — which is exactly the local development case.

The practical consequence: **hosted URLs are only exercised once you deploy.**
Locally you are always on the data URL path, so test insert again on the real
host before submitting. Canva's requirements for external asset URLs are HTTPS,
publicly reachable, correct `Content-Type`, no redirects, no IP addresses,
≤50MB; `public_url.ts` enforces the host-shaped ones.

### Scopes

Two scopes must be enabled in the Developer Portal under **Scopes**:

| Scope | Needed by | Symptom if missing |
|---|---|---|
| `canva:asset:private:write` | `upload()` | Image generates, then insert fails |
| `canva:design:content:write` | `addElement()` | Image uploads to the library, then insert fails |

They fail one after the other, so fixing the first just reveals the second.
Generation succeeds either way, so the app looks healthy right up until a user
clicks a result. The Dev Toolkit reports both as `missing_scopes` and names the
exact scope.

Scopes are portal configuration, not code, so they do not travel with the repo
or the bundle. Re-check them if you ever create a second app entry.

### Prove the differentiator

Reviewers check for copycat functionality, and Canva ships Magic Media. The
brand kit is the answer: generations are constrained to a saved palette and
art direction. Make that obvious in the listing copy and screenshots — lead
with brand consistency, not "AI image generator".

### Hosting

- Canva rejects free tiers (Glitch, Heroku free) for production backends.
- Set `CANVA_BACKEND_HOST` to your production HTTPS URL. The webpack build
  warns if it still points at localhost.
- The backend needs `express`, `cors`, `dotenv` and `@canva/app-middleware` at
  runtime. All four are in `dependencies`; `express` and `dotenv` were moved
  there from `devDependencies`, where the starter kit had left them because it
  treats backends as examples. A `npm install --omit=dev` on the VPS boots.
- Scale note: the free-tier counter in `src/backend/free_tier.ts` is in-memory
  and the brand kit store in `src/backend/brand_kit_store.ts` is a JSON file.
  Both are single-instance. Move them to Redis/Postgres before running more
  than one backend instance.
- Full server setup for your own box: see `DEPLOY.md`.

### Verify these by hand

- [ ] Works with **and without** an active session.
- [ ] Light and dark theme both render correctly.
- [ ] Tested across fixed and responsive design types.
- [ ] Every button, link and endpoint works.
- [ ] Prompt input rejects empty and over-long input gracefully.
- [ ] `npm run lint:check` and `npm test` pass.
- [ ] `npm run build` succeeds and `dist/` is what you upload.

### Content and listing

- [ ] App name, description and feature overview written and proofread.
- [ ] **No external links** in listing copy — this is an explicit rule.
- [ ] Marketplace graphics prepared.
- [ ] UI strings extracted for localization (`npm run extract` runs as part of
      `npm run build`).
- [ ] Privacy policy and terms live on your own domain. It must disclose that
      you store brand kits (palette, art direction) keyed to a Canva user id,
      and that prompts are sent to OpenAI.
- [ ] Test account credentials supplied if reviewers need them. This app needs
      none — it has no login, by design. Requiring auth to use free features
      is disallowed under the Premium Apps rules.

### Compliance specific to an AI app

- [ ] `aiDisclosure: "app_generated"` is set on every upload. It is a required
      field and it must be truthful. Already wired in `app.tsx`.
- [x] Input filter for offensive prompts. `src/backend/moderation.ts` runs
      OpenAI's moderation endpoint before any generation on both tiers, so a
      refused prompt costs nothing and is never billed. It blocks a deliberately
      narrow set of categories — `violence` alone would reject a battle scene —
      plus a local backstop for sexualised-minor prompts that applies even when
      the API is unreachable. Tune with `MODERATION_FAIL_MODE`.
- [ ] Alt text is set on inserted images (currently the prompt text).

### Security

- [ ] CORS locked to your app origin, not `*`. Already wired in `server.ts`.
- [ ] User tokens verified server-side only, never in the frontend.
- [ ] `GET /api/assets/:id` is intentionally unauthenticated and mounted ahead
      of `verifyToken`. Canva fetches asset URLs from its own infrastructure
      with no user token to present, so requiring one would make the endpoint
      unreachable by its only client. The 32-byte CSPRNG id in the URL is the
      capability, and it expires within the hour. Don't "fix" this by adding
      auth — it will break every insert in production.
- [ ] Separate endpoint per billable action.
- [ ] `PREMIUM_DEV_OVERRIDE` unset in production. It is also ignored whenever
      `NODE_ENV=production`, but don't rely on that alone.
- [ ] `FORCE_PREMIUM_LOCALLY` is `false` in `src/premium/config.ts`.

## Review process

Submit through the Developer Portal: upload the `dist/` bundle, fill in listing
details, agree to terms, submit. A Jira Service Desk ticket is created
automatically and is where reviewers talk to you.

Canva declines to publish an expected duration — it depends on complexity and
how much feedback you need. Developer reports put design review in the range of
1–4 weeks, with initial functionality testing taking a few business days. Budget
for two or three rounds of feedback on a first submission.

An app can be submitted at most **5 times per day**. While a submission is in
review the app can't be modified — cancel the submission to make changes.

Approved public apps are released **on demand by you**, not automatically.

## If you are accepted into Premium Apps

Read `BILLING_E2E.md` stage 3 before flipping the flag. Also note the program
commitments:

- The majority of features must stay free, with only a small portion premium.
- Free features must not be retracted later.
- If Canva puts you on the "gated" model, you must remove any paywalls of your
  own, off-platform logins and credit systems.
- You commit to supporting the app for at least **1 year**.
