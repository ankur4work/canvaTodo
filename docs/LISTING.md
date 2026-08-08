# Marketplace listing copy — Brandpaint

Paste-ready text for the Developer Portal. Two rules govern everything here:

1. **No external links anywhere in listing copy.** Explicit Canva rule, and a
   common rejection reason.
2. **Nothing may imply Canva endorsement**, and "Canva" must not appear in the
   app name.

Every line below leads with brand consistency rather than image generation.
Canva ships Magic Media; a listing that reads as "an AI image generator" invites
a comparison this app loses and risks rejection for copycat functionality.

---

## The fields are far shorter than they look

The portal enforces hard character limits. There is no long-description field,
so everything has to land in two short blocks.

| Field | Limit | Used |
|---|---|---|
| App name | 18 | 10 |
| Short description | 50 | 43 |
| Description | 200 | 173 |

Canva's written-content rules that shape the wording below:

- No marketing claims — no "best", "powerful", "effortlessly".
- **No acronyms, initialisms or abbreviations.** This rules out "AI", which is
  why it appears nowhere in the copy despite being what the app runs on. The
  images are still labelled as AI-generated in the design itself, via
  `aiDisclosure`, which is where that disclosure is actually required.
- **No full stop on a single sentence** unless it contains other punctuation.
  So the short description has none and the description, being four sentences,
  has one on each.
- Short description and description must describe the same purpose. Both use
  the phrase "brand colors" rather than alternating with "palette".

## App name

```
Brandpaint
```

## Short description

No trailing full stop — deliberate, per the rule above.

```
Generate images in your saved brand colors
```

## Description

```
Save your brand colors and art direction once. Every image you generate stays within them. Click a result to add it to your design. Save a kit for each brand you work with.
```

---

## Testing instructions for reviewers

Reviewers who skip the brand kit will see a generic image generator and may
assess it as duplicating existing Canva functionality. Say this explicitly:

```
Brandpaint's purpose is that generated images match a saved brand palette.
Please create a brand kit before generating, or the distinguishing behavior
won't be visible.

1. Open the app in any design.
2. Click "New brand kit".
3. Name it "Test", then set two strongly contrasting colors — for example
   #FF1493 (pink) and #32CD32 (green). Leave art direction empty.
4. Click "Save brand kit". It is selected automatically.
5. Enter a prompt with no color in it, such as: a coffee cup on a desk
6. Click "Generate" and wait — generation takes roughly 15-30 seconds.
7. The result will be rendered in the saved palette rather than the colors
   the prompt would normally produce. This is the app's core behavior.
8. Click the image to insert it into the design.

To compare, select "No brand kit" and generate the same prompt again. The
difference between the two results is the app's entire purpose.

No account or login is required. No test credentials are needed.
```

---

## Marketplace graphics — what to show

The screenshots carry the differentiator more than the copy does.

- **Lead image:** the same prompt generated twice, side by side — once with no
  brand kit, once with a strong palette. The contrast makes the value obvious
  without a caption.
- **Second:** the brand kit panel with a saved palette visible.
- **Third:** a generated image inserted into a finished-looking design.

Avoid screenshots that show only a prompt box and a result. That is the
Magic Media comparison, framed by you.
