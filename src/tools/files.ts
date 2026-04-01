/**
 * File operation tools — read and write.
 */

import { readFileSync, writeFileSync } from 'fs';
import type { ToolDef } from '../core/tool-types.js';

export const readFileTool: ToolDef = {
  name: 'read_file',
  description: 'Read the contents of a file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
    },
    required: ['path'],
  },
  async execute(input) {
    try {
      return readFileSync(input.path as string, 'utf-8');
    } catch (error: any) {
      return `ERROR: ${error.message}`;
    }
  },
};

export const writeFileTool: ToolDef = {
  name: 'write_file',
  description: 'Write content to a file. Creates or overwrites.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  async execute(input) {
    try {
      const content = input.content as string;
      writeFileSync(input.path as string, content, 'utf-8');
      return `Written ${content.length} bytes to ${input.path}`;
    } catch (error: any) {
      return `ERROR: ${error.message}`;
    }
  },
};
