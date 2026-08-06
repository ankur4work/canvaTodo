import type { NextFunction, Request, Response } from "express";
import { requireBillableAction } from "../premium_guard";

/**
 * Builds a token shaped like a verified Canva user token. The guard only ever
 * reads claims off tokens that `user.verifyToken` has already accepted, so the
 * signature segment is irrelevant here.
 */
function tokenWithClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

type Headers = Record<string, string | undefined>;

function requestWith(headers: Headers): Request {
  return {
    header: (name: string) => headers[name],
  } as unknown as Request;
}

function responseSpy() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, res: { status } as unknown as Response };
}

describe("requireBillableAction", () => {
  const guard = requireBillableAction("generate_image");
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    delete process.env.PREMIUM_DEV_OVERRIDE;
  });

  it("allows a user entitled to the action", () => {
    const req = requestWith({
      Authorization: `Bearer ${tokenWithClaims({ billableActions: ["generate_image"] })}`,
      "Canva-Premium-Usage-Id": "session-1",
    });
    const { status, res } = responseSpy();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects a user whose plan lacks the action", () => {
    const req = requestWith({
      Authorization: `Bearer ${tokenWithClaims({ billableActions: ["generate_text"] })}`,
      "Canva-Premium-Usage-Id": "session-1",
    });
    const { status, json, res } = responseSpy();

    guard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "premium_required" }),
    );
  });

  it("rejects a token with no billableActions claim at all", () => {
    const req = requestWith({
      Authorization: `Bearer ${tokenWithClaims({ userId: "u1" })}`,
      "Canva-Premium-Usage-Id": "session-1",
    });
    const { status, res } = responseSpy();

    guard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("rejects an entitled user who sent no tracking session id", () => {
    const req = requestWith({
      Authorization: `Bearer ${tokenWithClaims({ billableActions: ["generate_image"] })}`,
    });
    const { status, res } = responseSpy();

    guard(req, res, next);

    // Without a usage id Canva cannot attribute — or pay for — the work.
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it("rejects a request with no token", () => {
    const req = requestWith({ "Canva-Premium-Usage-Id": "session-1" });
    const { status, res } = responseSpy();

    guard(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
  });

  it("refuses the development usage id when the override is off", () => {
    const req = requestWith({
      Authorization: `Bearer ${tokenWithClaims({ billableActions: ["generate_image"] })}`,
      "Canva-Premium-Usage-Id": "dev-usage-id",
    });
    const { status, res } = responseSpy();

    guard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("ignores the override when NODE_ENV is production", () => {
    const previous = process.env.NODE_ENV;
    process.env.PREMIUM_DEV_OVERRIDE = "true";
    process.env.NODE_ENV = "production";

    const req = requestWith({
      Authorization: `Bearer ${tokenWithClaims({ billableActions: [] })}`,
      "Canva-Premium-Usage-Id": "session-1",
    });
    const { status, res } = responseSpy();

    guard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);

    process.env.NODE_ENV = previous;
  });
});
