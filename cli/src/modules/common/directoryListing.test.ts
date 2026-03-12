import { beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { listDirectoryEntries } from './directoryListing'

async function createTempDir(prefix: string): Promise<string> {
    const base = tmpdir()
    const path = join(base, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(path, { recursive: true })
    return path
}

describe('listDirectoryEntries', () => {
    let rootDir: string

    beforeEach(async () => {
        if (rootDir) {
            await rm(rootDir, { recursive: true, force: true })
        }

        rootDir = await createTempDir('hapi-directory-listing')
        await mkdir(join(rootDir, 'src'), { recursive: true })
        await writeFile(join(rootDir, 'README.md'), 'hello')
    })

    it('sorts directories before files', async () => {
        const entries = await listDirectoryEntries(rootDir)
        expect(entries[0]?.name).toBe('src')
        expect(entries[0]?.type).toBe('directory')
        expect(entries[1]?.name).toBe('README.md')
        expect(entries[1]?.type).toBe('file')
    })

    it('keeps symlinks as other without stat metadata', async () => {
        try {
            await symlink('/definitely-not-a-real-path', join(rootDir, 'broken-link'))
        } catch {
            return
        }

        const entries = await listDirectoryEntries(rootDir)
        const brokenLink = entries.find((entry) => entry.name === 'broken-link')
        expect(brokenLink?.type).toBe('other')
        expect(brokenLink?.size).toBeUndefined()
    })
})
