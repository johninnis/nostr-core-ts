/** Canonical NIP-25 "like" content — a literal `+`. */
export const DEFAULT_REACTION = "+"

const HEART = "\u2764\uFE0F"

/**
 * Map NIP-25 reaction `content` to a display emoji: `+`, `""` and nullish all render as a red heart;
 * anything else is passed through verbatim (including `"-"`, which NIP-25 reserves for downvotes —
 * callers wanting to render a thumbs-down separately should branch before calling this).
 */
export const formatReactionEmoji = (content: string | null | undefined): string => {
  if (!content || content === DEFAULT_REACTION) return HEART
  return content
}
