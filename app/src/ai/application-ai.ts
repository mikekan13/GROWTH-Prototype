import 'server-only';
import { getAIProvider } from './providers';
import { buildSuggestPromptsPrompt, buildExpandResponsePrompt } from './prompts/application';

interface CampaignContext {
  name: string;
  genre?: string | null;
  description?: string | null;
  worldContext?: string | null;
}

interface SuggestedPrompt {
  prompt: string;
  category: string;
}

export async function suggestApplicationPrompts(campaign: CampaignContext): Promise<SuggestedPrompt[]> {
  const provider = getAIProvider();
  const prompt = buildSuggestPromptsPrompt(campaign);

  const raw = await provider.generateText(prompt, { temperature: 0.8, maxTokens: 1024 });

  // Extract JSON array from response (model may wrap in markdown code blocks)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('AI returned invalid format — could not parse prompt suggestions');
  }

  const parsed = JSON.parse(jsonMatch[0]) as SuggestedPrompt[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AI returned empty suggestions');
  }

  return parsed.map(p => ({
    prompt: String(p.prompt || '').trim(),
    category: String(p.category || 'origin').trim(),
  })).filter(p => p.prompt.length > 0);
}

export async function expandApplicationResponse(
  promptText: string,
  response: string,
  campaign: CampaignContext,
): Promise<string> {
  const provider = getAIProvider();
  const prompt = buildExpandResponsePrompt(promptText, response, campaign);

  const expanded = await provider.generateText(prompt, { temperature: 0.7, maxTokens: 1024 });

  if (!expanded || expanded.length < 20) {
    throw new Error('AI returned insufficient expansion');
  }

  return expanded;
}
