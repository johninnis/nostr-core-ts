const DEC_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)"
const IPV4_ADDRESS = new RegExp(`^${DEC_OCTET}(?:\\.${DEC_OCTET}){3}$`)
const H16 = /^[0-9A-Fa-f]{1,4}$/
const IPV6_GROUPS = 8
const OCTET_RANGE = 256

/** A dotted-decimal IPv4 address read as its four octets, most significant first. */
export interface Ipv4Address {
  readonly octets: ReadonlyArray<number>
}

/** An IPv6 address read as its eight 16-bit groups, most significant first, with any `::` expanded. */
export interface Ipv6Address {
  readonly groups: ReadonlyArray<number>
}

/** Read `text` as a dotted-decimal IPv4 address: four octets from 0 to 255, none with a leading zero; else `null`. */
export const parseIpv4Address = (text: string): Ipv4Address | null =>
  IPV4_ADDRESS.test(text) ? { octets: text.split(".").map(Number) } : null

const NUMERIC_LABEL_REGEX = /^(?:0x[0-9a-f]*|[0-9]+)$/i

/**
 * Whether a URL parser reads `host` as an IPv4 address (WHATWG URL's "ends in a number"): its last label, after one
 * trailing dot is dropped, is all decimal digits or `0x` and hexadecimal digits.
 */
export const endsInNumber = (host: string): boolean =>
  NUMERIC_LABEL_REGEX.test(host.replace(/\.$/, "").split(".").at(-1) ?? "")

const ipv4Groups = ({ octets: [a = 0, b = 0, c = 0, d = 0] }: Ipv4Address): ReadonlyArray<number> => [
  a * OCTET_RANGE + b,
  c * OCTET_RANGE + d,
]

const groupsOf = (part: string, mayEndInIpv4: boolean): ReadonlyArray<number> | null => {
  const pieces = part === "" ? [] : part.split(":")
  const ipv4 = mayEndInIpv4 ? parseIpv4Address(pieces.at(-1) ?? "") : null
  const h16s = ipv4 === null ? pieces : pieces.slice(0, -1)
  if (!h16s.every((piece) => H16.test(piece))) return null
  const groups = h16s.map((piece) => parseInt(piece, 16))
  return ipv4 === null ? groups : [...groups, ...ipv4Groups(ipv4)]
}

/**
 * Read `text`, the inside of a URL's `[...]` IP literal, as an IPv6 address (RFC 3986 `IPv6address`): eight groups of
 * one to four hex digits, or fewer around one `::` standing for at least one zero group, the last two groups optionally
 * written as a dotted-decimal IPv4 address; else `null`.
 */
export const parseIpv6Address = (text: string): Ipv6Address | null => {
  const [head = "", tail, ...more] = text.split("::")
  if (tail === undefined) {
    const groups = groupsOf(head, true)
    return groups?.length === IPV6_GROUPS ? { groups } : null
  }
  const leading = groupsOf(head, false)
  const trailing = groupsOf(tail, true)
  if (more.length > 0 || leading === null || trailing === null) return null
  const elided = IPV6_GROUPS - leading.length - trailing.length
  return elided < 1 ? null : { groups: [...leading, ...new Array<number>(elided).fill(0), ...trailing] }
}
