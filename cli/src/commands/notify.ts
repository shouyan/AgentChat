import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const notifyCommand: CommandDefinition = {
    name: 'notify',
    requiresRuntimeAssets: true,
    run: async () => {
        console.error(chalk.red('The `agentchat notify` command is not available in direct-connect mode.'))
        console.error(chalk.gray('Use AgentChat web push notifications instead.'))
        process.exit(1)
    }
}
