/** `Array#sort` comparator: most recently created first (descending `created_at`). */
export const byCreatedAtDesc = <T extends { readonly created_at: number }>(a: T, b: T): number =>
  b.created_at - a.created_at

/** `Array#sort` comparator: oldest first (ascending `created_at`). */
export const byCreatedAtAsc = <T extends { readonly created_at: number }>(a: T, b: T): number =>
  a.created_at - b.created_at
