import { canServeHostedAssets, publicAssetOrigin } from "../public_url";

/**
 * Getting this wrong is expensive in both directions: serving hosted URLs from
 * a host Canva can't fetch breaks every insert in production, while inlining
 * data URLs in production reintroduces the ~6MB response this was built to
 * avoid. So each rule Canva imposes on external asset URLs gets a case.
 */
describe("publicAssetOrigin", () => {
  const previous = process.env.CANVA_BACKEND_HOST;

  afterEach(() => {
    process.env.CANVA_BACKEND_HOST = previous;
  });

  function withHost(host: string | undefined) {
    if (host === undefined) {
      delete process.env.CANVA_BACKEND_HOST;
    } else {
      process.env.CANVA_BACKEND_HOST = host;
    }
  }

  it("accepts a public HTTPS host", () => {
    withHost("https://api.example.com");
    expect(publicAssetOrigin()).toBe("https://api.example.com");
    expect(canServeHostedAssets()).toBe(true);
  });

  it("strips any path, returning only the origin", () => {
    withHost("https://api.example.com/base/path");
    expect(publicAssetOrigin()).toBe("https://api.example.com");
  });

  it("rejects plain HTTP", () => {
    withHost("http://api.example.com");
    expect(publicAssetOrigin()).toBeUndefined();
  });

  it("rejects localhost, so local development keeps using data URLs", () => {
    withHost("http://localhost:3001");
    expect(canServeHostedAssets()).toBe(false);

    // Even tunnelled to HTTPS, a loopback host is unreachable from Canva.
    withHost("https://localhost:3001");
    expect(canServeHostedAssets()).toBe(false);
  });

  it("rejects raw IP addresses, which Canva refuses outright", () => {
    withHost("https://203.0.113.10");
    expect(publicAssetOrigin()).toBeUndefined();
  });

  it("rejects an unset or unparseable host", () => {
    withHost(undefined);
    expect(publicAssetOrigin()).toBeUndefined();

    withHost("not a url");
    expect(publicAssetOrigin()).toBeUndefined();
  });
});
