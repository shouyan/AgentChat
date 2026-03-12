import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}

/**
 * Decode base64 string to bytes
 */
export function decodeBase64ToBytes(value: string): { bytes: Uint8Array; ok: boolean } {
    try {
        const binaryString = atob(value)
        const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0))
        return { bytes, ok: true }
    } catch {
        return { bytes: new Uint8Array(), ok: false }
    }
}

/**
 * Encode bytes to base64 string
 */
export function encodeBytesToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000
    let binaryString = ''

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize)
        binaryString += String.fromCharCode(...chunk)
    }

    return btoa(binaryString)
}

/**
 * Decode base64 string to UTF-8 text
 */
export function decodeBase64(value: string): { text: string; ok: boolean } {
    const decoded = decodeBase64ToBytes(value)
    if (!decoded.ok) {
        return { text: '', ok: false }
    }
    const text = new TextDecoder('utf-8').decode(decoded.bytes)
    return { text, ok: true }
}

/**
 * Encode UTF-8 text to base64 string
 */
export function encodeBase64(value: string): string {
    const bytes = new TextEncoder().encode(value)
    return encodeBytesToBase64(bytes)
}
