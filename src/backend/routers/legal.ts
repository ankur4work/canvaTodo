import express from "express";
import privacyPolicyHtml from "../legal/privacy-policy.html";
import termsHtml from "../legal/terms.html";

/**
 * Serves the privacy policy and terms.
 *
 * Canva requires both to be reachable at stable public URLs, and reviewers do
 * open them. Serving them from this backend rather than from the main site
 * means nothing else can shadow the path, and they are versioned in this repo
 * alongside the code whose behaviour they describe — so a change to what the
 * app stores and a change to the policy describing it land in the same commit.
 *
 * The HTML is inlined at build time by esbuild's text loader, so these pages
 * ship inside the same single-file bundle as the rest of the backend and there
 * is nothing extra to copy into the image.
 *
 * Mounted ahead of token verification: these have to be readable by anyone,
 * including a reviewer who is not signed in to Canva.
 */
export function createLegalRouter(): express.Router {
  const router = express.Router();

  const page = (html: string) => (_req: express.Request, res: express.Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Publicly cacheable, but short enough that a correction goes live the
    // same day rather than sitting stale in a proxy.
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(html);
  };

  // Both the bare and trailing-slash forms, because a URL typed into the
  // Developer Portal with a stray slash must not 404.
  router.get(["/privacy", "/privacy/"], page(privacyPolicyHtml));
  router.get(["/terms", "/terms/"], page(termsHtml));

  return router;
}
