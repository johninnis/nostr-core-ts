import { assertEquals } from "@std/assert"
import { DEFAULT_MAX_BODY_BYTES } from "../../mod.ts"
import type { HttpRequestFailure, NetworkFailure, ServerFailure } from "../../mod.ts"

const describe = (failure: HttpRequestFailure): string =>
  failure.type === "server" ? `HTTP ${failure.status}: ${failure.message}` : `offline: ${failure.message}`

Deno.test("HttpRequestFailure - type discriminates a network failure from a server failure", () => {
  const network: NetworkFailure = { type: "network", message: "connection refused" }
  const server: ServerFailure = { type: "server", status: 503, message: "service unavailable" }
  assertEquals([describe(network), describe(server)], [
    "offline: connection refused",
    "HTTP 503: service unavailable",
  ])
})

Deno.test("DEFAULT_MAX_BODY_BYTES - is exported from the package entry point as 16 MiB", () => {
  assertEquals(DEFAULT_MAX_BODY_BYTES, 16 * 1024 * 1024)
})
