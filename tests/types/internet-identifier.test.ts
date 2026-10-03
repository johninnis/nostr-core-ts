import { assertEquals } from "@std/assert"
import {
  canonicaliseInternetIdentifier,
  splitInternetIdentifier,
} from "../../src/domain/value-object/internet-identifier.ts"

const NAME = /^[a-z0-9._-]+$/
const canonicalise = (raw: string): string | null => canonicaliseInternetIdentifier(raw, NAME)

Deno.test("splitInternetIdentifier - splits at the first @", () => {
  assertEquals(splitInternetIdentifier("bob@example.com"), { name: "bob", domain: "example.com" })
})

Deno.test("splitInternetIdentifier - reads an identifier with no @ as all name", () => {
  assertEquals(splitInternetIdentifier("bob"), { name: "bob", domain: "" })
})

Deno.test("canonicaliseInternetIdentifier - trims each character of the shared trim set from both ends (shared ADR-0068)", () => {
  const trimSet = "\t\n\v\f\r       　  ﻿"
  assertEquals(canonicaliseInternetIdentifier(`${trimSet}bob@example.com${trimSet}`, NAME), "bob@example.com")
})

Deno.test("canonicaliseInternetIdentifier - trims no character outside the shared trim set (shared ADR-0068)", () => {
  assertEquals(["\u0085bob@example.com", "bob@example.com᠎", "\u0000bob@example.com"].map(canonicalise), [
    null,
    null,
    null,
  ])
})
