import chalk from 'chalk'
import { initializeToken } from '@/ui/tokenInit'
import { maybeAutoStartServer } from '@/utils/autoStartServer'
import { runAttach } from '@/attach/runAttach'
import type { CommandDefinition } from './types'

export const attachCommand: CommandDefinition = {
    name: 'attach',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        try {
            const sessionId = commandArgs[0]
            if (!sessionId) {
                throw new Error('attach requires a session id')
            }
            if (commandArgs.length > 1) {
                throw new Error(`Unknown arguments: ${commandArgs.slice(1).join(' ')}`)
            }

            await initializeToken()
            await maybeAutoStartServer()
            await runAttach({ sessionId })
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    }
}
