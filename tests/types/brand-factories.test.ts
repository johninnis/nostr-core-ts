import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert"
import { type Brand, type BrandTools, createBrand, createHexBrand } from "../../src/domain/value-object/mod.ts"
import { InvalidBrandError } from "../../src/domain/exception/invalid-brand-error.ts"

declare const fooBrand: unique symbol
type Foo = Brand<typeof fooBrand>

Deno.test("createBrand - parse validates and returns a branded value", () => {
  const tools: BrandTools<Foo, "InvalidFooError"> = createBrand({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    validate: (raw) => raw.startsWith("foo:"),
  })
  assertEquals(tools.parse("foo:bar"), "foo:bar")
})

Deno.test("createBrand - parse throws InvalidBrandError carrying the tag and raw input", () => {
  const tools = createBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    validate: (raw) => raw.startsWith("foo:"),
  })
  const err = assertThrows(() => tools.parse("nope"))
  assertInstanceOf(err, InvalidBrandError)
  assertEquals(err.tag, "InvalidFooError")
  assertEquals(err.raw, "nope")
})

Deno.test("createBrand - default normaliser lowercases the input", () => {
  const tools = createBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    validate: (raw) => raw === "abc",
  })
  assertEquals(tools.parse("ABC"), "abc")
})

Deno.test("createBrand - custom normaliser overrides the default", () => {
  const tools = createBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    validate: (raw) => raw === "ABC",
    normalise: (raw) => raw.toUpperCase(),
  })
  assertEquals(tools.parse("abc"), "ABC")
})

Deno.test("createBrand - isValid narrows the type and rejects non-string", () => {
  const tools = createBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    validate: (raw) => raw === "abc",
  })
  assertEquals(tools.isValid("abc"), true)
  assertEquals(tools.isValid("nope"), false)
  assertEquals(tools.isValid(42), false)
  assertEquals(tools.isValid(null), false)
})

Deno.test("createHexBrand - parse accepts a lowercase hex string of the given length", () => {
  const tools = createHexBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    hexLength: 8,
  })
  assertEquals(tools.parse("deadbeef"), "deadbeef")
})

Deno.test("createHexBrand - parse rejects wrong length and non-hex", () => {
  const tools = createHexBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    hexLength: 8,
  })
  assertThrows(() => tools.parse("deadbee"))
  assertThrows(() => tools.parse("zzzzzzzz"))
})

Deno.test("createHexBrand - parse lowercases mixed-case hex", () => {
  const tools = createHexBrand<Foo, "InvalidFooError">({
    errorName: "InvalidFooError",
    errorPrefix: "Invalid Foo",
    hexLength: 8,
  })
  assertEquals(tools.parse("DEADBEEF"), "deadbeef")
})

Deno.test("InvalidBrandError - retains the raw input and tag for diagnostics", () => {
  const err = new InvalidBrandError("InvalidFooError", "Invalid Foo", "junk")
  assertEquals(err.raw, "junk")
  assertEquals(err.tag, "InvalidFooError")
  assertEquals(err.message, "Invalid Foo: junk")
})
