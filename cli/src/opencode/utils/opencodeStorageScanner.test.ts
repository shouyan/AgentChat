import { existsSync } from 'node:fs';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOpencodeStorageScanner } from './opencodeStorageScanner';

describe('createOpencodeStorageScanner', () => {
    let testDir: string;

    beforeEach(() => {
        testDir = join(tmpdir(), `opencode-storage-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    });

    afterEach(async () => {
        if (existsSync(testDir)) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    it('matches session info when cwd uses a symlink alias', async () => {
        const realDir = join(testDir, 'workspace-real');
        const aliasDir = join(testDir, 'workspace-alias');
        const storageDir = join(testDir, 'storage');
        const sessionDir = join(storageDir, 'session', 'project-1');
        const sessionId = 'ses_test_symlink_alias';
        const startupTimestampMs = Date.now();

        await mkdir(realDir, { recursive: true });
        await mkdir(sessionDir, { recursive: true });
        await symlink(realDir, aliasDir, process.platform === 'win32' ? 'junction' : 'dir');
        await writeFile(
            join(sessionDir, 'session-1.json'),
            JSON.stringify({
                id: sessionId,
                directory: realDir,
                time: {
                    created: startupTimestampMs + 1000
                }
            })
        );

        let foundSessionId: string | null = null;
        let matchFailure: string | null = null;

        const scanner = await createOpencodeStorageScanner({
            sessionId: null,
            cwd: aliasDir,
            storageDir,
            startupTimestampMs,
            sessionStartWindowMs: 5000,
            intervalMs: 50,
            onEvent: () => {},
            onSessionFound: (id) => {
                foundSessionId = id;
            },
            onSessionMatchFailed: (message) => {
                matchFailure = message;
            }
        });

        await scanner.cleanup();

        expect(foundSessionId).toBe(sessionId);
        expect(matchFailure).toBeNull();
    });
});
