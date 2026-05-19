# Dice_Rolling_API.md

**Status:** #needs-validation  
**Source:** Derived from Basic_Resolution_System.md and Combat mechanics  
**Last Updated:** 2025-08-09

---

# Dice Rolling API Specification

## Core Rolling Engine

### Basic Resolution Roll
```json
POST /api/roll/basic
{
  "characterId": "string",
  "fateDie": "d4|d6|d8|d12|d20",
  "skillDie": "none|flat1|flat2|flat3|d4|d6|d8|d12|d20",
  "effortWagered": "number",
  "effortSource": "clout|celerity|constitution|flow|frequency|focus|willpower|wisdom|wit",
  "difficultyRating": "number", // Optional for client display
  "rollType": "skill|combat|magic|death"
}

Response:
{
  "rollId": "string",
  "result": {
    "fateDieRoll": "number",
    "skillDieRoll": "number|null",
    "effortApplied": "number", 
    "totalResult": "number",
    "success": "boolean", // If DR provided
    "margin": "number", // Difference from DR
    "wastedEffort": "number" // If result exceeded maximum possible
  },
  "characterState": {
    "attributePoolsAfter": {
      "attributeName": "number"
    },
    "conditionsTriggered": ["string"]
  }
}
```

### Combat Attack Roll
```json
POST /api/roll/combat
{
  "attackerId": "string",
  "defenderId": "string", 
  "weapon": {
    "name": "string",
    "damageTypes": ["string"],
    "attackModifiers": ["modifier_object"]
  },
  "targetLocation": "head|torso|rightArm|leftArm|rightLeg|leftLeg|random",
  "attackType": "normal|called_shot|all_out_attack|defensive",
  "effortWagered": "number",
  "multipleAttacks": "number" // Based on skill level
}

Response: 
{
  "attacks": [
    {
      "attackNumber": "number",
      "rollResult": {
        "fateDieRoll": "number", 
        "skillDieRoll": "number",
        "effortApplied": "number",
        "totalAttackRoll": "number"
      },
      "defense": {
        "defenseRoll": "number",
        "effortSpent": "number"
      },
      "outcome": {
        "hit": "boolean",
        "location": "string",
        "damage": {
          "types": ["string"],
          "amounts": ["number"],
          "total": "number"
        }
      }
    }
  ],
  "combatStateAfter": {
    "attackerEffort": {"attributeName": "number"},
    "defenderEffort": {"attributeName": "number"}, 
    "defenderHitPoints": {
      "location": "number"
    }
  }
}
```

### Magic Casting Roll  
```json
POST /api/roll/magic
{
  "casterId": "string",
  "spell": {
    "name": "string",
    "school": "string", 
    "pillar": "mercy|severity|balance",
    "strengthLevel": "number(1-10)",
    "manaCost": {
      "soul": "number",
      "body": "number", 
      "spirit": "number"
    }
  },
  "castingMethod": "weaving|wild_casting",
  "targetIds": ["string"], // Optional for targeted spells
  "effortWagered": "number",
  "manaAmplification": "number" // Additional mana spent
}

Response:
{
  "castingResult": {
    "rollResult": {
      "fateDieRoll": "number",
      "skillDieRoll": "number", // If spell weaving
      "magicDieRoll": "number", // If applicable
      "effortApplied": "number",
      "manaAmplification": "number",
      "totalResult": "number"
    },
    "success": "boolean",
    "spellStrength": "number", // Final effective strength
    "monkeyPaw": {
      "triggered": "boolean",
      "effects": ["string"]
    }
  },
  "targets": [
    {
      "targetId": "string", 
      "resistanceRoll": "number",
      "effectApplied": "boolean",
      "effectStrength": "number"
    }
  ],
  "casterStateAfter": {
    "mana": {
      "soul": "number",
      "body": "number", 
      "spirit": "number"
    },
    "attributePools": {"attributeName": "number"}
  }
}
```

### Death Save Roll
```json
POST /api/roll/death
{
  "characterId": "string",
  "fateDie": "d4|d6|d8|d12|d20",
  "karmaRerolls": "number", // KRMA spent on rerolls
  "ladyDeathModifier": "number" // Based on circumstances
}

Response:
{
  "deathRoll": {
    "originalRoll": "number",
    "rerolls": [
      {
        "rollNumber": "number",
        "result": "number",
        "karmaCost": "number"
      }
    ],
    "finalResult": "number",
    "ladyDeathRoll": "number",
    "outcome": "survived|death"
  },
  "characterStateAfter": {
    "frequency": "number",
    "krma": "number",
    "deathChecksPassed": "number",
    "alive": "boolean"
  }
}
```

## Utility Endpoints

### Calculate Difficulty Rating
```json
POST /api/calculate/difficulty
{
  "taskDescription": "string",
  "characterAttributes": {
    "relevantSkillLevel": "number",
    "fateDie": "string",
    "situationalModifiers": ["modifier_object"]
  }
}

Response:
{
  "suggestedDR": "number",
  "colorCode": "white|green|yellow|orange|red|black",
  "reasoning": "string",
  "alternativeApproaches": [
    {
      "approach": "string", 
      "adjustedDR": "number"
    }
  ]
}
```

### Effort Optimization 
```json
POST /api/calculate/effort
{
  "characterId": "string",
  "desiredResult": "number",
  "fateDie": "string", 
  "skillDie": "string",
  "availablePools": {"attributeName": "number"}
}

Response:
{
  "recommendations": [
    {
      "effortAmount": "number",
      "effortSource": "string", 
      "successProbability": "number",
      "wastedEffortRisk": "number"
    }
  ],
  "optimalStrategy": {
    "effortAmount": "number",
    "effortSource": "string",
    "expectedOutcome": "string"
  }
}
```

## Batch Operations

### Multiple Character Rolls
```json
POST /api/roll/batch
{
  "rolls": [
    {
      "rollType": "basic|combat|magic|death",
      "parameters": {} // Type-specific parameters
    }
  ],
  "resolveOrder": "simultaneous|sequential"
}

Response:
{
  "results": [
    {
      "rollIndex": "number",
      "result": {} // Type-specific result
    }
  ],
  "batchEffects": {
    "interactions": ["string"], // Cross-roll effects
    "finalStates": [
      {
        "characterId": "string",
        "finalState": {} // Character state object  
      }
    ]
  }
}
```

## Error Handling

### Standard Error Response
```json
{
  "error": {
    "code": "INVALID_DICE|INSUFFICIENT_EFFORT|CHARACTER_DEAD|INVALID_SPELL",
    "message": "string",
    "details": {
      "field": "string",
      "expectedValue": "string", 
      "actualValue": "string"
    }
  }
}
```

## Rate Limiting and Security

### Authentication
- bcrypt session token required for all requests
- Character ownership validation via session
- GM override permissions for campaign management

### Rate Limits
- 100 rolls per minute per user
- 1000 rolls per hour per campaign
- Batch operations count as individual rolls

---

## Links
- Related: [[Character_Sheet_JSON_Schema]], [[Basic_Resolution_System]]
- References: [[API_Authentication]], [[Database_Schema]]
- Examples: [[API_Usage_Examples]]