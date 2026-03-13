import chalk from 'chalk'
import { startRunner } from '@/runner/run'
import {
    checkIfRunnerRunningAndCleanupStaleState,
    listRunnerSessions,
    stopRunner,
    stopRunnerSession
} from '@/runner/controlClient'
import { getLatestRunnerLog } from '@/ui/logger'
import { spawnAgentchatCLI } from '@/utils/spawnAgentchatCLI'
import { runDoctorCommand } from '@/ui/doctor'
import { initializeToken } from '@/ui/tokenInit'
import { configuration } from '@/configuration'
import { ensureRunnerEnvFile, readRunnerEnvFile, RUNNER_ENV_KEYS } from '@/runner/envFile'
import type { CommandDefinition } from './types'

export const runnerCommand: CommandDefinition = {
    name: 'runner',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        const runnerSubcommand = commandArgs[0]

        if (runnerSubcommand === 'list') {
            try {
                const sessions = await listRunnerSessions()

                if (sessions.length === 0) {
                    console.log('No active sessions this runner is aware of (they might have been started by a previous version of the runner)')
                } else {
                    console.log('Active sessions:')
                    console.log(JSON.stringify(sessions, null, 2))
                }
            } catch {
                console.log('No runner running')
            }
            return
        }

        if (runnerSubcommand === 'stop-session') {
            const sessionId = commandArgs[1]
            if (!sessionId) {
                console.error('Session ID required')
                process.exit(1)
            }

            try {
                const success = await stopRunnerSession(sessionId)
                console.log(success ? 'Session stopped' : 'Failed to stop session')
            } catch {
                console.log('No runner running')
            }
            return
        }

        if (runnerSubcommand === 'start') {
            const child = spawnAgentchatCLI(['runner', 'start-sync'], {
                detached: true,
                stdio: 'ignore',
                env: process.env
            })
            child.unref()

            let started = false
            for (let i = 0; i < 50; i++) {
                if (await checkIfRunnerRunningAndCleanupStaleState()) {
                    started = true
                    break
                }
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            if (started) {
                console.log('Runner started successfully')
            } else {
                console.error('Failed to start runner')
                process.exit(1)
            }
            process.exit(0)
        }

        if (runnerSubcommand === 'env') {
            const envSubcommand = commandArgs[1]

            if (envSubcommand === 'show') {
                await ensureRunnerEnvFile()
                const env = await readRunnerEnvFile()
                console.log(`Runner env file: ${chalk.cyan(configuration.runnerEnvFile)}`)
                console.log(chalk.gray('Edit this file manually. New agent sessions started by runner will use these values.'))
                if (RUNNER_ENV_KEYS.every((key) => !env[key])) {
                    console.log(chalk.yellow('No managed provider variables configured yet.'))
                }
                for (const key of RUNNER_ENV_KEYS) {
                    console.log(`${key}=${env[key] ?? ''}`)
                }
                return
            }

            console.log(`
${chalk.bold('agentchat runner env')} - Runner environment

${chalk.bold('Managed variables:')}
  ${RUNNER_ENV_KEYS.join('\n  ')}

${chalk.bold('Usage:')}
  agentchat runner env show           Show ${chalk.cyan(configuration.runnerEnvFile)} and managed values

${chalk.bold('Edit manually:')}
  ${chalk.cyan(configuration.runnerEnvFile)}
`)
            return
        }

        if (runnerSubcommand === 'start-sync') {
            await initializeToken()
            await startRunner()
            process.exit(0)
        }

        if (runnerSubcommand === 'stop') {
            await stopRunner()
            process.exit(0)
        }

        if (runnerSubcommand === 'status') {
            await runDoctorCommand('runner')
            process.exit(0)
        }

        if (runnerSubcommand === 'logs') {
            const latest = await getLatestRunnerLog()
            if (!latest) {
                console.log('No runner logs found')
            } else {
                console.log(latest.path)
            }
            process.exit(0)
        }

        console.log(`
${chalk.bold('agentchat runner')} - Runner management

${chalk.bold('Usage:')}
  agentchat runner start              Start the runner (detached)
  agentchat runner stop               Stop the runner (sessions stay alive)
  agentchat runner status             Show runner status
  agentchat runner list               List active sessions
  agentchat runner env show           Show current runner.env values

  If you want to kill all agentchat related processes run 
  ${chalk.cyan('agentchat doctor clean')}

${chalk.bold('Runner env file:')} ${chalk.cyan(configuration.runnerEnvFile)}
${chalk.bold('Note:')} Edit runner.env manually. New agent sessions started by runner will use these values.

${chalk.bold('To clean up runaway processes:')} Use ${chalk.cyan('agentchat doctor clean')}
`)
    }
}
