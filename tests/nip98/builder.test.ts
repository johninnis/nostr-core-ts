import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { buildNip98AuthEvent } from "../../src/domain/service/nip98-builder.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { now } from "../../src/domain/service/timestamp.ts"
import { httpUrlFixture } from "../../testing.ts"

Deno.test("buildNip98AuthEvent - sets kind 27235 and empty content", () => {
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "GET" })
  assertEquals(event.kind, KIND_HTTP_AUTH)
  assertEquals(event.content, "")
})

Deno.test("buildNip98AuthEvent - emits u and method tags", () => {
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example/management"), method: "POST" })
  const uTag = event.tags.find((t) => t[0] === "u")
  const methodTag = event.tags.find((t) => t[0] === "method")
  assertEquals(uTag?.[1], "https://relay.example/management")
  assertEquals(methodTag?.[1], "POST")
})

Deno.test("buildNip98AuthEvent - omits payload tag when no body supplied", () => {
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "GET" })
  const payloadTag = event.tags.find((t) => t[0] === "payload")
  assertEquals(payloadTag, undefined)
})

Deno.test("buildNip98AuthEvent - omits payload tag when body is the empty string", () => {
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "GET", body: "" })
  const payloadTag = event.tags.find((t) => t[0] === "payload")
  assertEquals(payloadTag, undefined)
})

Deno.test("buildNip98AuthEvent - hashes the body into the payload tag", () => {
  const body = '{"method":"ping","params":[]}'
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "POST", body })
  const payloadTag = event.tags.find((t) => t[0] === "payload")
  assertEquals(payloadTag?.[1], sha256Hex(body))
})

Deno.test("buildNip98AuthEvent - preserves the caller's method string verbatim", () => {
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "post" })
  const methodTag = event.tags.find((t) => t[0] === "method")
  assertEquals(methodTag?.[1], "post")
})

Deno.test("buildNip98AuthEvent - sets created_at to the current timestamp", () => {
  const before = now()
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "GET" })
  const after = now()
  assertEquals(event.created_at >= before && event.created_at <= after, true)
})

Deno.test("buildNip98AuthEvent - omits expiration tag by default", () => {
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "GET" })
  assertEquals(event.tags.find((t) => t[0] === "expiration"), undefined)
})

Deno.test("buildNip98AuthEvent - emits expiration tag at created_at + expiresInSeconds", () => {
  const event = buildNip98AuthEvent({
    url: httpUrlFixture("https://relay.example"),
    method: "GET",
    expiresInSeconds: 300,
  })
  const expirationTag = event.tags.find((t) => t[0] === "expiration")
  assertEquals(expirationTag?.[1], String(event.created_at + 300))
})

for (const expiresInSeconds of [Number.NaN, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
  Deno.test(`buildNip98AuthEvent - throws InvalidArgumentError for an expiresInSeconds of ${expiresInSeconds}`, () => {
    assertThrows(
      () => buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "GET", expiresInSeconds }),
      InvalidArgumentError,
    )
  })
}

Deno.test("buildNip98AuthEvent - throws InvalidArgumentError when the expiration passes the safe integer range", () => {
  assertThrows(
    () =>
      buildNip98AuthEvent({
        url: httpUrlFixture("https://relay.example"),
        method: "GET",
        createdAt: Number.MAX_SAFE_INTEGER,
        expiresInSeconds: 1,
      }),
    InvalidArgumentError,
  )
})

Deno.test("buildNip98AuthEvent - writes its URL as the u tag, already in the form a validator compares", () => {
  const url = httpUrlFixture("https://x.example/y?")
  assertEquals(buildNip98AuthEvent({ url, method: "GET" }).tags.find((t) => t[0] === "u")?.[1], url)
})

Deno.test("buildNip98AuthEvent - hashes a byte body, such as an uploaded file, into the payload tag", () => {
  const body = new Uint8Array([0xff, 0x00, 0xd8, 0x01])
  const event = buildNip98AuthEvent({ url: httpUrlFixture("https://relay.example"), method: "POST", body })
  assertEquals(event.tags.find((tag) => tag[0] === "payload")?.[1], sha256Hex(body))
})

Deno.test("buildNip98AuthEvent - omits the payload tag for an empty byte body", () => {
  const event = buildNip98AuthEvent({
    url: httpUrlFixture("https://relay.example"),
    method: "POST",
    body: new Uint8Array(),
  })
  assertEquals(event.tags.some((tag) => tag[0] === "payload"), false)
})
