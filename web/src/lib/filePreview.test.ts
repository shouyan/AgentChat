import { describe, expect, it } from 'vitest'
import {
    formatJsonForPreview,
    getFileExtension,
    getFileMimeType,
    isEditableFile,
    resolveFilePreviewKind,
} from '@/lib/filePreview'

describe('filePreview helpers', () => {
    it('detects file extensions and mime types', () => {
        expect(getFileExtension('docs/readme.md')).toBe('md')
        expect(getFileMimeType('assets/icon.png')).toBe('image/png')
        expect(getFileMimeType('notes.unknown')).toBe('application/octet-stream')
    })

    it('resolves preview kinds by file type', () => {
        expect(resolveFilePreviewKind('diagram.png', true)).toBe('image')
        expect(resolveFilePreviewKind('README.md', false)).toBe('markdown')
        expect(resolveFilePreviewKind('package.json', false)).toBe('json')
        expect(resolveFilePreviewKind('src/index.ts', false)).toBe('text')
    })

    it('pretty prints valid json', () => {
        expect(formatJsonForPreview('{\"a\":1}')).toBe('{\n  \"a\": 1\n}')
        expect(formatJsonForPreview('{oops')).toBeNull()
    })

    it('marks binary files as non editable except svg', () => {
        expect(isEditableFile('image.png', true)).toBe(false)
        expect(isEditableFile('icon.svg', true)).toBe(true)
        expect(isEditableFile('src/index.ts', false)).toBe(true)
    })
})
