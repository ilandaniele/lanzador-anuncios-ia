import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/api/lib/errors";
import { base64urlEncode } from "../../../src/api/lib/hash";
import { parseSignedRequest } from "../../../src/api/lib/signed-request";
import {
  META_TEST_APP_SECRET,
  signEncodedPayload,
  signedRequestFor,
  signRequest,
} from "../../helpers/signed-request";

const parse = (value: unknown) =>
  parseSignedRequest(value, META_TEST_APP_SECRET);

async function expectBadSignature(value: unknown) {
  const error = await parse(value).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status: 400, code: "BAD_SIGNATURE" });
}

const encodeText = (text: string) =>
  base64urlEncode(new TextEncoder().encode(text));

describe("parseSignedRequest", () => {
  it("returns the Meta user id of a valid request", async () => {
    await expect(parse(await signedRequestFor("1234567890"))).resolves.toEqual({
      metaUserId: "1234567890",
    });
  });

  it("rejects a request signed with another secret", async () => {
    await expectBadSignature(await signedRequestFor("1234567890", "other"));
  });

  it("rejects a tampered payload", async () => {
    const [signature] = (await signedRequestFor("1234567890")).split(".");
    const forged = encodeText(
      JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" }),
    );
    await expectBadSignature(`${signature}.${forged}`);
  });

  it.each(["HMAC-SHA1", "hmac-sha256", "none", undefined])(
    "rejects algorithm %s even when the signature matches",
    async (algorithm) => {
      await expectBadSignature(
        await signRequest({ algorithm, user_id: "1234567890" }),
      );
    },
  );

  it.each([
    ["a missing user_id", { algorithm: "HMAC-SHA256" }],
    ["an empty user_id", { algorithm: "HMAC-SHA256", user_id: "" }],
    ["a numeric user_id", { algorithm: "HMAC-SHA256", user_id: 123 }],
    ["a non-object payload", "HMAC-SHA256"],
  ])("rejects %s", async (_, payload) => {
    await expectBadSignature(await signRequest(payload));
  });

  it("rejects a signed payload that is not JSON", async () => {
    await expectBadSignature(await signEncodedPayload(encodeText("not json")));
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "no-dot",
    ".",
    "a.",
    ".b",
    "a.b.c",
    "a+b.c/d",
    "abc=.def",
  ])("rejects malformed input %s", async (value) => {
    await expectBadSignature(value);
  });

  it("fails closed when the app secret is missing", async () => {
    await expect(
      parseSignedRequest(await signRequest({ algorithm: "HMAC-SHA256" }), ""),
    ).rejects.toThrow("META_APP_SECRET is not configured");
  });
});
