export function uniqueNonEmptyPaths(paths: string[]) {
    return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
}
