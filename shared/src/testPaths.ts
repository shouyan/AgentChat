import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'

export function testTmpPath(...parts: string[]): string {
    return join(tmpdir(), ...parts)
}

export function testHomePath(...parts: string[]): string {
    const root = process.platform === 'win32'
        ? join('C:\\', 'Users', 'test')
        : platform() === 'darwin'
            ? join('/Users', 'test')
            : join('/home', 'test')
    return join(root, ...parts)
}

export function testProjectPath(name: string = 'project'): string {
    return testTmpPath(name)
}
