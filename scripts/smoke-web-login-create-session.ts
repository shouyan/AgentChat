import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type LaunchOptions, type Locator, type Page } from 'playwright-core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')
const cliOptions = parseArgs(process.argv.slice(2))
const host = cliOptions.host ?? process.env.SMOKE_HOST ?? '127.0.0.1'
const token = cliOptions.token ?? process.env.SMOKE_TOKEN ?? 'testtoken'
const headed = cliOptions.headed || process.env.SMOKE_HEADED === '1'
const keepAlive = cliOptions.keepAlive || process.env.SMOKE_KEEP_ALIVE === '1'
const browserChannel = cliOptions.browserChannel ?? process.env.SMOKE_BROWSER_CHANNEL ?? 'chrome'
const browserExecutablePath = cliOptions.browserExecutablePath ?? process.env.SMOKE_BROWSER_EXECUTABLE_PATH ?? ''
const requestedAgent = cliOptions.agent ?? normalizeAgent(process.env.SMOKE_AGENT)
const targetDirectory = resolve(cliOptions.directory ?? process.env.SMOKE_DIRECTORY ?? repoRoot)
const artifactDir = resolve(
    cliOptions.artifactDir
        ?? process.env.SMOKE_ARTIFACT_DIR
        ?? join(repoRoot, 'output', 'playwright', 'smoke-web-login-create-session')
)
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const runDir = join(artifactDir, runId)
const hubHome = cliOptions.hubHome ?? process.env.SMOKE_HUB_HOME ?? join(tmpdir(), `agentchat-smoke-hub-${runId}`)
const runnerHome = cliOptions.runnerHome ?? process.env.SMOKE_RUNNER_HOME ?? join(tmpdir(), `agentchat-smoke-runner-${runId}`)

const cliDir = join(repoRoot, 'cli')
const hubDir = join(repoRoot, 'hub')
const webDir = join(repoRoot, 'web')

type AgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
type ProviderStatus = {
    configured: boolean
    authMode?: string
    baseUrl?: string
    configPath?: string
    note?: string
}
type ProviderMap = Partial<Record<AgentFlavor, ProviderStatus>>
type Machine = {
    id: string
    active: boolean
    metadata: {
        host: string
        platform: string
        agentchatHomeDir: string
        providers?: ProviderMap
    } | null
    runnerState?: {
        status?: string
        pid?: number
        httpPort?: number
    } | null
}
type MachinesResponse = { machines: Machine[] }
type SessionsResponse = {
    sessions: Array<{
        id: string
        metadata?: {
            flavor?: string | null
            path?: string
            machineId?: string
        }
    }>
}
type AuthResponse = {
    token: string
    namespace: string
}

type CliOptions = {
    headed: boolean
    keepAlive: boolean
    host: string | null
    token: string | null
    agent: AgentFlavor | null
    directory: string | null
    browserChannel: string | null
    browserExecutablePath: string | null
    artifactDir: string | null
    hubHome: string | null
    runnerHome: string | null
    hubPort: number | null
    webPort: number | null
}

type ManagedProcess = {
    name: string
    child: ChildProcess
    logPath: string
}

const managedProcesses: ManagedProcess[] = []
let browser: Browser | null = null
let sessionId: string | null = null
let runnerStarted = false
let hubUrl = ''
let webUrl = ''

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        headed: false,
        keepAlive: false,
        host: null,
        token: null,
        agent: null,
        directory: null,
        browserChannel: null,
        browserExecutablePath: null,
        artifactDir: null,
        hubHome: null,
        runnerHome: null,
        hubPort: null,
        webPort: null
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        const next = argv[index + 1] ?? null

        if (arg === '--headed') {
            options.headed = true
            continue
        }

        if (arg === '--keep-alive') {
            options.keepAlive = true
            continue
        }

        if (!next) {
            throw new Error(`Missing value for ${arg}`)
        }

        if (arg === '--host') {
            options.host = next
            index += 1
            continue
        }

        if (arg === '--token') {
            options.token = next
            index += 1
            continue
        }

        if (arg === '--agent') {
            options.agent = normalizeAgent(next)
            if (!options.agent) {
                throw new Error(`Unsupported agent: ${next}`)
            }
            index += 1
            continue
        }

        if (arg === '--directory') {
            options.directory = next
            index += 1
            continue
        }

        if (arg === '--browser-channel') {
            options.browserChannel = next
            index += 1
            continue
        }

        if (arg === '--browser-executable-path') {
            options.browserExecutablePath = next
            index += 1
            continue
        }

        if (arg === '--artifact-dir') {
            options.artifactDir = next
            index += 1
            continue
        }

        if (arg === '--hub-home') {
            options.hubHome = next
            index += 1
            continue
        }

        if (arg === '--runner-home') {
            options.runnerHome = next
            index += 1
            continue
        }

        if (arg === '--hub-port') {
            options.hubPort = Number(next)
            index += 1
            continue
        }

        if (arg === '--web-port') {
            options.webPort = Number(next)
            index += 1
            continue
        }

        throw new Error(`Unknown argument: ${arg}`)
    }

    return options
}

function normalizeAgent(value: string | undefined): AgentFlavor | null {
    if (value === 'claude' || value === 'codex' || value === 'cursor' || value === 'gemini' || value === 'opencode') {
        return value
    }
    return null
}

function log(message: string): void {
    console.log(`[smoke:web] ${message}`)
}

function ensureDir(path: string): void {
    mkdirSync(path, { recursive: true })
}

async function getFreePort(bindHost: string): Promise<number> {
    return await new Promise<number>((resolvePort, reject) => {
        const server = createServer()
        server.on('error', reject)
        server.listen(0, bindHost, () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                server.close()
                reject(new Error('Failed to resolve an ephemeral port'))
                return
            }
            const { port } = address
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolvePort(port)
            })
        })
    })
}

function startManagedProcess(name: string, cwd: string, args: string[], env: NodeJS.ProcessEnv): ManagedProcess {
    const logPath = join(runDir, `${name}.log`)
    const child = spawn('bun', args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    })

    const stream = createWriteStream(logPath, { flags: 'a' })
    child.stdout?.pipe(stream)
    child.stderr?.pipe(stream)

    child.on('exit', (code, signal) => {
        log(`${name} exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    })

    const managed = { name, child, logPath }
    managedProcesses.push(managed)
    return managed
}

async function waitFor(
    description: string,
    check: () => Promise<boolean>,
    timeoutMs: number = 30_000,
    intervalMs: number = 500
): Promise<void> {
    const startedAt = Date.now()
    let lastError: unknown = null
    while (Date.now() - startedAt < timeoutMs) {
        try {
            if (await check()) {
                return
            }
        } catch (error) {
            lastError = error
        }
        await Bun.sleep(intervalMs)
    }
    const suffix = lastError instanceof Error ? `: ${lastError.message}` : ''
    throw new Error(`Timed out waiting for ${description}${suffix}`)
}

async function waitForHttpOk(url: string, description: string): Promise<void> {
    await waitFor(description, async () => {
        const response = await fetch(url)
        return response.ok
    }, 30_000, 500)
}

async function authenticate(baseUrl: string, accessToken: string): Promise<AuthResponse> {
    const response = await fetch(`${baseUrl}/api/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken })
    })
    if (!response.ok) {
        throw new Error(`Auth failed with ${response.status}`)
    }
    return await response.json() as AuthResponse
}

async function getMachines(baseUrl: string, jwt: string): Promise<MachinesResponse> {
    const response = await fetch(`${baseUrl}/api/machines`, {
        headers: { authorization: `Bearer ${jwt}` }
    })
    if (!response.ok) {
        throw new Error(`Failed to fetch machines (${response.status})`)
    }
    return await response.json() as MachinesResponse
}

async function getSessions(baseUrl: string, jwt: string): Promise<SessionsResponse> {
    const response = await fetch(`${baseUrl}/api/sessions`, {
        headers: { authorization: `Bearer ${jwt}` }
    })
    if (!response.ok) {
        throw new Error(`Failed to fetch sessions (${response.status})`)
    }
    return await response.json() as SessionsResponse
}

function chooseAgent(machine: Machine): AgentFlavor {
    if (requestedAgent) {
        return requestedAgent
    }

    const providers = machine.metadata?.providers ?? {}
    const preferredOrder: AgentFlavor[] = ['cursor', 'codex', 'claude', 'gemini', 'opencode']
    const configured = preferredOrder.find((agent) => providers[agent]?.configured)
    if (configured) {
        return configured
    }

    throw new Error(`No configured agent provider found on machine ${machine.id}. Set SMOKE_AGENT to override.`)
}

function runCliCommand(args: string[], extraEnv: NodeJS.ProcessEnv): void {
    const result = spawnSync('bun', args, {
        cwd: cliDir,
        env: { ...process.env, ...extraEnv },
        encoding: 'utf8'
    })

    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)

    if (result.status !== 0) {
        throw new Error(`Command failed: bun ${args.join(' ')}`)
    }
}

async function stopSessionIfNeeded(): Promise<void> {
    if (!sessionId) return
    try {
        runCliCommand(['src/index.ts', 'runner', 'stop-session', sessionId], {
            AGENTCHAT_HOME: runnerHome,
            AGENTCHAT_API_URL: hubUrl,
            CLI_API_TOKEN: token
        })
    } catch (error) {
        log(`stop-session skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
}

async function stopRunnerIfNeeded(): Promise<void> {
    if (!runnerStarted) return
    try {
        runCliCommand(['src/index.ts', 'runner', 'stop'], {
            AGENTCHAT_HOME: runnerHome,
            AGENTCHAT_API_URL: hubUrl,
            CLI_API_TOKEN: token
        })
    } catch (error) {
        log(`runner stop skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
}

async function terminateManagedProcess(processRef: ManagedProcess): Promise<void> {
    const { child, name } = processRef
    if (child.exitCode !== null || child.killed) {
        return
    }

    child.kill('SIGTERM')
    const startedAt = Date.now()
    while (Date.now() - startedAt < 5_000) {
        if (child.exitCode !== null) {
            return
        }
        await Bun.sleep(100)
    }

    log(`Force killing ${name}`)
    child.kill('SIGKILL')
}

async function waitForLocatorEnabled(locator: Locator, description: string): Promise<void> {
    await waitFor(description, async () => await locator.isEnabled(), 15_000, 250)
}

async function launchBrowser(): Promise<Browser> {
    const launchOptions: LaunchOptions = {
        headless: !headed
    }

    if (browserExecutablePath) {
        launchOptions.executablePath = browserExecutablePath
    } else {
        launchOptions.channel = browserChannel
    }

    try {
        return await chromium.launch(launchOptions)
    } catch (error) {
        const details = error instanceof Error ? error.message : String(error)
        throw new Error(
            `Failed to launch browser. Set SMOKE_BROWSER_EXECUTABLE_PATH or SMOKE_BROWSER_CHANNEL. ${details}`
        )
    }
}

async function runBrowserFlow(machine: Machine, agent: AgentFlavor): Promise<string> {
    browser = await launchBrowser()
    const context = await browser.newContext()
    await context.addInitScript(() => {
        localStorage.setItem('agentchat-lang', 'en')
    })

    const page = await context.newPage()
    const loginUrl = `${webUrl}/?hub=${encodeURIComponent(hubUrl)}`
    await page.goto(loginUrl, { waitUntil: 'networkidle' })
    await performLogin(page)
    await createSession(page, machine, agent)

    const currentUrl = new URL(page.url())
    const nextSessionId = currentUrl.pathname.split('/').filter(Boolean).at(-1)
    if (!nextSessionId || nextSessionId === 'new') {
        throw new Error(`Unexpected session URL: ${page.url()}`)
    }

    await page.screenshot({
        path: join(runDir, 'web-login-create-session.png'),
        fullPage: true
    })

    return nextSessionId
}

async function performLogin(page: Page): Promise<void> {
    await page.getByPlaceholder('Access token').fill(token)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL(/\/sessions(?:\?.*)?$/, { timeout: 20_000 })
}

async function createSession(page: Page, machine: Machine, agent: AgentFlavor): Promise<void> {
    await page.getByRole('button', { name: 'Session' }).click()
    await page.waitForURL(/\/sessions\/new$/, { timeout: 20_000 })

    const machineSelect = page.locator('select').first()
    await machineSelect.selectOption(machine.id)

    await page.getByPlaceholder('/path/to/project').fill(targetDirectory)
    await page.getByRole('radio', { name: agent }).click()

    const createButton = page.getByRole('button', { name: 'Create' })
    await waitForLocatorEnabled(createButton, 'Create button to become enabled')
    await createButton.click()
    await page.waitForURL(/\/sessions\/[0-9a-f-]+$/, { timeout: 30_000 })
    await waitForChatReady(page)
}

async function waitForChatReady(page: Page): Promise<void> {
    await waitFor('session chat to render', async () => {
        const chatBox = page.getByPlaceholder('Type a message...')
        return await chatBox.isVisible()
    }, 30_000, 250)
}

async function cleanup(): Promise<void> {
    await stopSessionIfNeeded()
    await stopRunnerIfNeeded()

    if (browser) {
        await browser.close()
        browser = null
    }

    for (const processRef of managedProcesses.reverse()) {
        await terminateManagedProcess(processRef)
    }

    if (!keepAlive) {
        rmSync(hubHome, { recursive: true, force: true })
        rmSync(runnerHome, { recursive: true, force: true })
    }
}

async function main(): Promise<void> {
    ensureDir(runDir)

    const hubPort = cliOptions.hubPort ?? Number(process.env.SMOKE_HUB_PORT ?? await getFreePort(host))
    const webPort = cliOptions.webPort ?? Number(process.env.SMOKE_WEB_PORT ?? await getFreePort(host))
    hubUrl = `http://${host}:${hubPort}`
    webUrl = `http://${host}:${webPort}`

    log(`artifacts: ${runDir}`)
    log(`hub: ${hubUrl}`)
    log(`web: ${webUrl}`)
    log(`runner home: ${runnerHome}`)

    startManagedProcess('hub', hubDir, ['run', 'src/index.ts'], {
        ...process.env,
        CLI_API_TOKEN: token,
        AGENTCHAT_HOME: hubHome,
        AGENTCHAT_LISTEN_HOST: host,
        AGENTCHAT_LISTEN_PORT: String(hubPort),
        AGENTCHAT_PUBLIC_URL: hubUrl,
        CORS_ORIGINS: webUrl
    })
    await waitForHttpOk(`${hubUrl}/`, 'hub HTTP server')

    startManagedProcess('web', webDir, ['x', 'vite', '--host', host, '--port', String(webPort)], {
        ...process.env,
        BROWSER: 'none'
    })
    await waitForHttpOk(`${webUrl}/`, 'web dev server')

    runCliCommand(['src/index.ts', 'runner', 'start'], {
        AGENTCHAT_HOME: runnerHome,
        AGENTCHAT_API_URL: hubUrl,
        CLI_API_TOKEN: token
    })
    runnerStarted = true

    const auth = await authenticate(hubUrl, token)
    let machine: Machine | null = null
    await waitFor('runner machine registration', async () => {
        const machines = await getMachines(hubUrl, auth.token)
        machine = machines.machines.find((entry) => entry.metadata?.agentchatHomeDir === runnerHome) ?? null
        return Boolean(machine?.active && machine.runnerState?.status === 'running')
    }, 30_000, 500)

    if (!machine) {
        throw new Error('Runner machine did not register')
    }

    const agent = chooseAgent(machine)
    log(`selected agent: ${agent}`)

    sessionId = await runBrowserFlow(machine, agent)

    await waitFor('session to appear in API', async () => {
        const sessions = await getSessions(hubUrl, auth.token)
        return sessions.sessions.some((entry) => entry.id === sessionId)
    }, 30_000, 500)

    const sessions = await getSessions(hubUrl, auth.token)
    const session = sessions.sessions.find((entry) => entry.id === sessionId)
    writeFileSync(join(runDir, 'result.json'), JSON.stringify({
        sessionId,
        agent,
        targetDirectory,
        hubUrl,
        webUrl,
        machineId: machine.id,
        machineHome: runnerHome,
        session
    }, null, 4))

    log(`session created: ${sessionId}`)
    log(`screenshot: ${join(runDir, 'web-login-create-session.png')}`)
}

let exitCode = 0
try {
    await main()
} catch (error) {
    exitCode = 1
    const details = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(details)
} finally {
    await cleanup()
    process.exitCode = exitCode
}
