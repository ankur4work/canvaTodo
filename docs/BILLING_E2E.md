# Verifying Pro plan billing end to end

This app meters one billable action: `generate_image`. This document is the
runbook for proving that metering works — before acceptance, locally, and for
real once Canva enrolls the app.

## How the money path actually works

Canva's Premium Apps Program has **no checkout of its own that you operate**.
You never take a payment. The flow is:

1. The user's Canva plan (Pro, Teams, Education, Non-profit…) either does or
   doesn't cover a given billable action.
2. Your app asks Canva whether it's covered (`monetization.isEnabled`).
3. If not, your app asks Canva to open **Canva's** upgrade dialog
   (`monetization.requestEnableBillableAction`). Canva bills the user.
4. When you do premium work, you wrap it in a **tracking session** and forward
   the session id to your backend. That is the usage record Canva pays you
   against.

So "billing works end to end" concretely means: **entitlement is checked, the
upgrade dialog opens for unentitled users, premium work is refused server-side
without an entitlement, and every premium unit of work is wrapped in exactly
one tracking session whose id reaches the backend.**

## The request contract

Premium generation request:

```
POST /api/generate/premium
Authorization: Bearer <Canva user token JWT>
Canva-Premium-Usage-Id: <tracking session id>
Content-Type: application/json

{ "prompt": "...", "style": "photographic", "brandKitId": "..." }
```

`brandKitId` is optional on both tiers. Brand kits are free for every user —
they can't be a paid feature, because Canva only meters the twelve billable
actions, so gating them would restrict something you'd never be paid for.

The backend rejects it unless **all** of the following hold:

| Check | Failure |
|---|---|
| Token signature valid for this `CANVA_APP_ID` | `401` |
| Token's `billableActions` claim includes `generate_image` | `403 premium_required` |
| `Canva-Premium-Usage-Id` present | `400` |

The free endpoint (`/api/generate/standard`) requires a valid token and
nothing else. It must never send a usage header — free work is not billable and
reporting it would misstate your usage.

## Prerequisites

1. Create the app at <https://www.canva.com/developers/apps>.
2. Put its ID in `.env` as `CANVA_APP_ID`. The backend refuses to start
   without it, and `npm start` will fail — that is expected, not a bug.
3. Copy **Developer Portal → Settings → Security → App origin** into
   `CANVA_APP_ORIGIN`. The backend locks CORS to it.
4. `npm start`, then set **Development URL** to `http://localhost:8080` in the
   portal and click **Preview**.

---

## Stage 1 — Pre-enrollment (the default, and what you submit first)

`PREMIUM_APPS_ENROLLED` in `src/premium/config.ts` is `false`.

Expected behaviour:

- No quality selector, no style selector, no crown anywhere.
- The monetization API is never called.
- Brand kits work fully — they are free for everyone.
- Generation works for everyone, capped by `FREE_GENERATIONS_PER_DAY`.

**Verify:**

```
1. Open the app in Canva. Confirm there is no crown and no "High quality ×4" option.
2. Create a brand kit with two obvious colours. It is selected automatically.
3. Generate an image. With IMAGE_PROVIDER=mock the output is drawn in your
   palette — that is brand-locking working end to end without an API key.
4. Click the image; it inserts into the design.
5. Open devtools → Network. Confirm requests go to /api/generate/standard
   and carry NO Canva-Premium-Usage-Id header.
```

This state is deliberate. The crown icons are reserved for enrolled apps and
Canva's type declarations warn that unauthorized use *"will result in a failed
review process"*. Submitting in this state is safe; submitting with a crown you
aren't entitled to is not.

---

## Stage 2 — Local premium simulation (before Canva accepts you)

You cannot get a real entitlement before enrollment, so simulate both halves.

1. `src/premium/config.ts` → `FORCE_PREMIUM_LOCALLY = true`
2. `.env` → `PREMIUM_DEV_OVERRIDE=true`
3. Restart `npm start`.

Both switches are required, and both are inert outside local development:
the frontend one only applies when `BACKEND_HOST` is localhost, and the backend
one is ignored entirely when `NODE_ENV=production`.

**Verify:**

```
1. The quality selector appears with a grey crown on "High quality ×4".
2. Select High quality ×4 → the style selector appears.
3. Generate. Network shows POST /api/generate/premium with a
   Canva-Premium-Usage-Id header of "dev-usage-id".
4. Four images come back. Each card shows the crown badge.
5. Now set PREMIUM_DEV_OVERRIDE=false, restart the backend, generate again.
   The request is refused with 403 premium_required — proving the server,
   not the UI, is what enforces entitlement.
```

Step 5 is the important one. A paywall that only exists in the frontend is not
a paywall.

**Turn both switches off again before you commit.**

---

## Stage 3 — Real Pro billing (after Canva accepts the app)

1. Set `PREMIUM_APPS_ENROLLED = true` in `src/premium/config.ts`.
2. Confirm `FORCE_PREMIUM_LOCALLY = false` and `PREMIUM_DEV_OVERRIDE=false`.
3. In Canva, open the **Dev Toolkit** and enable **Billable actions override**.
   That lets you toggle `generate_image` on and off for your own account
   without buying and cancelling a Pro plan. The override affects only your
   account and persists until you switch it off.

### 3a. Unentitled user — the upgrade path

Set the override so `generate_image` is **off**.

```
1. Open the app. The quality selector shows a GOLD crown on "High quality ×4".
2. Click "High quality ×4". Canva's upgrade dialog opens.
   - Do not build your own upgrade screen. Canva owns this dialog and
     handles conversion.
3. Dismiss it. The app stays on Standard and shows no error. Free
   generation still works — free features must never be withheld.
4. Accept the upgrade instead. The crown turns GREY and the tier switches.
```

### 3b. Entitled user — the billing path

Set the override so `generate_image` is **on**.

```
1. The crown is GREY.
2. Select High quality ×4 and generate.
3. Confirm in Network:
   - exactly ONE POST /api/generate/premium per press of Generate
   - a Canva-Premium-Usage-Id header holding a real session id
     (not "dev-usage-id")
4. Confirm the asset upload and insert requests fire AFTER the generate
   call completes, and carry no usage header. Upload is not billable
   work; including it in the session would overstate your usage.
```

### 3c. Entitlement revoked mid-session

```
1. With the app open and High quality ×4 selected, switch the Dev Toolkit override
   for generate_image to OFF.
2. Press Generate.
3. The backend returns 403 premium_required, the app shows a recoverable
   message and re-syncs entitlement rather than getting stuck.
```

## Common mistakes this app is built to avoid

- **Trusting the frontend.** `monetization.isEnabled` is explicitly documented
  as being "strictly for UI-related checks". Authorization happens in
  `src/backend/premium_guard.ts`, against a claim on a verified token.
- **One endpoint for several billable actions.** Each action gets its own
  endpoint, so an entitlement for one can't be spent on another.
- **Leaking the session.** `runBillableAction` closes the tracking session in a
  `finally`, so a failed generation still ends the session.
- **Doing non-billable work inside the session.** Only the generate call sits
  inside it. Upload, insert and analytics stay outside.
- **Retracting free features.** The free tier is unchanged whether or not the
  user is entitled.
