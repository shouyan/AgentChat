import { z } from 'zod'
import type { Hono } from 'hono'
import {
    MachineActionResponseSchema,
    MachineCleanupResponseSchema,
    MachineDirectoryResponseSchema,
    MachinePathsExistsResponseSchema,
    MachinesResponseSchema,
    ProviderHealthResponseSchema,
    RunnerEnvResponseSchema,
} from '@agentchat/protocol/contracts/machines'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../../web/middleware/auth'
import { requireMachine } from '../../web/routes/guards'
import { cleanupMachineSessions, restartMachineRunner, saveMachineRunnerEnv, spawnMachineSession } from './commands'
import { uniqueNonEmptyPaths } from './helpers'
import { checkMachinePaths, checkMachineProviderHealth, getMachineRunnerEnv, listMachineDirectory, listOnlineMachines } from './queries'

const spawnBodySchema = z.object({
    directory: z.string().min(1),
    agent: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).optional(),
    model: z.string().optional(),
    yolo: z.boolean().optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().optional(),
})

const pathsExistsSchema = z.object({
    paths: z.array(z.string().min(1)).max(1000),
})

const machineDirectoryQuerySchema = z.object({
    path: z.string().optional(),
})


const runnerEnvBodySchema = z.object({
    content: z.string(),
})

export function registerMachineRoutes(app: Hono<WebAppEnv>, getSyncEngine: () => SyncEngine | null): void {
    app.get('/machines', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const namespace = c.get('namespace')
        return c.json(MachinesResponseSchema.parse({ machines: listOnlineMachines(engine, namespace) }))
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = spawnBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const result = await spawnMachineSession(engine, machineId, parsed.data)
        return c.json(result)
    })

    app.post('/machines/:id/paths/exists', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = pathsExistsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const uniquePaths = uniqueNonEmptyPaths(parsed.data.paths)
        if (uniquePaths.length === 0) {
            return c.json({ exists: {} })
        }

        try {
            const exists = await checkMachinePaths(engine, machineId, uniquePaths)
            return c.json(MachinePathsExistsResponseSchema.parse({ exists }))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to check paths' }, 500)
        }
    })

    app.get('/machines/:id/directory', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const parsed = machineDirectoryQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        try {
            const result = await listMachineDirectory(engine, machineId, parsed.data.path)
            return c.json(MachineDirectoryResponseSchema.parse(result))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to list directory' }, 500)
        }
    })

    app.post('/machines/:id/restart-runner', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }
        if (!machine.active) {
            return c.json({ error: 'Machine is offline' }, 409)
        }

        try {
            const result = await restartMachineRunner(engine, machineId, c.get('namespace'))
            return c.json(MachineActionResponseSchema.parse(result), 202)
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to restart runner' }, 500)
        }
    })

    app.post('/machines/:id/cleanup-dead-sessions', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }
        if (!machine.active) {
            return c.json({ error: 'Machine is offline' }, 409)
        }

        try {
            const result = await cleanupMachineSessions(engine, machineId, c.get('namespace'))
            return c.json(MachineCleanupResponseSchema.parse(result))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to clean dead sessions' }, 500)
        }
    })

    app.post('/machines/:id/provider-health', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }
        if (!machine.active) {
            return c.json({ error: 'Machine is offline' }, 409)
        }

        try {
            const result = await checkMachineProviderHealth(engine, machineId, c.get('namespace'))
            return c.json(ProviderHealthResponseSchema.parse(result))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to run provider health checks' }, 500)
        }
    })

    app.get('/machines/:id/runner-env', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }
        if (!machine.active) {
            return c.json({ error: 'Machine is offline' }, 409)
        }

        try {
            const result = await getMachineRunnerEnv(engine, machineId, c.get('namespace'))
            return c.json(RunnerEnvResponseSchema.parse(result))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to load runner env' }, 500)
        }
    })

    app.put('/machines/:id/runner-env', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }
        if (!machine.active) {
            return c.json({ error: 'Machine is offline' }, 409)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = runnerEnvBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const result = await saveMachineRunnerEnv(engine, machineId, c.get('namespace'), parsed.data.content)
            return c.json(RunnerEnvResponseSchema.parse(result))
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to save runner env' }, 500)
        }
    })
}
