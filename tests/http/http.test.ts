import { assertEquals } from "@std/assert"
import { NetworkError, ServerError } from "../../src/application/port/http.ts"

Deno.test("NetworkError - carries tag and message", () => {
  const err = new NetworkError("offline")
  assertEquals(err.tag, "NetworkError")
  assertEquals(err.message, "offline")
})

Deno.test("ServerError - carries tag, status, and message", () => {
  const err = new ServerError(503, "service unavailable")
  assertEquals(err.tag, "ServerError")
  assertEquals(err.status, 503)
  assertEquals(err.message, "service unavailable")
})

Deno.test("HttpRequestError - tag is a usable discriminator", () => {
  const errs = [new NetworkError("x"), new ServerError(500, "y")]
  const tags = errs.map((e) => e.tag)
  assertEquals(tags, ["NetworkError", "ServerError"])
})
