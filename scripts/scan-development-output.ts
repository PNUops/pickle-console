import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Inspect final output bytes, including copied public files and emitted assets. */
export function scanDevelopmentOutput(directory: string, forbiddenHosts: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      scanDevelopmentOutput(path, forbiddenHosts)
    } else if (entry.isFile()) {
      const content = readFileSync(path)
      if (forbiddenHosts.some((host) => content.includes(Buffer.from(host)))) {
        throw new Error(`Development output ${path} contains a production service hostname`)
      }
    }
  }
}
