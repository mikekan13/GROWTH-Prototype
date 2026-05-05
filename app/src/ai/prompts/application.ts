// Prompt templates for campaign application AI features

export function buildSuggestPromptsPrompt(campaign: {
  name: string;
  genre?: string | null;
  description?: string | null;
  worldContext?: string | null;
}): string {
  return `You are a creative writing assistant for a tabletop RPG called GRO.WTH.

A Game Master (called a "Watcher") is setting up their campaign and needs backstory prompts for players (called "Trailblazers") to answer when applying to join.

Campaign details:
- Name: ${campaign.name}
${campaign.genre ? `- Genre: ${campaign.genre}` : ''}
${campaign.description ? `- Description: ${campaign.description}` : ''}
${campaign.worldContext ? `- World Context: ${campaign.worldContext}` : ''}

Generate 5 creative, open-ended backstory prompts tailored to this campaign's setting and themes. Each prompt should:
- Encourage rich character development
- Be specific enough to inspire but open enough for creative freedom
- Cover different aspects: origin, motivation, relationships, fears, goals

Return ONLY a JSON array of objects with "prompt" and "category" fields.
Categories: "origin", "motivation", "relationships", "personality", "goals"

Example format:
[{"prompt": "What event in your past...", "category": "origin"}]`;
}

export function buildExpandResponsePrompt(
  prompt: string,
  response: string,
  campaign: {
    name: string;
    genre?: string | null;
    worldContext?: string | null;
  },
): string {
  return `You are a creative writing assistant for a tabletop RPG called GRO.WTH. A player has answered a backstory prompt and wants help expanding their response into richer narrative prose.

Campaign: ${campaign.name}
${campaign.genre ? `Genre: ${campaign.genre}` : ''}
${campaign.worldContext ? `World: ${campaign.worldContext}` : ''}

Backstory prompt: "${prompt}"

Player's response: "${response}"

Expand this into 2-3 paragraphs of rich narrative prose that:
- Preserves ALL of the player's original ideas and details
- Adds atmospheric description and emotional depth
- Fits the campaign's tone and setting
- Stays in third person past tense
- Does NOT invent major plot points the player didn't mention

Return ONLY the expanded narrative text, no commentary.`;
}
