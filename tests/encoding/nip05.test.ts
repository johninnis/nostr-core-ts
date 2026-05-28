import { assertEquals } from "@std/assert"
import { DEFAULT_NIP05_TIMEOUT_MS, resolveNip05 } from "../../src/application/service/nip05-resolver.ts"
import type { HttpClient, HttpResponse } from "../../src/application/port/http.ts"
import { NetworkError } from "../../src/application/port/http.ts"
import { parseNip05Id } from "../../src/domain/value-object/nip05-id.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"

const HEX_PUBKEY = "a".repeat(64)

const response = (status: number, body: unknown): HttpResponse => ({
  status,
  headers: new Headers(),
  json: () => Promise.resolve(ok(body)),
  blob: () => Promise.resolve(ok(new Blob())),
  text: () => Promise.resolve(ok("")),
})

const okClient = (status: number, body: unknown): HttpClient => ({
  request: () => Promise.resolve(ok(response(status, body))),
})

const failingClient = (): HttpClient => ({
  request: () => Promise.resolve(failure(new NetworkError("offline"))),
})

Deno.test("resolveNip05 - returns the pubkey for a matching name", async () => {
  const client = okClient(200, { names: { alice: HEX_PUBKEY } })
  assertEquals(await resolveNip05(parseNip05Id("alice@example.com"), client), HEX_PUBKEY)
})

Deno.test("resolveNip05 - parseNip05Id lowercases an upper-case name", async () => {
  const client = okClient(200, { names: { alice: HEX_PUBKEY } })
  assertEquals(await resolveNip05(parseNip05Id("Alice@example.com"), client), HEX_PUBKEY)
})

Deno.test("resolveNip05 - returns null when the request fails", async () => {
  assertEquals(await resolveNip05(parseNip05Id("alice@example.com"), failingClient()), null)
})

Deno.test("resolveNip05 - returns null for a non-200 response", async () => {
  const client = okClient(404, {})
  assertEquals(await resolveNip05(parseNip05Id("alice@example.com"), client), null)
})

Deno.test("resolveNip05 - returns null when the name is absent from the response", async () => {
  const client = okClient(200, { names: { bob: HEX_PUBKEY } })
  assertEquals(await resolveNip05(parseNip05Id("alice@example.com"), client), null)
})

Deno.test("resolveNip05 - returns null when the mapped value is not a hex pubkey", async () => {
  const client = okClient(200, { names: { alice: "not-hex" } })
  assertEquals(await resolveNip05(parseNip05Id("alice@example.com"), client), null)
})

Deno.test("resolveNip05 - forwards options.timeoutMs to the HttpClient request", async () => {
  let captured: number | undefined
  const client: HttpClient = {
    request: (input) => {
      captured = input.timeoutMs
      return Promise.resolve(ok(response(200, { names: { alice: HEX_PUBKEY } })))
    },
  }
  await resolveNip05(parseNip05Id("alice@example.com"), client, { timeoutMs: 1234 })
  assertEquals(captured, 1234)
})

Deno.test("resolveNip05 - uses DEFAULT_NIP05_TIMEOUT_MS when options.timeoutMs is omitted", async () => {
  let captured: number | undefined
  const client: HttpClient = {
    request: (input) => {
      captured = input.timeoutMs
      return Promise.resolve(ok(response(200, { names: { alice: HEX_PUBKEY } })))
    },
  }
  await resolveNip05(parseNip05Id("alice@example.com"), client)
  assertEquals(captured, DEFAULT_NIP05_TIMEOUT_MS)
})
