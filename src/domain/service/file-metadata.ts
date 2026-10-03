import { parseDecimalInteger } from "./decimal.ts"
import { parseMimeType } from "./mime-type.ts"
import { KIND_FILE_METADATA } from "../value-object/kinds.ts"
import type { NostrEvent, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import { soleTagValue } from "./tags.ts"
import { now } from "./timestamp.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { isLowercaseHex } from "../value-object/brand.ts"
import { isNonNegativeInteger } from "./guards.ts"

/**
 * NIP-94 / NIP-92 file metadata. One domain shape for both wire forms: a standalone kind-1063
 * event and an inline `imeta` tag. Field names are descriptive rather than the raw spec keys
 * (`m`, `x`, `ox`, `dim`, `thumb`) — the spec keys are an implementation detail of the wire
 * mapping, not the domain.
 */
export interface FileMetadata {
  readonly url: string
  readonly mimeType?: string
  readonly hash?: string
  readonly originalHash?: string
  readonly size?: number
  readonly dimensions?: string
  readonly blurhash?: string
  readonly thumbnail?: string
  readonly image?: string
  readonly summary?: string
  readonly alt?: string
  readonly fallbacks?: ReadonlyArray<string>
}

/**
 * The metadata a NIP-94 kind-1063 event must state: besides the `url`, the MIME type (`m`) and the SHA-256 of the file
 * (`x`) and of the original file (`ox`), the fields NIP-94 does not mark optional.
 */
export interface FileEventMetadata extends FileMetadata {
  readonly mimeType: string
  readonly hash: string
  readonly originalHash: string
}

const FALLBACK_KEY = "fallback"

const SHA256_HEX_LENGTH = 64

const isCanonicalMimeType = (mimeType: string): boolean => parseMimeType(mimeType) === mimeType

const assertWritable = (metadata: FileMetadata): void => {
  if (metadata.url === "") {
    throw new InvalidArgumentError("File metadata names the URL to download the file from, and an empty URL names none")
  }
  if (metadata.mimeType !== undefined && !isCanonicalMimeType(metadata.mimeType)) {
    throw new InvalidArgumentError(
      `File metadata states its MIME type as a lowercase type/subtype, not "${metadata.mimeType}"`,
    )
  }
  if (metadata.size !== undefined && !isNonNegativeInteger(metadata.size)) {
    throw new InvalidArgumentError(`File metadata states its size as a whole number of bytes, not ${metadata.size}`)
  }
}

const toFields = (metadata: FileMetadata): ReadonlyArray<readonly [string, string]> => {
  const fields: Array<readonly [string, string]> = [["url", metadata.url]]
  if (metadata.mimeType !== undefined) fields.push(["m", metadata.mimeType])
  if (metadata.hash !== undefined) fields.push(["x", metadata.hash])
  if (metadata.originalHash !== undefined) fields.push(["ox", metadata.originalHash])
  if (metadata.size !== undefined) fields.push(["size", String(metadata.size)])
  if (metadata.dimensions !== undefined) fields.push(["dim", metadata.dimensions])
  if (metadata.blurhash !== undefined) fields.push(["blurhash", metadata.blurhash])
  if (metadata.thumbnail !== undefined) fields.push(["thumb", metadata.thumbnail])
  if (metadata.image !== undefined) fields.push(["image", metadata.image])
  if (metadata.summary !== undefined) fields.push(["summary", metadata.summary])
  if (metadata.alt !== undefined) fields.push(["alt", metadata.alt])
  for (const fallback of metadata.fallbacks ?? []) fields.push([FALLBACK_KEY, fallback])
  return fields
}

const writableFields = (metadata: FileMetadata): ReadonlyArray<readonly [string, string]> => {
  assertWritable(metadata)
  return toFields(metadata)
}

/**
 * Parse a NIP-94 tag list (`["url", …], ["m", …], …`) into a `FileMetadata`; returns `null` without one non-empty
 * `url`. Every other field is optional here, as in a BUD-08 `nip94` blob-descriptor field, and an empty one is kept as
 * the empty string (shared ADR-0079). A `size` is read only when it is decimal digits (NIP-94: "size of file in
 * bytes"), and an `m` only when it is a MIME type (NIP-94: "The MIME types format must be used"), in lowercase. A field
 * repeated with one value is read once, and a field whose tags disagree states nothing (shared ADR-0014).
 */
export const parseFileMetadataTags = (fields: ReadonlyArray<Tag>): FileMetadata | null => {
  const value = (key: string): string | null => soleTagValue(fields, key).value
  const url = value("url")
  if (!url) return null

  const size = value("size")
  const sizeNumber = size === null ? null : parseDecimalInteger(size)
  const statedMimeType = value("m")
  const mimeType = statedMimeType === null ? null : parseMimeType(statedMimeType)
  const hash = value("x")
  const originalHash = value("ox")
  const dimensions = value("dim")
  const blurhash = value("blurhash")
  const thumbnail = value("thumb")
  const image = value("image")
  const summary = value("summary")
  const alt = value("alt")
  const fallbacks = fields.flatMap(([k, v]) => k === FALLBACK_KEY && v !== undefined ? [v] : [])

  return {
    url,
    ...(mimeType === null ? {} : { mimeType }),
    ...(hash === null ? {} : { hash }),
    ...(originalHash === null ? {} : { originalHash }),
    ...(sizeNumber === null ? {} : { size: sizeNumber }),
    ...(dimensions === null ? {} : { dimensions }),
    ...(blurhash === null ? {} : { blurhash }),
    ...(thumbnail === null ? {} : { thumbnail }),
    ...(image === null ? {} : { image }),
    ...(summary === null ? {} : { summary }),
    ...(alt === null ? {} : { alt }),
    ...(fallbacks.length ? { fallbacks } : {}),
  }
}

const imetaFields = (tag: Tag): ReadonlyArray<Tag> =>
  tag.slice(1).flatMap((entry) => {
    const boundary = entry.indexOf(" ")
    return boundary === -1 ? [] : [[entry.slice(0, boundary), entry.slice(boundary + 1)]]
  })

const statesEventFields = (metadata: FileMetadata): metadata is FileEventMetadata =>
  metadata.mimeType !== undefined && isLowercaseHex(metadata.hash ?? "", SHA256_HEX_LENGTH) &&
  isLowercaseHex(metadata.originalHash ?? "", SHA256_HEX_LENGTH)

/**
 * Parse a kind-1063 file-metadata event (NIP-94) into its {@link FileEventMetadata}; returns `null` if `event` isn't a
 * 1063, or lacks one `url`, one `m` that is a MIME type, or one `x` and one `ox` that are SHA-256 hex strings.
 */
export const parseFileMetadataEvent = (event: NostrEvent): FileEventMetadata | null => {
  const metadata = event.kind === KIND_FILE_METADATA ? parseFileMetadataTags(event.tags) : null
  return metadata !== null && statesEventFields(metadata) ? metadata : null
}

const describesTheUrl = (fields: ReadonlyArray<readonly [string, string]>): boolean =>
  fields.some(([key]) => key !== "url")

/**
 * Parse a single NIP-92 `imeta` tag into a `FileMetadata`; returns `null` if `tag` isn't an `imeta` tag, carries no
 * `url`, or carries no other field this reads (NIP-92: "Each `imeta` tag MUST have a `url`, and at least one other
 * field"). A field it drops — a `size` that is not a decimal, an `m` that is not a MIME type, a field it does not model
 * — is not that other field, so it reads back exactly the tags {@link buildImetaTag} writes.
 */
export const parseImetaTag = (tag: Tag): FileMetadata | null => {
  const metadata = tag[0] === "imeta" ? parseFileMetadataTags(imetaFields(tag)) : null
  return metadata !== null && describesTheUrl(toFields(metadata)) ? metadata : null
}

/** Parse every NIP-92 `imeta` tag in `tags` into `FileMetadata`, skipping any that {@link parseImetaTag} refuses. */
export const parseImetaTags = (tags: ReadonlyArray<Tag>): ReadonlyArray<FileMetadata> =>
  tags.flatMap((tag) => parseImetaTag(tag) ?? [])

/**
 * Build an unsigned kind-1063 file-metadata event (NIP-94) from the fields it must state; `caption` becomes the event
 * `content`. Throws `InvalidArgumentError` for metadata that would not be read back as a kind-1063 event, naming what
 * is wrong: an empty `url`, a MIME type that is not a lowercase `type/subtype`, a `size` that is not a non-negative
 * safe integer, or a missing MIME type or an `x` or `ox` that is not SHA-256 lowercase hex.
 */
export const buildFileMetadataEvent = (metadata: FileEventMetadata, caption: string = ""): UnsignedEvent => {
  const fields = writableFields(metadata)
  if (!statesEventFields(metadata)) {
    throw new InvalidArgumentError(
      "A kind 1063 file metadata event states a MIME type and the SHA-256 hex of the file and of the original file",
    )
  }
  return {
    kind: KIND_FILE_METADATA,
    created_at: now(),
    tags: fields.map(([key, value]): Tag => [key, value]),
    content: caption,
  }
}

/**
 * Serialise a `FileMetadata` into a single NIP-92 `imeta` tag for attaching to a note, or `null` when it holds only the
 * `url`: NIP-92 says "Each `imeta` tag MUST have a `url`, and at least one other field". Throws `InvalidArgumentError`
 * for an empty `url`, a MIME type that is not a lowercase `type/subtype`, or a `size` that is not a non-negative safe
 * integer: what {@link parseImetaTag} would not read back is not written.
 */
export const buildImetaTag = (metadata: FileMetadata): Tag | null => {
  const fields = writableFields(metadata)
  return describesTheUrl(fields) ? ["imeta", ...fields.map(([key, value]) => `${key} ${value}`)] : null
}
