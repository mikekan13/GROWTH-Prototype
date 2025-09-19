# MCP Setup Instructions for GROWTH Prototype

## ✅ Configuration Complete

Both ChatGPT Desktop and Claude Desktop have been configured to use our local MCP servers.

### Configuration Files Created:
- **ChatGPT Desktop**: `%APPDATA%\ChatGPT\chatgpt_desktop_config.json`
- **Claude Desktop**: `%APPDATA%\Claude\claude_desktop_config.json`

Both point to our local MCP servers:
- `growth-rules-mcp` - Rules management (issues, proposals, patches)
- `campaign-mcp` - Campaign tracking (events, NPCs)

## Next Steps for You:

### 1. Restart Both Applications
- **Completely quit** ChatGPT Desktop and Claude Desktop
- **Restart** both applications
- This is crucial for the new configurations to load

### 2. Verify MCP Connection

#### In ChatGPT Desktop:
- Look for MCP server indicator (usually in bottom-right corner)
- Check for available tools in the interface
- You should see tools like: `rules.open_issue`, `campaign.events.append`

#### In Claude Desktop:
- Look for MCP connection indicator 
- Go to Settings → Developer to check server status
- Should show both servers as "Connected"

### 3. Available Tools

Once connected, you'll have access to:

#### Rules Management (`growth-rules-mcp`):
- `rules.open_issue` - Log rule issues/bugs
- `rules.propose_change` - Create rule change proposals
- `rules.apply_patch` - Apply changes to rules

#### Campaign Management (`campaign-mcp`):
- `campaign.events.append` - Log gameplay events
- `campaign.npc.upsert` - Create/update NPC records

### 4. Test Commands

Try these test commands in either ChatGPT or Claude:

#### Test Issue Logging:
```
Can you log a test issue using rules.open_issue with these details:
- title: "Test MCP Integration"
- location: "rules/combat.md#test"
- observed: "Testing MCP connection"
- expected: "MCP should work"
- severity: "low"
- tags: ["test", "mcp"]
- source: "manual"
```

#### Test Event Logging:
```
Can you log a test event using campaign.events.append with:
- type: "system"
- actors: ["Test Player"]
- summary: "MCP integration test"
- source: "system"
- data: { raw: "Testing MCP connection", refs: ["test"] }
```

## Troubleshooting

### If MCP servers don't appear:
1. **Check Node.js**: Ensure Node.js is installed and accessible
2. **Check paths**: Verify all paths in config files are correct
3. **Check permissions**: Ensure applications can execute pnpm commands
4. **Restart completely**: Quit and restart the desktop applications

### Alternative Commands:
If `pnpm` doesn't work, the config also supports `npm`:
```json
"command": "npm",
"args": ["--prefix", "C:/Users/Mikek/Desktop/GROWTH/GROWTH Prototype/mcp/growth-rules-mcp", "run", "dev"]
```

### Common Issues:
- **Path separators**: Use forward slashes `/` in JSON config files
- **Environment variables**: Make sure GROWTH_REPO and CAMPAIGN_REPO paths exist
- **Permissions**: Run desktop apps as administrator if needed

## Repository Structure

```
GROWTH Repository: C:/Users/Mikek/Desktop/GROWTH/GROWTH_Repository
Campaign Data: C:/Users/Mikek/Desktop/GROWTH/Campaign_Data
MCP Servers: C:/Users/Mikek/Desktop/GROWTH/GROWTH Prototype/mcp/
```

## Success Indicators

✅ **ChatGPT Desktop**: MCP tools appear in interface  
✅ **Claude Desktop**: Shows "Connected" status for both servers  
✅ **Test commands**: Can successfully call MCP tools  
✅ **File creation**: Tools create files in correct repositories  

Once you see these indicators, the GROWTH prototype brain system is fully operational!