import { KIND_FILE_METADATA } from "../value-object/kinds.ts"
import type { NostrEvent, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import { now } from "../value-object/timestamp.ts"

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

const FALLBACK_KEY = "fallback"

const toFields = (metadata: FileMetadata): ReadonlyArray<readonly [string, string]> => {
  const fields: Array<readonly [string, string]> = [["url", metadata.url]]
  if (metadata.mimeType) fields.push(["m", metadata.mimeType])
  if (metadata.hash) fields.push(["x", metadata.hash])
  if (metadata.originalHash) fields.push(["ox", metadata.originalHash])
  if (metadata.size !== undefined) fields.push(["size", String(metadata.size)])
  if (metadata.dimensions) fields.push(["dim", metadata.dimensions])
  if (metadata.blurhash) fields.push(["blurhash", metadata.blurhash])
  if (metadata.thumbnail) fields.push(["thumb", metadata.thumbnail])
  if (metadata.image) fields.push(["image", metadata.image])
  if (metadata.summary) fields.push(["summary", metadata.summary])
  if (metadata.alt) fields.push(["alt", metadata.alt])
  for (const fallback of metadata.fallbacks ?? []) fields.push([FALLBACK_KEY, fallback])
  return fields
}

const fromFields = (fields: ReadonlyArray<readonly [string, string]>): FileMetadata | null => {
  const value = (key: string): string | undefined => fields.find(([k]) => k === key)?.[1]
  const url = value("url")
  if (!url) return null

  const size = value("size")
  const sizeNumber = size !== undefined ? Number(size) : undefined
  const mimeType = value("m")
  const hash = value("x")
  const originalHash = value("ox")
  const dimensions = value("dim")
  const blurhash = value("blurhash")
  const thumbnail = value("thumb")
  const image = value("image")
  const summary = value("summary")
  const alt = value("alt")
  const fallbacks = fields.flatMap(([k, v]) => k === FALLBACK_KEY ? [v] : [])

  return {
    url,
    ...(mimeType ? { mimeType } : {}),
    ...(hash ? { hash } : {}),
    ...(originalHash ? { originalHash } : {}),
    ...(sizeNumber !== undefined && Number.isSafeInteger(sizeNumber) ? { size: sizeNumber } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(blurhash ? { blurhash } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(image ? { image } : {}),
    ...(summary ? { summary } : {}),
    ...(alt ? { alt } : {}),
    ...(fallbacks.length ? { fallbacks } : {}),
  }
}

const tagFields = (tags: ReadonlyArray<Tag>): ReadonlyArray<readonly [string, string]> =>
  tags.flatMap((tag) => tag[1] !== undefined ? [[tag[0], tag[1]] as const] : [])

const imetaFields = (tag: Tag): ReadonlyArray<readonly [string, string]> =>
  tag.slice(1).flatMap((entry) => {
    const boundary = entry.indexOf(" ")
    return boundary === -1 ? [] : [[entry.slice(0, boundary), entry.slice(boundary + 1)] as const]
  })

/** Parse a kind-1063 file-metadata event (NIP-94) into a `FileMetadata`; returns `null` if `event` isn't a 1063 or carries no `url`. */
export const parseFileMetadataEvent = (event: NostrEvent): FileMetadata | null =>
  event.kind === KIND_FILE_METADATA ? fromFields(tagFields(event.tags)) : null

/** Parse a single NIP-92 `imeta` tag into a `FileMetadata`; returns `null` if `tag` isn't an `imeta` tag or carries no `url`. */
export const parseImetaTag = (tag: Tag): FileMetadata | null => tag[0] === "imeta" ? fromFields(imetaFields(tag)) : null

/** Parse every NIP-92 `imeta` tag in `tags` into `FileMetadata`, skipping any that lack a `url`. */
export const parseImetaTags = (tags: ReadonlyArray<Tag>): ReadonlyArray<FileMetadata> =>
  tags.flatMap((tag) => {
    const metadata = parseImetaTag(tag)
    return metadata ? [metadata] : []
  })

/** Build an unsigned kind-1063 file-metadata event (NIP-94); `caption` becomes the event `content`. */
export const buildFileMetadataEvent = (metadata: FileMetadata, caption: string = ""): UnsignedEvent => ({
  kind: KIND_FILE_METADATA,
  created_at: now(),
  tags: toFields(metadata).map(([key, value]): Tag => [key, value]),
  content: caption,
})

/** Serialise a `FileMetadata` into a single NIP-92 `imeta` tag for attaching to a note. */
export const buildImetaTag = (metadata: FileMetadata): Tag => [
  "imeta",
  ...toFields(metadata).map(([key, value]) => `${key} ${value}`),
]
