import { bytesToHex, hexToBytes } from "@noble/hashes/utils"

/** Build a regex that matches exactly `length` lowercase hex characters. */
export const hexRegex = (length: number): RegExp => new RegExp(`^[0-9a-f]{${length}}$`)

/** Decode `raw` lowercase-hex to bytes. Throws if `raw` has odd length or contains non-hex characters. */
export { hexToBytes as parseHex }

/** Encode `bytes` to lowercase hex. */
export { bytesToHex as formatHex }
