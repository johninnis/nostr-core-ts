import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { httpMethodFrom, isValidHttpMethod, parseHttpMethod } from "../../src/domain/value-object/http-method.ts"

for (const token of ["POST", "patch", "!#$%&'*+-.^_`|~"]) {
  Deno.test(`parseHttpMethod - keeps the RFC 9110 token ${token} as written (shared ADR-0130)`, () => {
    assertEquals<string | null>(parseHttpMethod(token), token)
  })
}

for (const notAToken of ["", "GE T", " GET", "GET\n", "GET/POST", "G\u00c9T", null, 1]) {
  Deno.test(`parseHttpMethod - ${JSON.stringify(notAToken)} is no method (shared ADR-0130)`, () => {
    assertEquals(parseHttpMethod(notAToken), null)
  })
}

Deno.test("isValidHttpMethod - recognises a token", () => {
  assertEquals(isValidHttpMethod("GET"), true)
})

Deno.test("isValidHttpMethod - the empty string is no method", () => {
  assertEquals(isValidHttpMethod(""), false)
})

Deno.test("httpMethodFrom - brands a token", () => {
  assertEquals<string>(httpMethodFrom("POST"), "POST")
})

Deno.test("httpMethodFrom - refuses what is no method", () => {
  assertThrows(() => httpMethodFrom(""), InvalidArgumentError)
})
