import { z } from 'zod'

export const FileSearchQuerySchema = z.object({
    query: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional()
})
export type FileSearchQuery = z.infer<typeof FileSearchQuerySchema>

export const DirectoryQuerySchema = z.object({
    path: z.string().optional()
})
export type DirectoryQuery = z.infer<typeof DirectoryQuerySchema>

export const FilePathSchema = z.object({
    path: z.string().min(1)
})
export type FilePathInput = z.infer<typeof FilePathSchema>

export const WriteFileBodySchema = z.object({
    path: z.string().min(1),
    content: z.string(),
    expectedHash: z.string().nullable().optional()
})
export type WriteFileBody = z.infer<typeof WriteFileBodySchema>

export const RenamePathBodySchema = z.object({
    path: z.string().min(1),
    nextPath: z.string().min(1)
})
export type RenamePathBody = z.infer<typeof RenamePathBodySchema>

export const DeletePathBodySchema = z.object({
    path: z.string().min(1),
    recursive: z.boolean().optional()
})
export type DeletePathBody = z.infer<typeof DeletePathBodySchema>

export const UploadFileBodySchema = z.object({
    filename: z.string().min(1).max(255),
    content: z.string().min(1),
    mimeType: z.string().min(1).max(255)
})
export type UploadFileBody = z.infer<typeof UploadFileBodySchema>

export const DeleteUploadBodySchema = z.object({
    path: z.string().min(1)
})
export type DeleteUploadBody = z.infer<typeof DeleteUploadBodySchema>

export const FileSearchItemSchema = z.object({
    fileName: z.string(),
    filePath: z.string(),
    fullPath: z.string(),
    fileType: z.enum(['file', 'folder'])
})
export type FileSearchItem = z.infer<typeof FileSearchItemSchema>

export const DirectoryEntrySchema = z.object({
    name: z.string(),
    type: z.enum(['file', 'directory', 'other']),
    size: z.number().optional(),
    modified: z.number().optional()
})
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>
