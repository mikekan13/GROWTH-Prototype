# Character_Sheet_JSON_Schema.md

**Status:** #needs-validation  
**Source:** Derived from character creation systems and attribute mechanics  
**Last Updated:** 2025-08-09

---

# Character Sheet JSON Schema

## Core Character Data Structure

```json
{
  "character": {
    "metadata": {
      "id": "string",
      "name": "string", 
      "player": "string",
      "campaign": "string",
      "created": "ISO-8601-date",
      "lastUpdated": "ISO-8601-date"
    },
    "creation": {
      "seed": {
        "name": "string",
        "type": "string",
        "fatedie": "d4|d6|d8|d12|d20",
        "lifespanLevel": "number(1-10)",
        "frequencyBudget": "number",
        "specialAbilities": ["string"]
      },
      "root": {
        "name": "string",
        "description": "string",
        "frequencyCost": "number",
        "ageAdded": "number",
        "effects": {
          "skills": {"skillName": "number"},
          "attributes": {"attributeName": "number"},
          "wealth": "number",
          "social": ["string"]
        }
      },
      "branches": [
        {
          "name": "string",
          "description": "string", 
          "frequencyCost": "number",
          "ageAdded": "number",
          "effects": {
            "skills": {"skillName": "number"},
            "attributes": {"attributeName": "number"},
            "equipment": ["string"]
          }
        }
      ]
    },
    "attributes": {
      "body": {
        "clout": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        },
        "celerity": {
          "base": "number",
          "current": "number", 
          "maximum": "number",
          "modifiers": ["modifier_object"]
        },
        "constitution": {
          "base": "number",
          "current": "number",
          "maximum": "number", 
          "modifiers": ["modifier_object"]
        }
      },
      "spirit": {
        "flow": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        },
        "frequency": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        },
        "focus": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        }
      },
      "soul": {
        "willpower": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        },
        "wisdom": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        },
        "wit": {
          "base": "number",
          "current": "number",
          "maximum": "number",
          "modifiers": ["modifier_object"]
        }
      }
    },
    "skills": {
      "skillName": {
        "level": "number(0-20)",
        "dieType": "flat|d4|d6|d8|d12|d20",
        "source": "seed|root|branch|advancement"
      }
    },
    "systems": {
      "fatedAge": {
        "baseAge": "number",
        "addedAge": "number",
        "currentAge": "number",
        "lifespanLevel": "number(1-10)",
        "deathChecksPassed": "number"
      },
      "wealthLevel": {
        "level": "number(1-10)",
        "checksRemaining": [
          {"level": "number", "checks": "number"}
        ]
      },
      "technologyLevel": {
        "level": "number(1-10)",
        "specialties": ["string"]
      },
      "nectarsAndThorns": {
        "nectars": [
          {"name": "string", "description": "string", "bonus": "string"}
        ],
        "thorns": [
          {"name": "string", "description": "string", "penalty": "string"}
        ]
      },
      "goalsAndFears": {
        "goals": [
          {"description": "string", "status": "active|completed|abandoned"}
        ],
        "fears": [
          {"description": "string", "severity": "minor|major|phobia"}
        ]
      },
      "groVines": {
        "activeVines": [
          {
            "goal": "string",
            "assignedGodhead": "string",
            "resistanceKV": "number",
            "opportunityKV": "number",
            "status": "active|completed|abandoned"
          }
        ],
        "vineCapacity": "number"
      }
    },
    "equipment": {
      "inventory": [
        {
          "name": "string",
          "type": "weapon|armor|tool|misc",
          "condition": "number(1-10)",
          "weightLevel": "number(1-5)",
          "techLevel": "number(1-10)",
          "wealthLevel": "number(1-10)",
          "material": "string",
          "properties": ["string"]
        }
      ],
      "encumbrance": {
        "carryLevel": "number",
        "currentWeight": "number",
        "status": "normal|loaded|encumbered"
      }
    },
    "magic": {
      "mana": {
        "spirit": {"current": "number", "maximum": "number"},
        "body": {"current": "number", "maximum": "number"},
        "soul": {"current": "number", "maximum": "number"}
      },
      "knownSpells": [
        {
          "name": "string",
          "school": "string",
          "pillar": "mercy|severity|balance", 
          "strengthLevel": "number(1-10)",
          "description": "string"
        }
      ]
    },
    "combat": {
      "hitLocations": {
        "head": {"current": "number", "maximum": "number"},
        "torso": {"current": "number", "maximum": "number"},
        "rightArm": {"current": "number", "maximum": "number"},
        "leftArm": {"current": "number", "maximum": "number"},
        "rightLeg": {"current": "number", "maximum": "number"},
        "leftLeg": {"current": "number", "maximum": "number"}
      },
      "conditions": [
        {
          "name": "string",
          "severity": "number",
          "duration": "number|permanent",
          "effects": ["string"]
        }
      ]
    },
    "meta": {
      "krma": {
        "earned": "number",
        "spent": "number", 
        "available": "number"
      },
      "karmaValue": "number",
      "soulPackage": {
        "halfSoul": {
          "willpower": "number",
          "wisdom": "number",
          "wit": "number"
        },
        "fullSpirit": {
          "flow": "number",
          "frequency": "number",
          "focus": "number"
        }
      }
    }
  }
}
```

## Modifier Object Schema

```json
{
  "modifier": {
    "source": "string",
    "type": "equipment|condition|spell|temporary",
    "value": "number",
    "duration": "permanent|number|until_rest"
  }
}
```

## API Endpoints Structure

### Character Management
- `GET /characters/{id}` - Retrieve character
- `POST /characters` - Create new character  
- `PUT /characters/{id}` - Update character
- `DELETE /characters/{id}` - Delete character

### Character Creation
- `POST /characters/create/seed` - Apply seed template
- `POST /characters/create/root` - Apply root template
- `POST /characters/create/branch` - Add branch

### Gameplay Operations  
- `POST /characters/{id}/rest/short` - Short rest recovery
- `POST /characters/{id}/rest/long` - Long rest recovery
- `POST /characters/{id}/damage` - Apply damage
- `POST /characters/{id}/heal` - Apply healing
- `POST /characters/{id}/effort` - Spend effort points

### Dice Rolling
- `POST /roll/basic` - Basic resolution roll
- `POST /roll/combat` - Combat attack roll
- `POST /roll/magic` - Magic casting roll
- `POST /roll/death` - Death save roll

---

## Links
- Related: [[Design_Philosophy_and_Visual_Guidelines]], [[Character_Creation_API]]
- References: [[API_Documentation]], [[Database_Schema]]
- Examples: [[Character_JSON_Examples]]