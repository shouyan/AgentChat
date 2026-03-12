import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { logger } from '@/ui/logger'

export type DirectoryListingEntry = {
    name: string
    type: 'file' | 'directory' | 'other'
    size?: number
    modified?: number
}

export async function listDirectoryEntries(resolvedPath: string): Promise<DirectoryListingEntry[]> {
    const entries = await readdir(resolvedPath, { withFileTypes: true })

    const directoryEntries: DirectoryListingEntry[] = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = join(resolvedPath, entry.name)
            let type: 'file' | 'directory' | 'other' = 'other'
            let size: number | undefined
            let modified: number | undefined

            if (entry.isDirectory()) {
                type = 'directory'
            } else if (entry.isFile()) {
                type = 'file'
            } else if (entry.isSymbolicLink()) {
                type = 'other'
            }

            if (!entry.isSymbolicLink()) {
                try {
                    const stats = await stat(fullPath)
                    size = stats.size
                    modified = stats.mtime.getTime()
                } catch (error) {
                    logger.debug(`Failed to stat ${fullPath}:`, error)
                }
            }

            return {
                name: entry.name,
                type,
                size,
                modified
            }
        })
    )

    directoryEntries.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
    })

    return directoryEntries
}
