import { assertEquals } from "@std/assert"
import { parseIpv4Address, parseIpv6Address } from "../../src/domain/value-object/ip-address.ts"

Deno.test("parseIpv4Address - reads a dotted-decimal address as its four octets", () => {
  assertEquals(parseIpv4Address("192.168.0.255"), { octets: [192, 168, 0, 255] })
})

for (const text of ["256.0.0.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1.2.3.a", " 1.2.3.4", "1.2.3.4.", ""]) {
  Deno.test(`parseIpv4Address - "${text}" is not a dotted-decimal IPv4 address`, () => {
    assertEquals(parseIpv4Address(text), null)
  })
}

Deno.test("parseIpv6Address - reads eight groups as their values", () => {
  assertEquals(parseIpv6Address("2001:DB8:0:0:0:0:0:1"), { groups: [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1] })
})

Deno.test("parseIpv6Address - expands :: into the zero groups it stands for", () => {
  assertEquals(parseIpv6Address("fe80::1"), { groups: [0xfe80, 0, 0, 0, 0, 0, 0, 1] })
})

Deno.test("parseIpv6Address - reads :: alone as the unspecified address", () => {
  assertEquals(parseIpv6Address("::"), { groups: [0, 0, 0, 0, 0, 0, 0, 0] })
})

Deno.test("parseIpv6Address - folds a trailing IPv4 address into the last two groups", () => {
  assertEquals(parseIpv6Address("::ffff:127.0.0.1"), { groups: [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1] })
})

Deno.test("parseIpv6Address - reads six groups and an IPv4 address without ::", () => {
  assertEquals(parseIpv6Address("1:2:3:4:5:6:1.2.3.4"), { groups: [1, 2, 3, 4, 5, 6, 0x102, 0x304] })
})

Deno.test("parseIpv6Address - :: may stand for a single zero group", () => {
  assertEquals(parseIpv6Address("1:2:3:4:5:6:7::"), { groups: [1, 2, 3, 4, 5, 6, 7, 0] })
})

for (
  const text of [
    "1:2:3:4:5:6:7",
    "1:2:3:4:5:6:7:8:9",
    "1:2:3:4::5:6:7:8",
    "1::2::3",
    ":::",
    ":1::",
    "12345::",
    "g::",
    "1.2.3.4::",
    "1.2.3.4::1",
    "::1.2.3.4:1",
    "::256.0.0.1",
    "1:2:3:4:5:6:7:1.2.3.4",
    "",
  ]
) {
  Deno.test(`parseIpv6Address - "${text}" is not an IPv6 address`, () => {
    assertEquals(parseIpv6Address(text), null)
  })
}
