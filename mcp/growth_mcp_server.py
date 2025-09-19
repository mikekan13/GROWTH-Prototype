#!/usr/bin/env python3

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
import asyncio

from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("GROWTH-MCP")

# Get repository paths from environment
GROWTH_REPO = os.getenv('GROWTH_REPO', 'C:/Users/Mikek/Desktop/GROWTH/GROWTH_Repository')
CAMPAIGN_REPO = os.getenv('CAMPAIGN_REPO', 'C:/Users/Mikek/Desktop/GROWTH/Campaign_Data')

def ensure_dir(path: str) -> None:
    """Ensure directory exists."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)

def safe_append_jsonl(file_path: str, record: Dict[str, Any]) -> int:
    """Safely append a JSON record to a JSONL file."""
    ensure_dir(file_path)
    
    # Add timestamp if not provided
    if 'ts' not in record:
        record['ts'] = datetime.now().isoformat()
    
    # Count existing lines for line number
    line_count = 0
    if Path(file_path).exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            line_count = sum(1 for line in f if line.strip())
    
    # Append new record
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(record) + '\n')
    
    return line_count + 1

@mcp.tool()
async def log_issue(
    title: str,
    location: str,
    observed: str,
    expected: str,
    severity: str,
    tags: List[str],
    source: str = "manual"
) -> str:
    """Log a rule issue or bug in the GROWTH repository.
    
    Args:
        title: Issue title
        location: Location in rules (e.g., rules/combat.md#anchor)
        observed: What was observed
        expected: What was expected  
        severity: Issue severity (note, low, med, high, blocking)
        tags: List of tags
        source: Issue source (voice, hotkey, oracle, manual)
    """
    try:
        issues_file = os.path.join(GROWTH_REPO, 'corrections', 'issues.jsonl')
        
        record = {
            'title': title,
            'location': location,
            'observed': observed,
            'expected': expected,
            'severity': severity,
            'tags': tags,
            'source': source
        }
        
        line_number = safe_append_jsonl(issues_file, record)
        
        return f"Issue logged successfully at line {line_number} in corrections/issues.jsonl"
        
    except Exception as e:
        return f"Error logging issue: {str(e)}"

@mcp.tool()
async def log_event(
    event_type: str,
    actors: List[str],
    summary: str,
    source: str,
    raw_data: str,
    refs: List[str] = None
) -> str:
    """Log a campaign event to the events journal.
    
    Args:
        event_type: Type of event (scene, roll, ruling, lore, npc, item, system, meta)
        actors: Characters/NPCs involved
        summary: Brief description of the event
        source: Event source (companion, oracle, player, system)
        raw_data: Raw event data
        refs: References to other entities
    """
    try:
        events_file = os.path.join(CAMPAIGN_REPO, 'events.jsonl')
        
        record = {
            'type': event_type,
            'actors': actors,
            'summary': summary,
            'source': source,
            'data': {
                'raw': raw_data,
                'refs': refs or []
            }
        }
        
        line_number = safe_append_jsonl(events_file, record)
        
        return f"Event logged successfully at line {line_number} in events.jsonl"
        
    except Exception as e:
        return f"Error logging event: {str(e)}"

@mcp.tool()
async def create_npc(
    name: str,
    first_seen: str,
    summary: str,
    tags: List[str],
    notes: str = "",
    npc_id: str = None
) -> str:
    """Create or update an NPC in the campaign.
    
    Args:
        name: NPC name
        first_seen: Where/when first encountered
        summary: Brief description of the NPC
        tags: Descriptive tags
        notes: Additional notes
        npc_id: Unique NPC identifier (optional)
    """
    try:
        # Create slug from name or id
        slug = (npc_id or name).lower().replace(' ', '-').replace('_', '-')
        slug = ''.join(c for c in slug if c.isalnum() or c == '-')
        
        npc_dir = os.path.join(CAMPAIGN_REPO, 'npcs')
        npc_file = os.path.join(npc_dir, f'{slug}.json')
        
        ensure_dir(npc_file)
        
        # Check if NPC exists
        exists = Path(npc_file).exists()
        existing_data = {}
        if exists:
            with open(npc_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        
        # Merge data
        npc_data = {
            'id': npc_id or existing_data.get('id', slug),
            'name': name,
            'firstSeen': first_seen,
            'summary': summary,
            'tags': list(set((existing_data.get('tags', []) + tags))),
            'notes': notes,
            'stats': existing_data.get('stats', {}),
            'created': existing_data.get('created', datetime.now().isoformat()),
            'updated': datetime.now().isoformat()
        }
        
        with open(npc_file, 'w', encoding='utf-8') as f:
            json.dump(npc_data, f, indent=2)
        
        action = "updated" if exists else "created"
        return f"NPC '{name}' {action} successfully in npcs/{slug}.json"
        
    except Exception as e:
        return f"Error creating NPC: {str(e)}"

if __name__ == "__main__":
    # Run the server
    mcp.run(transport='stdio')