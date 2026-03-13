/**
 * Runner doctor utilities
 * 
 * Process discovery and cleanup functions for the runner
 * Helps diagnose and fix issues with hung or orphaned processes
 */

import psList from 'ps-list';
import { killProcess } from '@/utils/process';

/**
 * Find all AgentChat CLI processes (including current process)
 */
export async function findAllAgentChatProcesses(): Promise<Array<{ pid: number, command: string, type: string }>> {
  try {
    const processes = await psList();
    const allProcesses: Array<{ pid: number, command: string, type: string }> = [];
    
    for (const proc of processes) {
      const cmd = proc.cmd || '';
      const name = proc.name || '';
      
      // Check if it's an AgentChat process
      const isAgentChatBinary = name === 'agentchat' || name === 'agentchat.exe' || /\bagentchat(\.exe)?\b/.test(cmd);
      // Dev mode: running via bun/node with src/index.ts (production uses compiled binary)
      const isDevMode = cmd.includes('src/index.ts');
      const isAgentChat = name.includes('agentchat') ||
                          name === 'node' && cmd.includes('agentchat') ||
                          isAgentChatBinary ||
                          isDevMode;
      
      if (!isAgentChat) continue;

      // Classify process type
      let type = 'unknown';
      if (proc.pid === process.pid) {
        type = 'current';
      } else if (cmd.includes('--version')) {
        type = isDevMode ? 'dev-runner-version-check' : 'runner-version-check';
      } else if (cmd.includes('runner start-sync') || cmd.includes('runner start')) {
        type = isDevMode ? 'dev-runner' : 'runner';
      } else if (cmd.includes('--started-by runner')) {
        type = isDevMode ? 'dev-runner-spawned' : 'runner-spawned-session';
      } else if (cmd.includes('doctor')) {
        type = isDevMode ? 'dev-doctor' : 'doctor';
      } else if (cmd.includes('--yolo')) {
        type = 'dev-session';
      } else {
        type = isDevMode ? 'dev-related' : 'user-session';
      }

      allProcesses.push({ pid: proc.pid, command: cmd || name, type });
    }

    return allProcesses;
  } catch (error) {
    return [];
  }
}

/**
 * Find all runaway AgentChat CLI processes that should be killed
 */
export async function findRunawayAgentChatProcesses(): Promise<Array<{ pid: number, command: string }>> {
  const allProcesses = await findAllAgentChatProcesses();
  
  // Filter to just runaway processes (excluding current process)
  return allProcesses
    .filter(p => 
      p.pid !== process.pid && (
        p.type === 'runner' ||
        p.type === 'dev-runner' ||
        p.type === 'runner-spawned-session' ||
        p.type === 'dev-runner-spawned' ||
        p.type === 'runner-version-check' ||
        p.type === 'dev-runner-version-check'
      )
    )
    .map(p => ({ pid: p.pid, command: p.command }));
}

/**
 * Kill all runaway AgentChat CLI processes
 */
export async function killRunawayAgentChatProcesses(): Promise<{ killed: number, errors: Array<{ pid: number, error: string }> }> {
  const runawayProcesses = await findRunawayAgentChatProcesses();
  const errors: Array<{ pid: number, error: string }> = [];
  let killed = 0;
  
  for (const { pid, command } of runawayProcesses) {
    try {
      console.log(`Killing runaway process PID ${pid}: ${command}`);
      
      await killProcess(pid, false);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if still alive
      const processes = await psList();
      const stillAlive = processes.find(p => p.pid === pid);
      if (stillAlive) {
        console.log(`Process PID ${pid} ignored termination request, using force kill`);
        await killProcess(pid, true);
      }
      
      console.log(`Successfully killed runaway process PID ${pid}`);
      killed++;
    } catch (error) {
      const errorMessage = (error as Error).message;
      errors.push({ pid, error: errorMessage });
      console.log(`Failed to kill process PID ${pid}: ${errorMessage}`);
    }
  }

  return { killed, errors };
}
