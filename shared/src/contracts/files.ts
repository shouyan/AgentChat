import { z } from 'zod'
import {
    DirectoryEntrySchema,
    FileSearchItemSchema,
} from '../files'

export const FileSearchResponseSchema = z.object({
    success: z.boolean(),
    files: z.array(FileSearchItemSchema).optional(),
    error: z.string().optional()
})
export type FileSearchResponse = z.infer<typeof FileSearchResponseSchema>

export const ListDirectoryResponseSchema = z.object({
    success: z.boolean(),
    entries: z.array(DirectoryEntrySchema).optional(),
    error: z.string().optional()
})
export type ListDirectoryResponse = z.infer<typeof ListDirectoryResponseSchema>

export const FileReadResponseSchema = z.object({
    success: z.boolean(),
    content: z.string().optional(),
    hash: z.string().optional(),
    error: z.string().optional()
})
export type FileReadResponse = z.infer<typeof FileReadResponseSchema>

export const FileWriteResponseSchema = z.object({
    success: z.boolean(),
    hash: z.string().optional(),
    error: z.string().optional()
})
export type FileWriteResponse = z.infer<typeof FileWriteResponseSchema>

export const PathMutationResponseSchema = z.object({
    success: z.boolean(),
    path: z.string().optional(),
    error: z.string().optional()
})
export type PathMutationResponse = z.infer<typeof PathMutationResponseSchema>

export const UploadFileResponseSchema = z.object({
    success: z.boolean(),
    path: z.string().optional(),
    error: z.string().optional()
})
export type UploadFileResponse = z.infer<typeof UploadFileResponseSchema>

export const DeleteUploadResponseSchema = z.object({
    success: z.boolean(),
    error: z.string().optional()
})
export type DeleteUploadResponse = z.infer<typeof DeleteUploadResponseSchema>
