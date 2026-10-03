import type { Ipv4Address, Ipv6Address } from "../../domain/value-object/ip-address.ts"
import { parseIpv4Address, parseIpv6Address } from "../../domain/value-object/ip-address.ts"

type Ipv4Range = readonly [base: number, prefixLength: number]

const PRIVATE_IPV4_RANGES: ReadonlyArray<Ipv4Range> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0a80000, 16],
]

const OCTET_RANGE = 0x100
const GROUP_RANGE = 0x10000

const inRange = (address: number, [base, prefixLength]: Ipv4Range): boolean =>
  address >>> (32 - prefixLength) === base >>> (32 - prefixLength)

const isPrivateIpv4Value = (address: number): boolean => PRIVATE_IPV4_RANGES.some((range) => inRange(address, range))

const isPrivateIpv4 = ({ octets }: Ipv4Address): boolean =>
  isPrivateIpv4Value(octets.reduce((value, octet) => value * OCTET_RANGE + octet, 0))

const ipv4From = (high: number | undefined, low: number | undefined): number => (high ?? 0) * GROUP_RANGE + (low ?? 0)

const IPV4_COMPATIBLE_PREFIX: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0]
const IPV4_MAPPED_PREFIX: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0xffff]
const NAT64_PREFIX: ReadonlyArray<number> = [0x64, 0xff9b, 0, 0, 0, 0]
const TRAILING_IPV4_PREFIXES = [IPV4_COMPATIBLE_PREFIX, IPV4_MAPPED_PREFIX, NAT64_PREFIX]

const SIX_TO_FOUR_FIRST_GROUP = 0x2002

const hasPrefix = (groups: ReadonlyArray<number>, prefix: ReadonlyArray<number>): boolean =>
  prefix.every((group, index) => groups[index] === group)

const embeddedIpv4 = (groups: ReadonlyArray<number>): number | null => {
  if (TRAILING_IPV4_PREFIXES.some((prefix) => hasPrefix(groups, prefix))) return ipv4From(groups[6], groups[7])
  return groups[0] === SIX_TO_FOUR_FIRST_GROUP ? ipv4From(groups[1], groups[2]) : null
}

const isPrivateIpv6 = ({ groups }: Ipv6Address): boolean => {
  const first = groups[0] ?? 0
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true
  const ipv4 = embeddedIpv4(groups)
  return ipv4 !== null && isPrivateIpv4Value(ipv4)
}

const isLocalhostName = (hostname: string): boolean => {
  const name = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname
  return name === "localhost" || name.endsWith(".localhost")
}

const isPrivateIpv6Literal = (hostname: string): boolean => {
  const address = parseIpv6Address(hostname.slice(1, -1))
  return address !== null && isPrivateIpv6(address)
}

/**
 * Whether a WHATWG-serialised URL hostname names a private, loopback, link-local, shared or unspecified address by its
 * literal form, an IPv6 address that carries one (IPv4-mapped, IPv4-compatible, NAT64 `64:ff9b::/96` or 6to4
 * `2002::/16`), or is `localhost`, which RFC 6761 reserves for loopback. A DNS name that resolves to such an address is
 * not detected: that needs a resolver.
 */
export const isPrivateHost = (hostname: string): boolean => {
  if (hostname.startsWith("[")) return isPrivateIpv6Literal(hostname)
  const ipv4 = parseIpv4Address(hostname)
  return ipv4 === null ? isLocalhostName(hostname) : isPrivateIpv4(ipv4)
}
