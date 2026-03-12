export type FilePreviewKind = 'image' | 'markdown' | 'json' | 'text'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])
const JSON_EXTENSIONS = new Set(['json', 'jsonc'])

const MIME_BY_EXTENSION: Record<string, string> = {
    avif: 'image/avif',
    bmp: 'image/bmp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
}

export function getFileExtension(path: string): string {
    const name = path.split('/').pop() ?? path
    const lastDot = name.lastIndexOf('.')
    if (lastDot < 0 || lastDot === name.length - 1) return ''
    return name.slice(lastDot + 1).toLowerCase()
}

export function getFileMimeType(path: string): string {
    const extension = getFileExtension(path)
    return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

export function resolveFilePreviewKind(path: string, binary: boolean): FilePreviewKind {
    const extension = getFileExtension(path)

    if (IMAGE_EXTENSIONS.has(extension)) return 'image'
    if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
    if (JSON_EXTENSIONS.has(extension)) return 'json'
    if (binary) return 'image'
    return 'text'
}

export function isEditableFile(path: string, binary: boolean): boolean {
    if (binary) return getFileExtension(path) === 'svg'
    return true
}

export function formatJsonForPreview(content: string): string | null {
    try {
        return JSON.stringify(JSON.parse(content), null, 2)
    } catch {
        return null
    }
}
