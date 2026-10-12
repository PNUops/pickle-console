import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { scanDevelopmentOutput } from './scan-development-output'

test('rejects production hosts in copied public files and binary assets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pickle-output-scan-'))
  try {
    mkdirSync(join(directory, 'assets'))
    writeFileSync(join(directory, 'copied-public.txt'), 'https://pickle.pusan.ac.kr/api')
    expect(() => scanDevelopmentOutput(directory, ['pickle.pusan.ac.kr'])).toThrow('copied-public.txt')
    rmSync(join(directory, 'copied-public.txt'))
    writeFileSync(join(directory, 'assets', 'binary.dat'), Buffer.concat([
      Buffer.from([0, 255]), Buffer.from('llm.pcl.kr'), Buffer.from([0, 254]),
    ]))
    expect(() => scanDevelopmentOutput(directory, ['llm.pcl.kr'])).toThrow('binary.dat')
    expect(() => scanDevelopmentOutput(directory, ['ssh.pcl.kr'])).not.toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
