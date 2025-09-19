#!/usr/bin/env node

import { config } from 'dotenv';
import { eventsAppend, EventRecord } from './tools/eventsAppend.js';
import { npcUpsert, NPCCard } from './tools/npcUpsert.js';

config();

const CAMPAIGN_REPO = process.env.CAMPAIGN_REPO;
if (!CAMPAIGN_REPO) {
  console.error('CAMPAIGN_REPO environment variable is required');
  process.exit(1);
}

const campaignRepo: string = CAMPAIGN_REPO;

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

class CampaignMCPServer {
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
                name: 'campaign-mcp',
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
                  name: 'campaign.events.append',
                  description: 'Log a campaign event to the events journal',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      ts: { type: 'string', description: 'ISO timestamp (optional, auto-generated if not provided)' },
                      type: { type: 'string', enum: ['scene', 'roll', 'ruling', 'lore', 'npc', 'item', 'system', 'meta'] },
                      actors: { type: 'array', items: { type: 'string' }, description: 'Characters/NPCs involved' },
                      summary: { type: 'string', description: 'Brief description of the event' },
                      source: { type: 'string', enum: ['companion', 'oracle', 'player', 'system'] },
                      data: {
                        type: 'object',
                        properties: {
                          raw: { type: 'string', description: 'Raw event data' },
                          refs: { type: 'array', items: { type: 'string' }, description: 'References to other entities' }
                        },
                        required: ['raw', 'refs']
                      }
                    },
                    required: ['type', 'actors', 'summary', 'source', 'data']
                  }
                },
                {
                  name: 'campaign.npc.upsert',
                  description: 'Create or update an NPC in the campaign',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: 'Unique NPC identifier (optional)' },
                      name: { type: 'string', description: 'NPC name' },
                      firstSeen: { type: 'string', description: 'Where/when first encountered' },
                      summary: { type: 'string', description: 'Brief description of the NPC' },
                      tags: { type: 'array', items: { type: 'string' }, description: 'Descriptive tags' },
                      stats: { type: 'object', description: 'Game statistics and attributes' },
                      notes: { type: 'string', description: 'Additional notes' }
                    },
                    required: ['name', 'firstSeen', 'summary', 'tags', 'stats', 'notes']
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
            case 'campaign.events.append':
              const eventResult = await eventsAppend(toolArgs as EventRecord, campaignRepo);
              return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `Event logged successfully: ${JSON.stringify(eventResult, null, 2)}`
                    }
                  ]
                }
              };
            
            case 'campaign.npc.upsert':
              const npcResult = await npcUpsert(toolArgs as NPCCard, campaignRepo);
              return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `NPC ${npcResult.created ? 'created' : 'updated'} successfully: ${JSON.stringify(npcResult, null, 2)}`
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

const server = new CampaignMCPServer();
server.start();