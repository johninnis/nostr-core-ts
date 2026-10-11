import { assertEquals } from "@std/assert"
import { mintKeysetUrl, parseMintKeysets } from "../../src/domain/service/mint-keyset.ts"
import { webUrlFixture } from "../../testing.ts"
import { CASHU_DLEQ_VECTORS } from "../support/cashu-dleq.ts"

const KEYSET_ID = "009a1f293253e41e"
const KEY_OF_1 = "02194603ffa36356f4a56b7df9371fc3192472351453ec7398b8da8117e7c3e104"
const KEY_OF_2 = "03b0f36d6d47ce14df8a7be9137712c42bcdd960b19dd02f1d4a9703b1f31d7513"

const keysetWith = (fields: Readonly<Record<string, unknown>>): unknown => ({
  keysets: [{ id: KEYSET_ID, unit: "sat", active: true, keys: { "1": KEY_OF_1 }, ...fields }],
})

const keysOf = (keys: Readonly<Record<string, unknown>>): ReadonlyArray<readonly [number, string]> => [
  ...(parseMintKeysets(keysetWith({ keys }))[0]?.keys ?? []),
]

Deno.test("parseMintKeysets - reads a keyset's id as written", () => {
  assertEquals(parseMintKeysets(keysetWith({}))[0]?.id, KEYSET_ID)
})

Deno.test("parseMintKeysets - reads a keyset's unit as written", () => {
  assertEquals(parseMintKeysets(keysetWith({ unit: "USD" }))[0]?.unit, "USD")
})

Deno.test("parseMintKeysets - reads a keyset's keys by amount", () => {
  assertEquals(keysOf({ "1": KEY_OF_1, "2": KEY_OF_2 }), [[1, KEY_OF_1], [2, KEY_OF_2]])
})

Deno.test("parseMintKeysets - reads every keyset, in the order the mint serves them", () => {
  const response = { keysets: [{ id: "00aa", unit: "sat", keys: {} }, { id: "00bb", unit: "usd", keys: {} }] }
  assertEquals(parseMintKeysets(response).map((keyset) => keyset.id), ["00aa", "00bb"])
})

Deno.test("parseMintKeysets - reads the shared vectors' keys response", () => {
  assertEquals(parseMintKeysets(CASHU_DLEQ_VECTORS.keysResponse).map((keyset) => keyset.keys.size), [3])
})

for (
  const [what, response] of [
    ["null", null],
    ["a string", "keysets"],
    ["an array", [{ id: KEYSET_ID, unit: "sat", keys: {} }]],
    ["an object without keysets", {}],
    ["an object whose keysets are an object", { keysets: { id: KEYSET_ID, unit: "sat", keys: {} } }],
  ] as const
) {
  Deno.test(`parseMintKeysets - ${what} reads as no keysets`, () => {
    assertEquals(parseMintKeysets(response), [])
  })
}

for (
  const [what, fields] of [
    ["an id that is not a string", { id: 9 }],
    ["no id", { id: undefined }],
    ["a unit that is not a string", { unit: null }],
    ["no unit", { unit: undefined }],
    ["keys that are an array", { keys: [KEY_OF_1] }],
    ["keys that are a string", { keys: KEY_OF_1 }],
    ["no keys", { keys: undefined }],
  ] as const
) {
  Deno.test(`parseMintKeysets - a keyset with ${what} is dropped`, () => {
    assertEquals(parseMintKeysets(keysetWith(fields)), [])
  })
}

Deno.test("parseMintKeysets - a keyset that is not an object is dropped, and the rest kept", () => {
  const response = { keysets: ["00aa", { id: "00bb", unit: "sat", keys: {} }] }
  assertEquals(parseMintKeysets(response).map((keyset) => keyset.id), ["00bb"])
})

Deno.test("parseMintKeysets - an amount of zero is kept", () => {
  assertEquals(keysOf({ "0": KEY_OF_1 }), [[0, KEY_OF_1]])
})

Deno.test("parseMintKeysets - the largest safe integer amount is kept", () => {
  assertEquals(keysOf({ "9007199254740991": KEY_OF_1 }), [[9007199254740991, KEY_OF_1]])
})

for (
  const amount of ["01", "-1", "+1", "1.0", "1e3", " 1", "0x10", "", "9007199254740992", "one"]
) {
  Deno.test(`parseMintKeysets - a key whose amount is "${amount}" is dropped`, () => {
    assertEquals(keysOf({ [amount]: KEY_OF_2, "1": KEY_OF_1 }), [[1, KEY_OF_1]])
  })
}

Deno.test("parseMintKeysets - a key that is not a string is dropped", () => {
  assertEquals(keysOf({ "1": KEY_OF_1, "2": 2 }), [[1, KEY_OF_1]])
})

Deno.test("parseMintKeysets - a key that is no curve point is kept as written", () => {
  assertEquals(keysOf({ "1": "not a key" }), [[1, "not a key"]])
})

Deno.test("mintKeysetUrl - is NUT-02's keys endpoint for the keyset at the mint", () => {
  assertEquals(
    mintKeysetUrl(webUrlFixture("https://mint.example"), KEYSET_ID),
    `https://mint.example/v1/keys/${KEYSET_ID}`,
  )
})

Deno.test("mintKeysetUrl - keeps the mint's path", () => {
  assertEquals(
    mintKeysetUrl(webUrlFixture("https://mint.example/cashu/api"), KEYSET_ID),
    `https://mint.example/cashu/api/v1/keys/${KEYSET_ID}`,
  )
})

Deno.test("mintKeysetUrl - writes one slash after a mint written with a trailing slash", () => {
  assertEquals(
    mintKeysetUrl(webUrlFixture("https://mint.example/"), KEYSET_ID),
    `https://mint.example/v1/keys/${KEYSET_ID}`,
  )
})

Deno.test("mintKeysetUrl - writes one slash after a mint written with several trailing slashes", () => {
  assertEquals(
    mintKeysetUrl(webUrlFixture("https://mint.example/cashu//"), KEYSET_ID),
    `https://mint.example/cashu/v1/keys/${KEYSET_ID}`,
  )
})

Deno.test("mintKeysetUrl - keeps the mint exactly as written (shared ADR-0121)", () => {
  assertEquals(
    mintKeysetUrl(webUrlFixture("HTTPS://Mint.example"), KEYSET_ID),
    `HTTPS://Mint.example/v1/keys/${KEYSET_ID}`,
  )
})

Deno.test("mintKeysetUrl - keeps a keyset id in upper-case hex as written", () => {
  assertEquals(mintKeysetUrl(webUrlFixture("https://mint.example"), "00AB"), "https://mint.example/v1/keys/00AB")
})

for (
  const [what, keysetId] of [
    ["the empty string", ""],
    ["a path", "../../admin"],
    ["a hex id with a slash", "009a/1f29"],
    ["a hex id with a query", "009a?x=1"],
    ["a character that is not hex", "009g"],
    ["an encoded slash", "00%2F"],
  ] as const
) {
  Deno.test(`mintKeysetUrl - a keyset id that is ${what} has no URL`, () => {
    assertEquals(mintKeysetUrl(webUrlFixture("https://mint.example"), keysetId), null)
  })
}

for (
  const [what, mint] of [
    ["a query", "https://mint.example/?x=1"],
    ["an empty query", "https://mint.example/cashu?"],
    ["a fragment", "https://mint.example/#f"],
    ["an empty fragment", "https://mint.example/cashu#"],
  ] as const
) {
  Deno.test(`mintKeysetUrl - a mint written with ${what} has no keys URL`, () => {
    assertEquals(mintKeysetUrl(webUrlFixture(mint), KEYSET_ID), null)
  })
}
