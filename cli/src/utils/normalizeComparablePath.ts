import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Normalize a path for equality checks across symlink aliases,
 * e.g. /tmp and /private/tmp on macOS.
 */
export function normalizeComparablePath(value: string): string {
    const resolved = resolve(value);
    const canonical = tryRealpath(resolved);
    return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function tryRealpath(value: string): string {
    try {
        return realpathSync.native(value);
    } catch {
        return value;
    }
}
