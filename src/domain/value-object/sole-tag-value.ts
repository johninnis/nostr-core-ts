/**
 * What the tags of one name, or any other single-valued claim, state as their one value (shared ADR-0014): `one` with
 * the value they agree on, the empty string included; `absent` when nothing carries a value; `disagreeing` when they
 * carry different values. `value` is `null` unless the state is `one`, so a reader that only wants the value reads
 * `value`, and one that must tell a missing claim from a contested one reads `state`.
 */
export type SoleTagValue<T = string> =
  | { readonly state: "one"; readonly value: T }
  | { readonly state: "absent" | "disagreeing"; readonly value: null }

/**
 * What `values` state as their one value: `one` when every value has the same `keyOf` key (the value itself by
 * default), `absent` when there are none, and `disagreeing` when two keys differ.
 */
export const soleValue = <T>(
  values: ReadonlyArray<T>,
  keyOf: (value: T) => unknown = (value) => value,
): SoleTagValue<T> => {
  const distinct = new Map(values.map((value) => [keyOf(value), value] as const))
  const [first] = distinct.values()
  if (first === undefined) return { state: "absent", value: null }
  return distinct.size === 1 ? { state: "one", value: first } : { state: "disagreeing", value: null }
}
