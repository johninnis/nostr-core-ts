import { assert, assertEquals } from "@std/assert"
import { buildNip98AuthEvent, DEFAULT_AUTH_EXPIRATION_SECONDS } from "../../src/domain/service/nip98-builder.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { now } from "../../src/domain/value-object/timestamp.ts"

Deno.test("buildNip98AuthEvent - sets kind 27235 and empty content", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "GET" })
  assertEquals(event.kind, KIND_HTTP_AUTH)
  assertEquals(event.content, "")
})

Deno.test("buildNip98AuthEvent - emits u and method tags", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example/management", method: "POST" })
  const uTag = event.tags.find((t) => t[0] === "u")
  const methodTag = event.tags.find((t) => t[0] === "method")
  assertEquals(uTag?.[1], "https://relay.example/management")
  assertEquals(methodTag?.[1], "POST")
})

Deno.test("buildNip98AuthEvent - omits payload tag when no body supplied", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "GET" })
  const payloadTag = event.tags.find((t) => t[0] === "payload")
  assertEquals(payloadTag, undefined)
})

Deno.test("buildNip98AuthEvent - omits payload tag when body is the empty string", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "GET", body: "" })
  const payloadTag = event.tags.find((t) => t[0] === "payload")
  assertEquals(payloadTag, undefined)
})

Deno.test("buildNip98AuthEvent - hashes the body into the payload tag", async () => {
  const body = '{"method":"ping","params":[]}'
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "POST", body })
  const payloadTag = event.tags.find((t) => t[0] === "payload")
  assertEquals(payloadTag?.[1], await sha256Hex(body))
})

Deno.test("buildNip98AuthEvent - preserves the caller's method string verbatim", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "post" })
  const methodTag = event.tags.find((t) => t[0] === "method")
  assertEquals(methodTag?.[1], "post")
})

Deno.test("buildNip98AuthEvent - sets created_at to the current timestamp", async () => {
  const before = now()
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "GET" })
  const after = now()
  assertEquals(event.created_at >= before && event.created_at <= after, true)
})

Deno.test("buildNip98AuthEvent - omits expiration tag by default", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "GET" })
  assertEquals(event.tags.find((t) => t[0] === "expiration"), undefined)
})

Deno.test("buildNip98AuthEvent - emits expiration tag at created_at + expiresInSeconds", async () => {
  const event = await buildNip98AuthEvent({ url: "https://relay.example", method: "GET", expiresInSeconds: 300 })
  const expirationTag = event.tags.find((t) => t[0] === "expiration")
  assertEquals(expirationTag?.[1], String(event.created_at + 300))
})

Deno.test("DEFAULT_AUTH_EXPIRATION_SECONDS - is the spec-recommended 60-second window", () => {
  assertEquals(DEFAULT_AUTH_EXPIRATION_SECONDS, 60)
})

Deno.test("buildNip98AuthEvent - DEFAULT_AUTH_EXPIRATION_SECONDS is usable as a sensible default", async () => {
  const before = now()
  const event = await buildNip98AuthEvent({
    url: "https://relay.example",
    method: "GET",
    expiresInSeconds: DEFAULT_AUTH_EXPIRATION_SECONDS,
  })
  const after = now()
  const expirationTag = event.tags.find((t) => t[0] === "expiration")
  const expiresAt = Number(expirationTag?.[1])
  assert(expiresAt >= before + DEFAULT_AUTH_EXPIRATION_SECONDS)
  assert(expiresAt <= after + DEFAULT_AUTH_EXPIRATION_SECONDS)
})
