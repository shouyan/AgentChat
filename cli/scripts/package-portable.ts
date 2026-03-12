import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create as createTar } from 'tar';

const DEFAULT_TARGETS = [
    'bun-darwin-x64',
    'bun-darwin-arm64',
    'bun-linux-x64-baseline',
    'bun-linux-arm64',
    'bun-windows-x64'
] as const;

const TUNWG_RELEASES: Record<string, string> = {
    'x64-linux': 'https://github.com/tiann/tunwg/releases/latest/download/tunwg',
    'arm64-linux': 'https://github.com/tiann/tunwg/releases/latest/download/tunwg-arm64',
    'x64-darwin': 'https://github.com/tiann/tunwg/releases/latest/download/tunwg-darwin',
    'arm64-darwin': 'https://github.com/tiann/tunwg/releases/latest/download/tunwg-darwin-arm64',
    'x64-win32': 'https://github.com/tiann/tunwg/releases/latest/download/tunwg.exe'
};

const TUNWG_LICENSE_URL = 'https://raw.githubusercontent.com/tiann/tunwg/refs/heads/main/LICENSE';

function getArg(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index === -1 || index + 1 >= args.length) {
        return undefined;
    }
    return args[index + 1];
}

function resolveHostPlatform(): string {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin' || process.platform === 'linux') return process.platform;
    throw new Error(`Unsupported host platform: ${process.platform}`);
}

function resolveHostArch(): string {
    if (process.arch === 'x64' || process.arch === 'arm64') {
        return process.arch;
    }
    throw new Error(`Unsupported host arch: ${process.arch}`);
}

function resolveDefaultTarget(): string {
    const platform = resolveHostPlatform();
    const arch = resolveHostArch();
    if (platform === 'linux' && arch === 'x64') {
        return 'bun-linux-x64-baseline';
    }
    return `bun-${platform}-${arch}`;
}

function parseTarget(target: string): { platform: 'darwin' | 'linux' | 'windows'; arch: 'x64' | 'arm64'; variant?: string } {
    const parts = target.split('-');
    if (parts.length < 3 || parts.length > 4 || parts[0] !== 'bun') {
        throw new Error(`Invalid target: ${target}`);
    }

    const platform = parts[1];
    const arch = parts[2];
    const variant = parts[3];

    if (platform !== 'darwin' && platform !== 'linux' && platform !== 'windows') {
        throw new Error(`Unsupported target platform: ${target}`);
    }
    if (arch !== 'x64' && arch !== 'arm64') {
        throw new Error(`Unsupported target arch: ${target}`);
    }

    return {
        platform,
        arch,
        variant
    };
}

async function runCommand(cmd: string[], cwd: string): Promise<void> {
    console.log(`[package:portable] ${cmd.join(' ')}`);
    const proc = Bun.spawn({
        cmd,
        cwd,
        env: process.env,
        stdout: 'inherit',
        stderr: 'inherit'
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`Command failed (${exitCode}): ${cmd.join(' ')}`);
    }
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
    console.log(`[package:portable] Downloading ${url}`);
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    mkdirSync(dirname(destinationPath), { recursive: true });
    writeFileSync(destinationPath, Buffer.from(buffer));
}

async function ensureTunwgAssets(projectRoot: string, target: string): Promise<void> {
    const parsed = parseTarget(target);
    const tunwgDir = join(projectRoot, '..', 'hub', 'tools', 'tunwg');
    const releaseKey = `${parsed.arch}-${parsed.platform === 'windows' ? 'win32' : parsed.platform}`;
    const sourceUrl = TUNWG_RELEASES[releaseKey];
    if (!sourceUrl) {
        throw new Error(`No tunwg download URL for target ${target}`);
    }

    const destinationName = parsed.platform === 'windows'
        ? `tunwg-${releaseKey}.exe`
        : `tunwg-${releaseKey}`;
    const destinationPath = join(tunwgDir, destinationName);
    if (!existsSync(destinationPath)) {
        await downloadFile(sourceUrl, destinationPath);
        if (parsed.platform !== 'windows') {
            chmodSync(destinationPath, 0o755);
        }
    }

    const licensePath = join(tunwgDir, 'LICENSE');
    if (!existsSync(licensePath)) {
        await downloadFile(TUNWG_LICENSE_URL, licensePath);
    }
}

function makeReadme(options: {
    name: string
    version: string
    target: string
    binaryName: string
}): string {
    const launchCommand = options.binaryName.endsWith('.exe')
        ? `${options.binaryName} hub`
        : `./${options.binaryName} hub`;

    return [
        `# ${options.name} portable package`,
        '',
        `- Version: ${options.version}`,
        `- Target: ${options.target}`,
        '',
        '## Quick start',
        '',
        '1. Extract this archive on a machine with the matching OS/CPU target.',
        '2. Run the hub command below:',
        '',
        '```bash',
        launchCommand,
        '```',
        '',
        '3. Open the web UI shown in the terminal output.',
        '',
        '## Optional environment variables',
        '',
        '```bash',
        'export AGENTCHAT_HOME="$HOME/.agentchat"',
        'export AGENTCHAT_LISTEN_PORT=3217',
        'export AGENTCHAT_PUBLIC_URL="http://localhost:3217"',
        '```',
        '',
        'Then start it again with:',
        '',
        '```bash',
        launchCommand,
        '```',
        '',
        '## Notes',
        '',
        '- This package is target-specific; do not copy it to a different OS/CPU architecture.',
        '- On first run, AgentChat will initialize its runtime files under `AGENTCHAT_HOME`.',
        '- The executable already embeds the web UI and required runtime assets.',
        ''
    ].join('\n');
}

function makeEnvExample(): string {
    return [
        'AGENTCHAT_HOME=$HOME/.agentchat',
        'AGENTCHAT_LISTEN_PORT=3217',
        'AGENTCHAT_PUBLIC_URL=http://localhost:3217',
        ''
    ].join('\n');
}

function makeStartScript(binaryName: string): string {
    return [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        '',
        'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
        'export AGENTCHAT_HOME="${AGENTCHAT_HOME:-$HOME/.agentchat}"',
        'export AGENTCHAT_LISTEN_PORT="${AGENTCHAT_LISTEN_PORT:-3217}"',
        'export AGENTCHAT_PUBLIC_URL="${AGENTCHAT_PUBLIC_URL:-http://localhost:${AGENTCHAT_LISTEN_PORT}}"',
        '',
        `exec "$SCRIPT_DIR/${binaryName}" hub "$@"`,
        ''
    ].join('\n');
}

function makeWindowsStartScript(binaryName: string): string {
    return [
        '@echo off',
        'setlocal',
        'if "%AGENTCHAT_HOME%"=="" set "AGENTCHAT_HOME=%USERPROFILE%\\.agentchat"',
        'if "%AGENTCHAT_LISTEN_PORT%"=="" set "AGENTCHAT_LISTEN_PORT=3217"',
        'if "%AGENTCHAT_PUBLIC_URL%"=="" set "AGENTCHAT_PUBLIC_URL=http://localhost:%AGENTCHAT_LISTEN_PORT%"',
        `"%~dp0${binaryName}" hub %*`,
        ''
    ].join('\r\n');
}

async function packageTarget(options: {
    projectRoot: string
    releaseRoot: string
    target: string
    name: string
    version: string
}): Promise<string> {
    const binaryName = options.target.includes('windows') ? `${options.name}.exe` : options.name;
    const builtBinaryPath = join(options.projectRoot, 'dist-exe', options.target, binaryName);
    if (!existsSync(builtBinaryPath)) {
        throw new Error(`Built executable not found: ${builtBinaryPath}`);
    }

    const folderName = `${options.name}-${options.version}-${options.target}`;
    const stageRoot = join(options.releaseRoot, '.stage');
    const stageDir = join(stageRoot, folderName);
    const archivePath = join(options.releaseRoot, `${folderName}.tar.gz`);

    rmSync(stageDir, { recursive: true, force: true });
    mkdirSync(stageDir, { recursive: true });

    copyFileSync(builtBinaryPath, join(stageDir, binaryName));
    if (!binaryName.endsWith('.exe')) {
        chmodSync(join(stageDir, binaryName), 0o755);
    }

    writeFileSync(join(stageDir, 'README.md'), makeReadme({
        name: options.name,
        version: options.version,
        target: options.target,
        binaryName
    }));
    writeFileSync(join(stageDir, '.env.example'), makeEnvExample());
    writeFileSync(join(stageDir, 'start-hub.sh'), makeStartScript(binaryName));
    chmodSync(join(stageDir, 'start-hub.sh'), 0o755);
    writeFileSync(join(stageDir, 'start-hub.cmd'), makeWindowsStartScript(binaryName));

    rmSync(archivePath, { force: true });
    await createTar(
        {
            gzip: true,
            cwd: stageRoot,
            file: archivePath,
            portable: true
        },
        [folderName]
    );

    return archivePath;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const targetArg = getArg(args, '--target');
    const outdirArg = getArg(args, '--outdir') ?? '../release';
    const name = getArg(args, '--name') ?? 'agentchat';
    const buildAll = args.includes('--all');

    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const projectRoot = join(scriptDir, '..');
    const releaseRoot = resolve(projectRoot, outdirArg);
    const targets = buildAll ? [...DEFAULT_TARGETS] : [targetArg ?? resolveDefaultTarget()];
    const pkgJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as { version: string };
    const version = pkgJson.version;

    mkdirSync(releaseRoot, { recursive: true });
    rmSync(join(releaseRoot, '.stage'), { recursive: true, force: true });

    for (const target of targets) {
        parseTarget(target);
        await ensureTunwgAssets(projectRoot, target);
        await runCommand([
            process.execPath,
            'run',
            'scripts/build-executable.ts',
            '--with-web-assets',
            '--target',
            target,
            '--name',
            name,
            '--outdir',
            'dist-exe'
        ], projectRoot);

        const archivePath = await packageTarget({
            projectRoot,
            releaseRoot,
            target,
            name,
            version
        });

        console.log(`[package:portable] Wrote ${archivePath}`);
    }

    rmSync(join(releaseRoot, '.stage'), { recursive: true, force: true });
}

main().catch((error) => {
    console.error(`[package:portable] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
