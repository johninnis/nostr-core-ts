const TYPE_AND_SUBTYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i

/**
 * The MIME type `value` writes, in lowercase, or `null` for anything but a type and a subtype. RFC 6838 says "Both
 * top-level type and subtype names are case-insensitive", and NIP-94 that they "should be lowercase".
 */
export const parseMimeType = (value: string): string | null => TYPE_AND_SUBTYPE.test(value) ? value.toLowerCase() : null
