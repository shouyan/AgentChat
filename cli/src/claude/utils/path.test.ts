import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProjectPath } from './path';
import { join } from 'node:path';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

vi.mock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    return {
        ...actual,
        homedir: vi.fn(() => '/home/user')
    };
});

// Store original env
const originalEnv = process.env;

describe('getProjectPath', () => {
    let testDir: string;

    beforeEach(() => {
        // Reset process.env to a clean state
        process.env = { ...originalEnv };
        delete process.env.CLAUDE_CONFIG_DIR;
        testDir = join(tmpdir(), `claude-path-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    });

    afterEach(async () => {
        // Restore original env
        process.env = originalEnv;
        if (existsSync(testDir)) {
            await rm(testDir, { recursive: true, force: true });
        }
    });
    it('should replace slashes with hyphens in the project path', () => {
        const workingDir = '/Users/steve/projects/my-app';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join('/home/user', '.claude', 'projects', '-Users-steve-projects-my-app'));
    });

    it('should replace dots with hyphens in the project path', () => {
        const workingDir = '/Users/steve/projects/app.test.js';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join('/home/user', '.claude', 'projects', '-Users-steve-projects-app-test-js'));
    });

    it('should handle paths with both slashes and dots', () => {
        const workingDir = '/var/www/my.site.com/public';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join('/home/user', '.claude', 'projects', '-var-www-my-site-com-public'));
    });

    it('should replace underscores with hyphens in the project path', () => {
        const workingDir = '/data/github/agentchat__worktrees/ime';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join('/home/user', '.claude', 'projects', '-data-github-agentchat--worktrees-ime'));
    });

    it('should handle relative paths by resolving them first', () => {
        const workingDir = './my-project';
        const result = getProjectPath(workingDir);
        expect(result).toContain(join('/home/user', '.claude', 'projects'));
        expect(result).toContain('my-project');
    });

    it('should handle empty directory path', () => {
        const workingDir = '';
        const result = getProjectPath(workingDir);
        expect(result).toContain(join('/home/user', '.claude', 'projects'));
    });

    it('should canonicalize symlinked working directories before building the project id', async () => {
        const realDir = join(testDir, 'workspace-real');
        const aliasDir = join(testDir, 'workspace-alias');
        await mkdir(realDir, { recursive: true });
        await symlink(realDir, aliasDir, process.platform === 'win32' ? 'junction' : 'dir');

        const realResult = getProjectPath(realDir);
        const aliasResult = getProjectPath(aliasDir);

        expect(aliasResult).toBe(realResult);
    });

    describe('CLAUDE_CONFIG_DIR support', () => {
        it('should use default .claude directory when CLAUDE_CONFIG_DIR is not set', () => {
            const workingDir = '/Users/steve/projects/my-app';
            const result = getProjectPath(workingDir);
            expect(result).toBe(join('/home/user', '.claude', 'projects', '-Users-steve-projects-my-app'));
        });

        it('should use CLAUDE_CONFIG_DIR when set', () => {
            process.env.CLAUDE_CONFIG_DIR = '/custom/claude/config';
            const workingDir = '/Users/steve/projects/my-app';
            const result = getProjectPath(workingDir);
            expect(result).toBe(join('/custom/claude/config', 'projects', '-Users-steve-projects-my-app'));
        });

        it('should handle relative CLAUDE_CONFIG_DIR path', () => {
            process.env.CLAUDE_CONFIG_DIR = './config/claude';
            const workingDir = '/Users/steve/projects/my-app';
            const result = getProjectPath(workingDir);
            expect(result).toBe(join('./config/claude', 'projects', '-Users-steve-projects-my-app'));
        });

        it('should fallback to default when CLAUDE_CONFIG_DIR is empty string', () => {
            process.env.CLAUDE_CONFIG_DIR = '';
            const workingDir = '/Users/steve/projects/my-app';
            const result = getProjectPath(workingDir);
            expect(result).toBe(join('/home/user', '.claude', 'projects', '-Users-steve-projects-my-app'));
        });

        it('should handle CLAUDE_CONFIG_DIR with trailing slash', () => {
            process.env.CLAUDE_CONFIG_DIR = '/custom/claude/config/';
            const workingDir = '/Users/steve/projects/my-app';
            const result = getProjectPath(workingDir);
            expect(result).toBe(join('/custom/claude/config/', 'projects', '-Users-steve-projects-my-app'));
        });
    });
});
