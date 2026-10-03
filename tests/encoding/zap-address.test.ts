import { assertEquals } from "@std/assert"
import { bech32 } from "@scure/base"
import {
  isValidLightningAddress,
  isValidLnurl,
  lnurlOf,
  parseLightningAddress,
  parseLnurl,
  parseZapAddress,
  payEndpointUrl,
} from "../../src/domain/service/zap-address.ts"
import type { LightningAddress } from "../../src/domain/service/zap-address.ts"

const LUD01_VECTOR =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS"
const LUD01_URL = "https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df"

const encodeLnurl = (url: string, prefix = "lnurl"): string =>
  bech32.encode(prefix, bech32.toWords(new TextEncoder().encode(url)), 5000)

Deno.test("parseLnurl - trims the whitespace a Lightning address trims, a no-break space and a byte order mark among it", () => {
  assertEquals(parseLnurl(`\u00a0${LUD01_VECTOR}\ufeff`), LUD01_VECTOR.toLowerCase())
})

Deno.test("parseLnurl - refuses an LNURL wrapped in NUL, which a Lightning address does not trim", () => {
  assertEquals(parseLnurl(`\0${LUD01_VECTOR}\0`), null)
})

Deno.test("parseLnurl - accepts the LUD-01 example, longer than BIP-173's 90 characters, and lowercases it", () => {
  assertEquals(parseLnurl(` ${LUD01_VECTOR} `), LUD01_VECTOR.toLowerCase())
})

Deno.test("parseLnurl - accepts the lowercase form", () => {
  assertEquals(parseLnurl(LUD01_VECTOR.toLowerCase()), LUD01_VECTOR.toLowerCase())
})

Deno.test("parseLnurl - refuses mixed case, which bech32 forbids", () => {
  const mixed = `lnurl${LUD01_VECTOR.slice(5)}`
  assertEquals(parseLnurl(mixed), null)
})

Deno.test("parseLnurl - refuses an LNURL that encodes a plain http URL off an onion host", () => {
  assertEquals(parseLnurl(encodeLnurl("http://wallet.example/lnurlp/alice")), null)
})

Deno.test("parseLnurl - accepts an LNURL that encodes an http URL on an onion host", () => {
  const onion = encodeLnurl("http://abcdefgh.onion/lnurlp/alice")
  assertEquals(parseLnurl(onion), onion)
})

Deno.test("parseLnurl - refuses a scheme that is neither https nor http", () => {
  assertEquals(parseLnurl(encodeLnurl("ftp://wallet.example/lnurlp/alice")), null)
})

Deno.test("parseLnurl - refuses bech32 under another prefix", () => {
  assertEquals(parseLnurl(encodeLnurl("https://wallet.example/lnurlp/alice", "lnbc")), null)
})

Deno.test("parseLnurl - refuses a payload that is not a URL", () => {
  assertEquals(parseLnurl(encodeLnurl("not a url")), null)
})

Deno.test("parseLnurl - refuses a broken checksum", () => {
  const lowercase = LUD01_VECTOR.toLowerCase()
  assertEquals(parseLnurl(`${lowercase.slice(0, -1)}q`), null)
})

Deno.test("parseLnurl - refuses text that is not bech32, and non-strings", () => {
  assertEquals([parseLnurl("alice@wallet.example"), parseLnurl(42)], [null, null])
})

Deno.test("isValidLnurl - true only for the canonical lowercase form", () => {
  assertEquals([isValidLnurl(LUD01_VECTOR.toLowerCase()), isValidLnurl(LUD01_VECTOR)], [true, false])
})

Deno.test("parseLightningAddress - accepts a name at a domain and lowercases the domain", () => {
  assertEquals(parseLightningAddress(" alice@Pay.Example "), "alice@pay.example")
})

Deno.test("parseLightningAddress - refuses an upper-case username, which LUD-16 limits to lowercase", () => {
  assertEquals(parseLightningAddress("Alice@pay.example"), null)
})

Deno.test("parseLightningAddress - refuses a non-ASCII domain character even when it lower-cases into ASCII", () => {
  assertEquals(["alice@\u212Aey.example", "alice@\u0130.example"].map(parseLightningAddress), [null, null])
})

Deno.test("parseLightningAddress - accepts an internationalised domain written as punycode", () => {
  assertEquals(parseLightningAddress("alice@xn--nxasmq6b.example"), "alice@xn--nxasmq6b.example")
})

Deno.test("parseLightningAddress - refuses an address carrying a path", () => {
  assertEquals(parseLightningAddress("alice@evil.example/steal"), null)
})

Deno.test("parseLightningAddress - refuses text that is not an address", () => {
  assertEquals(parseLightningAddress("not an address"), null)
})

Deno.test("parseLightningAddress - accepts LUD-16's example address", () => {
  assertEquals(parseLightningAddress("satoshi@bitcoin.org"), "satoshi@bitcoin.org")
})

Deno.test("parseLightningAddress - accepts every username character LUD-16 allows: a-z0-9-_. and + for tags", () => {
  assertEquals(parseLightningAddress("sat-o_shi.9+zaps@bitcoin.org"), "sat-o_shi.9+zaps@bitcoin.org")
})

Deno.test("parseLightningAddress - accepts LUD-16's default identifier _", () => {
  assertEquals(parseLightningAddress("_@bitcoin.org"), "_@bitcoin.org")
})

Deno.test("parseLightningAddress - refuses the optional @domain shorthand, which LUD-16 lets a wallet reject", () => {
  assertEquals(parseLightningAddress("@bitcoin.org"), null)
})

Deno.test("parseLightningAddress - refuses a username character outside a-z0-9-_.+", () => {
  assertEquals(
    ["sat%20oshi@bitcoin.org", "sat/oshi@bitcoin.org", "sätoshi@bitcoin.org", "sat~oshi@bitcoin.org"].map(
      parseLightningAddress,
    ),
    [null, null, null, null],
  )
})

Deno.test("parseLightningAddress - refuses whitespace inside the address, trimming only around it", () => {
  assertEquals(
    ["alice @pay.example", "alice@ pay.example", "alice @ pay.example", "\talice@pay.example\n"].map(
      parseLightningAddress,
    ),
    [null, null, null, "alice@pay.example"],
  )
})

Deno.test("isValidLightningAddress - true only for the canonical lowercase form", () => {
  assertEquals([isValidLightningAddress("alice@pay.example"), isValidLightningAddress("Alice@pay.example")], [
    true,
    false,
  ])
})

Deno.test("parseZapAddress - reads a Lightning address", () => {
  assertEquals(parseZapAddress("alice@Wallet.Example"), "alice@wallet.example")
})

Deno.test("parseZapAddress - reads an LNURL", () => {
  assertEquals(parseZapAddress(LUD01_VECTOR), LUD01_VECTOR.toLowerCase())
})

Deno.test("parseZapAddress - refuses text that is neither", () => {
  assertEquals(parseZapAddress("not an address"), null)
})

Deno.test("payEndpointUrl - a Lightning address is served over https from its domain's well-known path", () => {
  const address = parseZapAddress("alice@wallet.example")
  assertEquals(address && payEndpointUrl(address), "https://wallet.example/.well-known/lnurlp/alice")
})

Deno.test("payEndpointUrl - LUD-16's example address names its well-known path", () => {
  const address = parseZapAddress("satoshi@bitcoin.org")
  assertEquals(address && payEndpointUrl(address), "https://bitcoin.org/.well-known/lnurlp/satoshi")
})

Deno.test("payEndpointUrl - a tagged address keeps its +tag in the path, as LUD-16 writes it", () => {
  const address = parseZapAddress("satoshi+zaps@bitcoin.org")
  assertEquals(address && payEndpointUrl(address), "https://bitcoin.org/.well-known/lnurlp/satoshi+zaps")
})

Deno.test("payEndpointUrl - the default identifier requests the _ path", () => {
  const address = parseZapAddress("_@bitcoin.org")
  assertEquals(address && payEndpointUrl(address), "https://bitcoin.org/.well-known/lnurlp/_")
})

Deno.test("payEndpointUrl - a Lightning address on an onion domain is served over http", () => {
  const address = parseZapAddress("alice@abcdefgh.onion")
  assertEquals(address && payEndpointUrl(address), "http://abcdefgh.onion/.well-known/lnurlp/alice")
})

Deno.test("payEndpointUrl - an LNURL is the URL it encodes", () => {
  const address = parseZapAddress(LUD01_VECTOR)
  assertEquals(address && payEndpointUrl(address), LUD01_URL)
})

const lightningAddress = (raw: string): LightningAddress => {
  const address = parseLightningAddress(raw)
  if (address === null) throw new Error(`test address did not parse: ${raw}`)
  return address
}

Deno.test("lnurlOf - encodes a Lightning address's LUD-16 pay endpoint URL as an lnurl (NIP-57 Appendix B)", () => {
  const lnurl = lnurlOf(lightningAddress("alice@wallet.example"))
  assertEquals(lnurl, encodeLnurl("https://wallet.example/.well-known/lnurlp/alice"))
})

Deno.test("lnurlOf - an lnurl is its own lnurl", () => {
  const lnurl = parseLnurl(LUD01_VECTOR)
  assertEquals(lnurl === null ? null : lnurlOf(lnurl), LUD01_VECTOR.toLowerCase())
})

Deno.test("lnurlOf - names the same pay endpoint as the address it encodes", () => {
  const address = lightningAddress("bob+tip@abcdefgh.onion")
  assertEquals(payEndpointUrl(lnurlOf(address)), payEndpointUrl(address))
})

Deno.test("parseLnurl - refuses a payload that is not valid UTF-8", () => {
  const bytes = Uint8Array.from([...new TextEncoder().encode("https://wallet.example/"), 0xff])
  assertEquals(parseLnurl(bech32.encode("lnurl", bech32.toWords(bytes), 5000)), null)
})

const LONGEST_PAY_URL_BYTES = 3117
const PAY_URL_OVERHEAD = "https:///.well-known/lnurlp/".length
const addressWithPayUrlOf = (bytes: number): string =>
  `a@${"b".repeat(bytes - PAY_URL_OVERHEAD - "a".length - ".com".length)}.com`

Deno.test("parseLightningAddress - accepts an address whose pay URL, encoded as an lnurl, is NIP-19's 5000 characters", () => {
  const address = parseLightningAddress(addressWithPayUrlOf(LONGEST_PAY_URL_BYTES))
  assertEquals(address === null ? null : lnurlOf(address).length, 5000)
})

Deno.test("parseLightningAddress - refuses an address whose pay URL would not fit an lnurl", () => {
  assertEquals(parseLightningAddress(addressWithPayUrlOf(LONGEST_PAY_URL_BYTES + 1)), null)
})

Deno.test("parseLightningAddress - refuses a domain whose last label is numeric, which a URL parser reads as an IPv4 address", () => {
  assertEquals(parseLightningAddress("a@0x7f.1"), null)
})
