import { describe, expect, it } from "vitest";
import { appLinkFrom } from "./signed-in.ts";

describe("appLinkFrom", () => {
  it("passes the nonce through to the app link", () => {
    expect(appLinkFrom("?rotating_token_nonce=abc123")).toBe(
      "kineo://sso-callback?rotating_token_nonce=abc123",
    );
  });

  it("works without the leading question mark", () => {
    expect(appLinkFrom("rotating_token_nonce=abc123")).toBe(
      "kineo://sso-callback?rotating_token_nonce=abc123",
    );
  });

  it("keeps every other param", () => {
    expect(appLinkFrom("?a=1&rotating_token_nonce=n&b=two")).toBe(
      "kineo://sso-callback?a=1&rotating_token_nonce=n&b=two",
    );
  });

  it("re-encodes values safely", () => {
    const link = appLinkFrom("?rotating_token_nonce=n&next=%2Fa%20b&x=1%262");
    expect(link).toBe("kineo://sso-callback?rotating_token_nonce=n&next=%2Fa+b&x=1%262");
  });

  it("does not let a value inject extra params or a different target", () => {
    const link = appLinkFrom("?rotating_token_nonce=n%26evil%3D1%23frag");
    expect(link).toBe("kineo://sso-callback?rotating_token_nonce=n%26evil%3D1%23frag");
  });

  it("returns the callback link without params when the query is empty", () => {
    expect(appLinkFrom("")).toBe("kineo://sso-callback");
    expect(appLinkFrom("?")).toBe("kineo://sso-callback");
  });

  it("keeps query params even without a nonce", () => {
    expect(appLinkFrom("?other=1")).toBe("kineo://sso-callback?other=1");
    expect(appLinkFrom("?rotating_token_nonce=")).toBe(
      "kineo://sso-callback?rotating_token_nonce=",
    );
    expect(appLinkFrom("?rotating_token_nonce&a=1")).toBe(
      "kineo://sso-callback?rotating_token_nonce=&a=1",
    );
  });
});
