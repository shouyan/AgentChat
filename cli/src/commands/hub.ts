import chalk from 'chalk'
import { isRunnerRunningCurrentlyInstalledHappyVersion } from '@/runner/controlClient'
import { spawnHappyCLI } from '@/utils/spawnHappyCLI'
import type { CommandDefinition, CommandContext } from './types'

function parseHubArgs(args: string[]): { host?: string; port?: string } {
    const result: { host?: string; port?: string } = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--host' && i + 1 < args.length) {
            result.host = args[++i]
        } else if (arg === '--port' && i + 1 < args.length) {
            result.port = args[++i]
        } else if (arg.startsWith('--host=')) {
            result.host = arg.slice('--host='.length)
        } else if (arg.startsWith('--port=')) {
            result.port = arg.slice('--port='.length)
        }
    }

    return result
}

export const hubCommand: CommandDefinition = {
    name: 'hub',
    requiresRuntimeAssets: true,
    run: async (context: CommandContext) => {
        try {
            const { host, port } = parseHubArgs(context.commandArgs)

            if (host) {
                process.env.WEBAPP_HOST = host
            }
            if (port) {
                process.env.WEBAPP_PORT = port
            }

            const listenPort = port || process.env.AGENTCHAT_LISTEN_PORT || process.env.WEBAPP_PORT || '3217'
            const runnerApiUrl =
                process.env.AGENTCHAT_API_URL ||
                process.env.HAPI_API_URL ||
                `http://127.0.0.1:${listenPort}`

            const maybeAutoStartRunner = async () => {
                if (process.env.AGENTCHAT_DISABLE_RUNNER_AUTOSTART === '1') {
                    return
                }

                const waitForHubReady = async (): Promise<boolean> => {
                    const deadline = Date.now() + 15_000
                    while (Date.now() < deadline) {
                        try {
                            const response = await fetch(`${runnerApiUrl}/health`, {
                                signal: AbortSignal.timeout(1_000),
                            })
                            if (response.ok) {
                                return true
                            }
                        } catch {
                            // Hub is still booting; retry.
                        }
                        await new Promise((resolve) => setTimeout(resolve, 300))
                    }
                    return false
                }

                const ready = await waitForHubReady()
                if (!ready) {
                    console.log(chalk.yellow(`[Hub] Runner auto-start skipped: hub not ready at ${runnerApiUrl}`))
                    return
                }

                if (await isRunnerRunningCurrentlyInstalledHappyVersion()) {
                    return
                }

                const child = spawnHappyCLI(['runner', 'start-sync'], {
                    detached: true,
                    stdio: 'ignore',
                    env: {
                        ...process.env,
                        AGENTCHAT_API_URL: runnerApiUrl,
                    },
                })
                child.unref()
                console.log(chalk.gray(`[Hub] Auto-starting runner for ${runnerApiUrl}`))
            }

            void maybeAutoStartRunner()
            await import('../../../hub/src/index')
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    }
}
