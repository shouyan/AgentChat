import { logger } from '@/ui/logger'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { resolve } from 'path'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { validatePath } from '../pathSecurity'
import { getErrorMessage, rpcError } from '../rpcResponses'

interface ReadFileRequest {
    path: string
}

interface ReadFileResponse {
    success: boolean
    content?: string
    hash?: string
    error?: string
}

interface WriteFileRequest {
    path: string
    content: string
    expectedHash?: string | null
}

interface WriteFileResponse {
    success: boolean
    hash?: string
    error?: string
}

interface CreateDirectoryRequest {
    path: string
}

interface PathMutationRequest {
    path: string
}

interface RenamePathRequest extends PathMutationRequest {
    nextPath: string
}

interface DeletePathRequest extends PathMutationRequest {
    recursive?: boolean
}

interface PathMutationResponse {
    success: boolean
    path?: string
    error?: string
}

function ensureNonEmptyPath(path: string | undefined, message: string): { success: true; path: string } | { success: false; error: string } {
    const trimmed = path?.trim()
    if (!trimmed) {
        return { success: false, error: message }
    }
    return { success: true, path: trimmed }
}

export function registerFileHandlers(rpcHandlerManager: RpcHandlerManager, workingDirectory: string): void {
    rpcHandlerManager.registerHandler<ReadFileRequest, ReadFileResponse>('readFile', async (data) => {
        logger.debug('Read file request:', data.path)

        const validation = validatePath(data.path, workingDirectory)
        if (!validation.valid) {
            return rpcError(validation.error ?? 'Invalid file path')
        }

        try {
            const resolvedPath = resolve(workingDirectory, data.path)
            const buffer = await readFile(resolvedPath)
            const content = buffer.toString('base64')
            const hash = createHash('sha256').update(buffer).digest('hex')
            return { success: true, content, hash }
        } catch (error) {
            logger.debug('Failed to read file:', error)
            return rpcError(getErrorMessage(error, 'Failed to read file'))
        }
    })

    rpcHandlerManager.registerHandler<WriteFileRequest, WriteFileResponse>('writeFile', async (data) => {
        logger.debug('Write file request:', data.path)

        const pathResult = ensureNonEmptyPath(data.path, 'File path is required')
        if (!pathResult.success) {
            return rpcError(pathResult.error)
        }

        const validation = validatePath(pathResult.path, workingDirectory)
        if (!validation.valid) {
            return rpcError(validation.error ?? 'Invalid file path')
        }

        try {
            const resolvedPath = resolve(workingDirectory, pathResult.path)
            if (data.expectedHash !== null && data.expectedHash !== undefined) {
                try {
                    const existingBuffer = await readFile(resolvedPath)
                    const existingHash = createHash('sha256').update(existingBuffer).digest('hex')

                    if (existingHash !== data.expectedHash) {
                        return rpcError(`File hash mismatch. Expected: ${data.expectedHash}, Actual: ${existingHash}`)
                    }
                } catch (error) {
                    const nodeError = error as NodeJS.ErrnoException
                    if (nodeError.code !== 'ENOENT') {
                        throw error
                    }
                    return rpcError('File does not exist but hash was provided')
                }
            } else {
                try {
                    await stat(resolvedPath)
                    return rpcError('File already exists but was expected to be new')
                } catch (error) {
                    const nodeError = error as NodeJS.ErrnoException
                    if (nodeError.code !== 'ENOENT') {
                        throw error
                    }
                }
            }

            const buffer = Buffer.from(data.content, 'base64')
            await writeFile(resolvedPath, buffer)

            const hash = createHash('sha256').update(buffer).digest('hex')

            return { success: true, hash }
        } catch (error) {
            logger.debug('Failed to write file:', error)
            return rpcError(getErrorMessage(error, 'Failed to write file'))
        }
    })

    rpcHandlerManager.registerHandler<CreateDirectoryRequest, PathMutationResponse>('createDirectory', async (data) => {
        logger.debug('Create directory request:', data.path)

        const pathResult = ensureNonEmptyPath(data.path, 'Directory path is required')
        if (!pathResult.success) {
            return rpcError(pathResult.error)
        }

        const validation = validatePath(pathResult.path, workingDirectory)
        if (!validation.valid) {
            return rpcError(validation.error ?? 'Invalid directory path')
        }

        try {
            const resolvedPath = resolve(workingDirectory, pathResult.path)
            try {
                await stat(resolvedPath)
                return rpcError('Path already exists')
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException
                if (nodeError.code !== 'ENOENT') {
                    throw error
                }
            }

            await mkdir(resolvedPath, { recursive: true })
            return { success: true, path: pathResult.path }
        } catch (error) {
            logger.debug('Failed to create directory:', error)
            return rpcError(getErrorMessage(error, 'Failed to create directory'))
        }
    })

    rpcHandlerManager.registerHandler<RenamePathRequest, PathMutationResponse>('renamePath', async (data) => {
        logger.debug('Rename path request:', data.path, '->', data.nextPath)

        const sourceResult = ensureNonEmptyPath(data.path, 'Source path is required')
        if (!sourceResult.success) {
            return rpcError(sourceResult.error)
        }

        const targetResult = ensureNonEmptyPath(data.nextPath, 'Destination path is required')
        if (!targetResult.success) {
            return rpcError(targetResult.error)
        }

        const sourceValidation = validatePath(sourceResult.path, workingDirectory)
        if (!sourceValidation.valid) {
            return rpcError(sourceValidation.error ?? 'Invalid source path')
        }

        const targetValidation = validatePath(targetResult.path, workingDirectory)
        if (!targetValidation.valid) {
            return rpcError(targetValidation.error ?? 'Invalid destination path')
        }

        try {
            const resolvedSource = resolve(workingDirectory, sourceResult.path)
            const resolvedTarget = resolve(workingDirectory, targetResult.path)

            try {
                await stat(resolvedTarget)
                return rpcError('Destination already exists')
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException
                if (nodeError.code !== 'ENOENT') {
                    throw error
                }
            }

            await rename(resolvedSource, resolvedTarget)
            return { success: true, path: targetResult.path }
        } catch (error) {
            logger.debug('Failed to rename path:', error)
            return rpcError(getErrorMessage(error, 'Failed to rename path'))
        }
    })

    rpcHandlerManager.registerHandler<DeletePathRequest, PathMutationResponse>('deletePath', async (data) => {
        logger.debug('Delete path request:', data.path)

        const pathResult = ensureNonEmptyPath(data.path, 'Path is required')
        if (!pathResult.success) {
            return rpcError(pathResult.error)
        }

        const validation = validatePath(pathResult.path, workingDirectory)
        if (!validation.valid) {
            return rpcError(validation.error ?? 'Invalid path')
        }

        try {
            const resolvedPath = resolve(workingDirectory, pathResult.path)
            const existing = await stat(resolvedPath)
            if (existing.isDirectory() && data.recursive !== true) {
                return rpcError('Directory deletion requires recursive=true')
            }

            await rm(resolvedPath, { recursive: data.recursive === true, force: false })
            return { success: true }
        } catch (error) {
            logger.debug('Failed to delete path:', error)
            return rpcError(getErrorMessage(error, 'Failed to delete path'))
        }
    })
}
