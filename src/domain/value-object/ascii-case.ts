/**
 * `text` with its ASCII letters `A`–`Z` lower-cased and every other character as written: the byte-case-insensitive
 * folding a URL scheme and host (RFC 3986) and a Fetch method name are compared by, which JavaScript's
 * `toLowerCase` is not, since it folds non-ASCII letters too.
 */
export const lowerAscii = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
