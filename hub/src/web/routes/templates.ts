import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { TemplateKind } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import type { SSEManager } from '../../sse/sseManager'

const agentFlavorSchema = z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode'])

const roleSlotTemplateSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    roleKey: z.string().min(1),
    roleLabel: z.string().min(1),
    preferredFlavor: agentFlavorSchema.optional(),
})

const roomTemplateSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    visibleInRoomCreator: z.boolean().optional(),
    slots: z.array(z.object({
        enabled: z.boolean().optional(),
        roleTemplateKey: z.string().min(1),
        agent: agentFlavorSchema.optional(),
        model: z.string().optional(),
        mentionKey: z.string().optional(),
    })).default([]),
})

const builtinOverrideSchema = z.object({
    hidden: z.boolean().optional(),
    deleted: z.boolean().optional(),
})

function getTemplatesResponse(store: Store, namespace: string) {
    return {
        customRoleTemplates: store.templates
            .getSavedTemplates(namespace, 'role_slot')
            .map((template) => roleSlotTemplateSchema.safeParse(template.payload))
            .filter((result) => result.success)
            .map((result) => result.data),
        customRoomTemplates: store.templates
            .getSavedTemplates(namespace, 'room')
            .map((template) => roomTemplateSchema.safeParse(template.payload))
            .filter((result) => result.success)
            .map((result) => result.data),
        builtinRoleTemplateOverrides: store.templates
            .getBuiltinTemplateOverrides(namespace, 'role_slot')
            .map((item) => ({ key: item.key, hidden: item.hidden, deleted: item.deleted })),
        builtinRoomTemplateOverrides: store.templates
            .getBuiltinTemplateOverrides(namespace, 'room')
            .map((item) => ({ key: item.key, hidden: item.hidden, deleted: item.deleted })),
    }
}

function parseKind(kind: string): TemplateKind | null {
    if (kind === 'role-slot') return 'role_slot'
    if (kind === 'room') return 'room'
    return null
}

function getSchemaForKind(kind: TemplateKind) {
    return kind === 'role_slot' ? roleSlotTemplateSchema : roomTemplateSchema
}

function broadcastTemplatesUpdated(sseManager: SSEManager | null, namespace: string, scope: 'all' | 'role_slot' | 'room') {
    sseManager?.broadcast({
        type: 'templates-updated',
        namespace,
        data: { scope },
    })
}

export function createTemplateRoutes(store: Store, getSseManager: () => SSEManager | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/templates', (c) => {
        const namespace = c.get('namespace')
        return c.json(getTemplatesResponse(store, namespace))
    })

    app.put('/templates/:kind/custom/:key', async (c) => {
        const namespace = c.get('namespace')
        const kind = parseKind(c.req.param('kind'))
        if (!kind) {
            return c.json({ error: 'Invalid template kind' }, 400)
        }

        const schema = getSchemaForKind(kind)
        const body = await c.req.json().catch(() => null)
        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        if (parsed.data.key !== c.req.param('key')) {
            return c.json({ error: 'Template key mismatch' }, 400)
        }

        store.templates.saveTemplate(namespace, kind, parsed.data.key, parsed.data)
        broadcastTemplatesUpdated(getSseManager(), namespace, kind)
        return c.json(getTemplatesResponse(store, namespace))
    })

    app.delete('/templates/:kind/custom/:key', (c) => {
        const namespace = c.get('namespace')
        const kind = parseKind(c.req.param('kind'))
        if (!kind) {
            return c.json({ error: 'Invalid template kind' }, 400)
        }

        store.templates.deleteTemplate(namespace, kind, c.req.param('key'))
        broadcastTemplatesUpdated(getSseManager(), namespace, kind)
        return c.json(getTemplatesResponse(store, namespace))
    })

    app.patch('/templates/:kind/builtin/:key', async (c) => {
        const namespace = c.get('namespace')
        const kind = parseKind(c.req.param('kind'))
        if (!kind) {
            return c.json({ error: 'Invalid template kind' }, 400)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = builtinOverrideSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        store.templates.saveBuiltinTemplateOverride(namespace, kind, c.req.param('key'), {
            hidden: parsed.data.hidden ?? false,
            deleted: parsed.data.deleted ?? false,
        })
        broadcastTemplatesUpdated(getSseManager(), namespace, kind)
        return c.json(getTemplatesResponse(store, namespace))
    })

    return app
}
