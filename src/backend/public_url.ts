/**
 * Decides whether generated images can be served as hosted URLs, or have to be
 * inlined as base64 data URLs.
 *
 * Canva fetches external asset URLs from its own infrastructure, not from the
 * browser, and imposes hard requirements on them: HTTPS, publicly reachable,
 * correct `Content-Type`, no redirects, no raw IP addresses. A localhost
 * backend satisfies none of that, so local development has to keep using data
 * URLs — otherwise every insert would fail with nothing useful to show for it.
 *
 * The result is a backend that inlines images in development and serves URLs
 * in production, chosen from `CANVA_BACKEND_HOST` alone. Nothing else needs to
 * know which mode is active.
 */

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function parsed(): URL | undefined {
  const configured = process.env.CANVA_BACKEND_HOST?.trim();

  if (!configured) {
    return undefined;
  }

  try {
    return new URL(configured);
  } catch {
    return undefined;
  }
}

/**
 * The origin Canva should fetch assets from, or `undefined` when this backend
 * isn't publicly reachable under Canva's rules.
 */
export function publicAssetOrigin(): string | undefined {
  const url = parsed();

  if (!url || url.protocol !== "https:") {
    return undefined;
  }

  const host = url.hostname;

  // Canva rejects IP-address URLs outright, and a loopback or link-local host
  // is unreachable from Canva's fetchers even when it is HTTPS.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    IPV4.test(host) ||
    host.includes(":")
  ) {
    return undefined;
  }

  return url.origin;
}

/** True when images should be served as URLs rather than inlined. */
export function canServeHostedAssets(): boolean {
  return publicAssetOrigin() !== undefined;
}
