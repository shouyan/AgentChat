import { join } from 'path'
import { tmpdir } from 'os'

export const AGENTCHAT_BLOBS_DIR_NAME = 'agentchat-blobs'

export function getHapiBlobsDir(): string {
    return join(tmpdir(), AGENTCHAT_BLOBS_DIR_NAME)
}
