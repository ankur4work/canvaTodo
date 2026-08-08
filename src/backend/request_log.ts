import type { NextFunction, Request, Response } from "express";

/**
 * Minimal request logging.
 *
 * This exists because the first production incident — generated images failing
 * to insert — was undiagnosable: the container log contained exactly one line,
 * "Listening on '3001'", so there was no way to tell whether Canva's asset
 * fetcher had ever reached this server at all. One line per request answers
 * that in seconds.
 *
 * Deliberately does not log request bodies, headers, tokens or prompts.
 * Prompts are user content and the Authorization header is a credential;
 * neither belongs in a log file. The user id is included because it is needed
 * to trace a single user's session, and it is already an opaque Canva
 * identifier rather than personal data.
 */
export function requestLog() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      // Canva fetches asset URLs from its own infrastructure, so seeing this
      // user agent on /api/assets is the proof that the hosted image path is
      // working end to end.
      const agent = req.get("user-agent") ?? "-";

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Math.round(ms),
          bytes: res.get("content-length") ?? "-",
          user: req.canva?.user?.userId ?? "-",
          agent: agent.slice(0, 80),
        }),
      );
    });

    next();
  };
}
