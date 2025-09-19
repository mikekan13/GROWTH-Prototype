#!/usr/bin/env node

import { config } from 'dotenv';
import { rulesOpenIssue, OpenIssueInput } from './tools/rulesOpenIssue.js';
import { rulesProposeChange, ProposeChangeInput } from './tools/rulesProposeChange.js';
import { rulesApplyPatch, ApplyPatchInput } from './tools/rulesApplyPatch.js';

config();

const GROWTH_REPO = process.env.GROWTH_REPO;
if (!GROWTH_REPO) {
  console.error('GROWTH_REPO environment variable is required');
  process.exit(1);
}

const growthRepo: string = GROWTH_REPO;

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

class GrowthRulesMCPServer {
  private initialized = false;

  private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          this.initialized = true;
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {
                tools: {
                  listChanged: true
                }
              },
              serverInfo: {
                name: 'growth-rules-mcp',
                version: '1.0.0'
              }
            }
          };

        case 'initialized':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {}
          };

        case 'tools/list':
          if (!this.initialized) {
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32002, message: 'Server not initialized' }
            };
          }
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: [
                {
                  name: 'rules.open_issue',
                  description: 'Log a rule issue or bug in the GROWTH repository',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'Issue title' },
                      location: { type: 'string', description: 'Location in rules (e.g., rules/combat.md#anchor)' },
                      observed: { type: 'string', description: 'What was observed' },
                      expected: { type: 'string', description: 'What was expected' },
                      severity: { type: 'string', enum: ['note', 'low', 'med', 'high', 'blocking'] },
                      tags: { type: 'array', items: { type: 'string' } },
                      source: { type: 'string', enum: ['voice', 'hotkey', 'oracle', 'manual'] }
                    },
                    required: ['title', 'location', 'observed', 'expected', 'severity', 'tags', 'source']
                  }
                },
                {
                  name: 'rules.propose_change',
                  description: 'Create a change proposal for GROWTH rules',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      target: { type: 'string', description: 'Target rule location (e.g., rules/combat.md#anchor)' },
                      title: { type: 'string', description: 'Proposal title' },
                      rationale: { type: 'string', description: 'Why this change is needed' },
                      before: { type: 'string', description: 'Current rule text' },
                      after: { type: 'string', description: 'Proposed rule text' },
                      related_issues: { type: 'array', items: { type: 'string' }, description: 'Related issue references' }
                    },
                    required: ['target', 'title', 'rationale', 'before', 'after']
                  }
                },
                {
                  name: 'rules.apply_patch',
                  description: 'Apply a rule change proposal to the repository',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      proposalPath: { type: 'string', description: 'Path to the proposal file' },
                      mode: { type: 'string', enum: ['staging', 'direct'], description: 'Application mode' },
                      commitMessage: { type: 'string', description: 'Optional commit message' }
                    },
                    required: ['proposalPath', 'mode']
                  }
                }
              ]
            }
          };

        case 'tools/call':
          if (!this.initialized) {
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32002, message: 'Server not initialized' }
            };
          }

          const toolName = request.params?.name;
          const toolArgs = request.params?.arguments || {};

          switch (toolName) {
            case 'rules.open_issue':
              const issueResult = await rulesOpenIssue(toolArgs as OpenIssueInput, growthRepo);
              return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `Issue logged successfully: ${JSON.stringify(issueResult, null, 2)}`
                    }
                  ]
                }
              };
            
            case 'rules.propose_change':
              const proposeResult = await rulesProposeChange(toolArgs as ProposeChangeInput, growthRepo);
              return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `Change proposal created: ${JSON.stringify(proposeResult, null, 2)}`
                    }
                  ]
                }
              };
            
            case 'rules.apply_patch':
              const applyResult = await rulesApplyPatch(toolArgs as ApplyPatchInput, growthRepo);
              return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `Patch applied: ${JSON.stringify(applyResult, null, 2)}`
                    }
                  ]
                }
              };
            
            default:
              return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32601,
                  message: `Unknown tool: ${toolName}`
                }
              };
          }
        
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error}`
        }
      };
    }
  }

  public start(): void {
    process.stdin.setEncoding('utf8');
    
    let buffer = '';
    
    process.stdin.on('data', async (chunk: string) => {
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line.trim()) as MCPRequest;
            const response = await this.handleRequest(request);
            console.log(JSON.stringify(response));
          } catch (error) {
            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32700,
                message: 'Parse error'
              }
            }));
          }
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });
  }
}

const server = new GrowthRulesMCPServer();
server.start();