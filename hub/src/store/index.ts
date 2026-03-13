import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { FeishuStore } from './feishuStore'
import { PushStore } from './pushStore'
import { RoomStore } from './roomStore'
import { SessionStore } from './sessionStore'
import { TemplateStore } from './templateStore'
import { UserStore } from './userStore'

export type {
    StoredMachine,
    StoredMessage,
    StoredPushSubscription,
    StoredSavedTemplate,
    StoredRoom,
    StoredRoomMessage,
    StoredRoomRole,
    StoredRoomTask,
    StoredSession,
    StoredBuiltinTemplateOverride,
    StoredFeishuEventReceipt,
    StoredFeishuMessageLink,
    StoredFeishuSessionState,
    TemplateKind,
    StoredUser,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { FeishuStore } from './feishuStore'
export { PushStore } from './pushStore'
export { RoomStore } from './roomStore'
export { SessionStore } from './sessionStore'
export { TemplateStore } from './templateStore'
export { UserStore } from './userStore'

const SCHEMA_VERSION: number = 9
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'rooms',
    'room_roles',
    'room_tasks',
    'room_messages',
    'users',
    'feishu_session_states',
    'feishu_message_links',
    'feishu_event_receipts',
    'push_subscriptions',
    'saved_templates',
    'builtin_template_overrides'
] as const

export class Store {
    private db: Database
    private readonly dbPath: string

    readonly sessions: SessionStore
    readonly machines: MachineStore
    readonly messages: MessageStore
    readonly rooms: RoomStore
    readonly users: UserStore
    readonly feishu: FeishuStore
    readonly push: PushStore
    readonly templates: TemplateStore

    constructor(dbPath: string) {
        this.dbPath = dbPath
        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            const dir = dirname(dbPath)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            try {
                chmodSync(dir, 0o700)
            } catch {
            }

            if (!existsSync(dbPath)) {
                try {
                    const fd = openSync(dbPath, 'a', 0o600)
                    closeSync(fd)
                } catch {
                }
            }
        }

        this.db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        this.db.exec('PRAGMA journal_mode = WAL')
        this.db.exec('PRAGMA synchronous = NORMAL')
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 5000')
        this.initSchema()

        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
                try {
                    chmodSync(path, 0o600)
                } catch {
                }
            }
        }

        this.sessions = new SessionStore(this.db)
        this.machines = new MachineStore(this.db)
        this.messages = new MessageStore(this.db)
        this.rooms = new RoomStore(this.db)
        this.users = new UserStore(this.db)
        this.feishu = new FeishuStore(this.db)
        this.push = new PushStore(this.db)
        this.templates = new TemplateStore(this.db)
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                this.migrateLegacySchemaIfNeeded()
                this.createSchema()
                this.setUserVersion(SCHEMA_VERSION)
                return
            }

            this.createSchema()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion === 1 && SCHEMA_VERSION === 2) {
            this.migrateFromV1ToV2()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion === 2 && SCHEMA_VERSION === 3) {
            this.migrateFromV2ToV3()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion === 3 && SCHEMA_VERSION >= 4) {
            this.migrateFromV3ToV4()
            if (SCHEMA_VERSION === 4) {
                this.setUserVersion(SCHEMA_VERSION)
                return
            }
            this.setUserVersion(4)
        }

        if (this.getUserVersion() === 4 && SCHEMA_VERSION >= 5) {
            this.migrateFromV4ToV5()
            if (SCHEMA_VERSION === 5) {
                this.setUserVersion(SCHEMA_VERSION)
                return
            }
            this.setUserVersion(5)
        }

        if (this.getUserVersion() === 5 && SCHEMA_VERSION >= 6) {
            this.migrateFromV5ToV6()
            if (SCHEMA_VERSION === 6) {
                this.setUserVersion(SCHEMA_VERSION)
                return
            }
            this.setUserVersion(6)
        }

        if (this.getUserVersion() === 6 && SCHEMA_VERSION >= 7) {
            this.migrateFromV6ToV7()
            if (SCHEMA_VERSION === 7) {
                this.setUserVersion(SCHEMA_VERSION)
                return
            }
            this.setUserVersion(7)
        }

        if (this.getUserVersion() === 7 && SCHEMA_VERSION >= 8) {
            this.migrateFromV7ToV8()
            if (SCHEMA_VERSION === 8) {
                this.setUserVersion(SCHEMA_VERSION)
                return
            }
            this.setUserVersion(8)
        }

        if (this.getUserVersion() === 8 && SCHEMA_VERSION === 9) {
            this.migrateFromV8ToV9()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion !== SCHEMA_VERSION) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        this.assertRequiredTablesPresent()
    }

    private createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                namespace TEXT NOT NULL DEFAULT 'default',
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                todos TEXT,
                todos_updated_at INTEGER,
                team_state TEXT,
                team_state_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                runner_state TEXT,
                runner_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace);

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rooms_namespace ON rooms(namespace);

            CREATE TABLE IF NOT EXISTS room_roles (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                key TEXT NOT NULL,
                label TEXT NOT NULL,
                description TEXT,
                required INTEGER NOT NULL DEFAULT 0,
                preferred_flavor TEXT,
                preferred_model TEXT,
                permission_mode TEXT,
                assignment_mode TEXT NOT NULL DEFAULT 'unassigned',
                assigned_session_id TEXT,
                spawn_config TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_room_roles_room ON room_roles(room_id, sort_order);

            CREATE TABLE IF NOT EXISTS room_tasks (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                assignee_role_key TEXT,
                assignee_session_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_room_tasks_room ON room_tasks(room_id, created_at);

            CREATE TABLE IF NOT EXISTS room_messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                sender_type TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                role_key TEXT,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, seq);

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                UNIQUE(platform, platform_user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
            CREATE INDEX IF NOT EXISTS idx_users_platform_namespace ON users(platform, namespace);

            CREATE TABLE IF NOT EXISTS feishu_session_states (
                open_id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                active_session_id TEXT,
                active_room_id TEXT,
                active_target_type TEXT,
                active_machine_id TEXT,
                last_inbound_message_id TEXT,
                last_inbound_at INTEGER,
                last_outbound_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_feishu_session_states_namespace ON feishu_session_states(namespace);

            CREATE TABLE IF NOT EXISTS feishu_message_links (
                feishu_message_id TEXT PRIMARY KEY,
                open_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                session_id TEXT,
                room_id TEXT,
                agentchat_message_id TEXT,
                direction TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_feishu_message_links_open_id ON feishu_message_links(open_id);
            CREATE INDEX IF NOT EXISTS idx_feishu_message_links_session_id ON feishu_message_links(session_id);

            CREATE TABLE IF NOT EXISTS feishu_event_receipts (
                event_id TEXT PRIMARY KEY,
                open_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_feishu_event_receipts_open_id ON feishu_event_receipts(open_id);

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, endpoint)
            );
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_namespace ON push_subscriptions(namespace);

            CREATE TABLE IF NOT EXISTS saved_templates (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(namespace, kind, key)
            );
            CREATE INDEX IF NOT EXISTS idx_saved_templates_namespace_kind ON saved_templates(namespace, kind);

            CREATE TABLE IF NOT EXISTS builtin_template_overrides (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                hidden INTEGER NOT NULL DEFAULT 0,
                deleted INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                UNIQUE(namespace, kind, key)
            );
            CREATE INDEX IF NOT EXISTS idx_builtin_template_overrides_namespace_kind ON builtin_template_overrides(namespace, kind);
        `)
    }

    private migrateLegacySchemaIfNeeded(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            return
        }

        const hasDaemon = columns.has('daemon_state') || columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') || columns.has('runner_state_version')

        if (hasDaemon && hasRunner) {
            throw new Error('SQLite schema has both daemon_state and runner_state columns in machines; manual cleanup required.')
        }

        if (hasDaemon && !hasRunner) {
            this.migrateFromV1ToV2()
        }
    }

    private migrateFromV1ToV2(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            throw new Error('SQLite schema missing machines table for v1 to v2 migration.')
        }

        const hasDaemon = columns.has('daemon_state') && columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') && columns.has('runner_state_version')

        if (hasRunner && !hasDaemon) {
            return
        }

        if (!hasDaemon) {
            throw new Error('SQLite schema missing daemon_state columns for v1 to v2 migration.')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state TO runner_state')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state_version TO runner_state_version')
            this.db.exec('COMMIT')
            return
        } catch (error) {
            this.db.exec('ROLLBACK')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec(`
                CREATE TABLE machines_new (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata TEXT,
                    metadata_version INTEGER DEFAULT 1,
                    runner_state TEXT,
                    runner_state_version INTEGER DEFAULT 1,
                    active INTEGER DEFAULT 0,
                    active_at INTEGER,
                    seq INTEGER DEFAULT 0
                );
            `)
            this.db.exec(`
                INSERT INTO machines_new (
                    id, namespace, created_at, updated_at,
                    metadata, metadata_version,
                    runner_state, runner_state_version,
                    active, active_at, seq
                )
                SELECT id, namespace, created_at, updated_at,
                       metadata, metadata_version,
                       daemon_state, daemon_state_version,
                       active, active_at, seq
                FROM machines;
            `)
            this.db.exec('DROP TABLE machines')
            this.db.exec('ALTER TABLE machines_new RENAME TO machines')
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace)')
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v1->v2 failed: ${message}`)
        }
    }

    private migrateFromV2ToV3(): void {
        return
    }

    private migrateFromV3ToV4(): void {
        const columns = this.getSessionColumnNames()
        if (!columns.has('team_state')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN team_state TEXT')
        }
        if (!columns.has('team_state_updated_at')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN team_state_updated_at INTEGER')
        }
    }

    private migrateFromV4ToV5(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rooms_namespace ON rooms(namespace);

            CREATE TABLE IF NOT EXISTS room_roles (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                key TEXT NOT NULL,
                label TEXT NOT NULL,
                description TEXT,
                required INTEGER NOT NULL DEFAULT 0,
                preferred_flavor TEXT,
                preferred_model TEXT,
                permission_mode TEXT,
                assignment_mode TEXT NOT NULL DEFAULT 'unassigned',
                assigned_session_id TEXT,
                spawn_config TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_room_roles_room ON room_roles(room_id, sort_order);

            CREATE TABLE IF NOT EXISTS room_tasks (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                assignee_role_key TEXT,
                assignee_session_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_room_tasks_room ON room_tasks(room_id, created_at);

            CREATE TABLE IF NOT EXISTS room_messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                sender_type TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                role_key TEXT,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, seq);
        `)
    }

    private migrateFromV5ToV6(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS saved_templates (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(namespace, kind, key)
            );
            CREATE INDEX IF NOT EXISTS idx_saved_templates_namespace_kind ON saved_templates(namespace, kind);

            CREATE TABLE IF NOT EXISTS builtin_template_overrides (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                hidden INTEGER NOT NULL DEFAULT 0,
                deleted INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                UNIQUE(namespace, kind, key)
            );
            CREATE INDEX IF NOT EXISTS idx_builtin_template_overrides_namespace_kind ON builtin_template_overrides(namespace, kind);
        `)
    }

    private migrateFromV6ToV7(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS feishu_session_states (
                open_id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                active_session_id TEXT,
                active_room_id TEXT,
                active_target_type TEXT,
                active_machine_id TEXT,
                last_inbound_message_id TEXT,
                last_inbound_at INTEGER,
                last_outbound_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_feishu_session_states_namespace ON feishu_session_states(namespace);

            CREATE TABLE IF NOT EXISTS feishu_message_links (
                feishu_message_id TEXT PRIMARY KEY,
                open_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                session_id TEXT,
                room_id TEXT,
                agentchat_message_id TEXT,
                direction TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_feishu_message_links_open_id ON feishu_message_links(open_id);
            CREATE INDEX IF NOT EXISTS idx_feishu_message_links_session_id ON feishu_message_links(session_id);
        `)
    }

    private getSessionColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getMachineColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(machines)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private assertRequiredTablesPresent(): void {
        const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...REQUIRED_TABLES) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

        if (missing.length > 0) {
            throw new Error(
                `SQLite schema is missing required tables (${missing.join(', ')}). ` +
                'Back up and rebuild the database, or run an offline migration to the expected schema version.'
            )
        }
    }



    private migrateFromV7ToV8(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS feishu_event_receipts (
                event_id TEXT PRIMARY KEY,
                open_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_feishu_event_receipts_open_id ON feishu_event_receipts(open_id);
        `)
    }

    private migrateFromV8ToV9(): void {
        const rows = this.db.prepare('PRAGMA table_info(feishu_session_states)').all() as Array<{ name: string }>
        const columnNames = new Set(rows.map((row) => row.name))
        if (!columnNames.has('active_room_id')) {
            this.db.exec('ALTER TABLE feishu_session_states ADD COLUMN active_room_id TEXT')
        }
        if (!columnNames.has('active_target_type')) {
            this.db.exec('ALTER TABLE feishu_session_states ADD COLUMN active_target_type TEXT')
        }
    }
    private buildSchemaMismatchError(currentVersion: number): Error {
        const location = (this.dbPath === ':memory:' || this.dbPath.startsWith('file::memory:'))
            ? 'in-memory database'
            : this.dbPath
        return new Error(
            `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            'This build does not run compatibility migrations. ' +
            'Back up and rebuild the database, or run an offline migration to the expected schema version.'
        )
    }
}
