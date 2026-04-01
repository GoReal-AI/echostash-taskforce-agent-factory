/**
 * Bash execution tool — unlimited shell access.
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import type { ToolDef } from '../core/tool-types.js';

const execAsync = promisify(exec);

export const bashTool: ToolDef = {
  name: 'bash',
  description:
    'Execute a bash command. Returns stdout and stderr. Use for: running programs, installing packages, file operations, git, docker, curl, and anything else available in the shell.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms. Default: 120000' },
      cwd: { type: 'string', description: 'Working directory. Default: current' },
    },
    required: ['command'],
  },
  async execute(input) {
    const command = input.command as string;
    const timeout = (input.timeout as number) ?? 120_000;
    const cwd = (input.cwd as string) ?? process.cwd();

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      });

      const parts = [
        stdout ? `STDOUT:\n${stdout}` : '',
        stderr ? `STDERR:\n${stderr}` : '',
      ].filter(Boolean);

      return parts.join('\n\n') || '(no output)';
    } catch (error: any) {
      return `ERROR (exit ${error.code ?? 'unknown'}):\n${error.stderr || error.stdout || error.message}`;
    }
  },
};
