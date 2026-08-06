import { auth } from "@canva/user";
import type { BrandKit, BrandKitDraft } from "../shared/brand_kit";

export type GeneratedImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  mimeType: "image/svg+xml" | "image/png" | "image/jpeg";
};

export type GenerateResponse = {
  images: GeneratedImage[];
  /** Only present on the free endpoint. */
  freeGenerationsRemaining?: number;
};

export type ApiErrorCode =
  | "premium_required"
  | "free_limit_reached"
  | "invalid_prompt"
  | "invalid_brand_kit"
  | "brand_kit_limit_reached"
  | "unauthorized"
  | "server_error";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const KNOWN_CODES: ApiErrorCode[] = [
  "premium_required",
  "free_limit_reached",
  "invalid_prompt",
  "invalid_brand_kit",
  "brand_kit_limit_reached",
  "unauthorized",
  "server_error",
];

function codeForStatus(status: number, body: { error?: string }): ApiErrorCode {
  const fromBody = KNOWN_CODES.find((code) => code === body.error);
  if (fromBody) {
    return fromBody;
  }

  if (status === 401) {
    return "unauthorized";
  }
  if (status === 402 || status === 403) {
    return "premium_required";
  }
  if (status === 409) {
    return "brand_kit_limit_reached";
  }
  if (status === 429) {
    return "free_limit_reached";
  }
  return "server_error";
}

type RequestOptions = {
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
  /** Id of an open Canva tracking session. Premium requests only. */
  usageId?: string;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  // A short-lived JWT identifying the current Canva user. The backend verifies
  // it; never trust anything the frontend claims about entitlement.
  const token = await auth.getCanvaUserToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // Canva attributes premium usage using this header. It must be the id of an
  // open tracking session.
  if (options.usageId) {
    headers["Canva-Premium-Usage-Id"] = options.usageId;
  }

  const response = await fetch(`${BACKEND_HOST}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let parsed: { error?: string; message?: string } = {};
    try {
      parsed = await response.json();
    } catch {
      // Non-JSON error body — fall through to the status-based mapping.
    }

    throw new ApiError(
      codeForStatus(response.status, parsed),
      parsed.message ?? `Request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------
 * Brand kits — free for every user. See the note in shared/brand_kit.ts.
 * ---------------------------------------------------------------------- */

export async function listBrandKits(): Promise<BrandKit[]> {
  const { kits } = await request<{ kits: BrandKit[] }>("/api/brand-kits", {
    method: "GET",
  });
  return kits;
}

export async function createBrandKit(draft: BrandKitDraft): Promise<BrandKit> {
  const { kit } = await request<{ kit: BrandKit }>("/api/brand-kits", {
    method: "POST",
    body: draft,
  });
  return kit;
}

export async function deleteBrandKit(id: string): Promise<void> {
  await request<undefined>(`/api/brand-kits/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------
 * Generation
 * ---------------------------------------------------------------------- */

/** Free tier. Available to every user, no entitlement required. */
export function generateStandard(
  prompt: string,
  brandKitId?: string,
): Promise<GenerateResponse> {
  return request<GenerateResponse>("/api/generate/standard", {
    method: "POST",
    body: { prompt, brandKitId },
  });
}

/**
 * Premium tier. Must be called from inside an open tracking session, with that
 * session's id, so Canva can attribute the usage.
 */
export function generatePremium(
  prompt: string,
  style: string,
  usageId: string,
  brandKitId?: string,
): Promise<GenerateResponse> {
  return request<GenerateResponse>("/api/generate/premium", {
    method: "POST",
    body: { prompt, style, brandKitId },
    usageId,
  });
}
