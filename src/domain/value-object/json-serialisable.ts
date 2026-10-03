/**
 * A value as JSON writes it: a string, a number, a boolean, `null`, or an array or object of those — what `parseJson`
 * reads.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

/**
 * `T` when every part of it is a value `JSON.stringify` writes as JSON — a string, a number, a boolean, `null`, or an
 * array or object of those, where an object field may also be `undefined` and is then left out — and `never`
 * otherwise. A parameter typed `T & JsonSerialisable<T>` takes any such value, an `interface` and a {@link JsonValue}
 * read by `parseJson` included, and refuses `undefined`, a function, a method, a bigint and an `unknown` that has not
 * been narrowed.
 */
export type JsonSerialisable<T> = [T] extends [JsonValue] ? T
  : T extends string | number | boolean | null ? T
  : T extends (...args: never) => unknown ? never
  : T extends ReadonlyArray<unknown> ? { readonly [I in keyof T]: JsonSerialisable<T[I]> }
  : T extends object ? { readonly [K in keyof T]: JsonSerialisable<T[K]> | Extract<T[K], undefined> }
  : never
