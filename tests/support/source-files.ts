import { join, relative } from "@std/path"

const SRC = new URL("../../src/", import.meta.url)

const walk = async (directory: string): Promise<ReadonlyArray<string>> => {
  const files: Array<string> = []
  for await (const entry of Deno.readDir(directory)) {
    const path = join(directory, entry.name)
    if (entry.isDirectory) files.push(...await walk(path))
    else if (entry.name.endsWith(".ts")) files.push(path)
  }
  return files
}

/** Every `src/` file whose text matches `pattern`, as a path relative to `src/`, sorted. */
export const sourceFilesMatching = async (pattern: RegExp): Promise<ReadonlyArray<string>> => {
  const root = SRC.pathname
  const matching: Array<string> = []
  for (const path of await walk(root)) {
    if (pattern.test(await Deno.readTextFile(path))) matching.push(relative(root, path))
  }
  return matching.toSorted()
}
