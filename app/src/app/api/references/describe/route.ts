import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCampaignAISettings, resolveProvider } from '@/ai/campaign-ai';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_API_URL = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com';
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

/**
 * POST /api/references/describe
 * Analyze a reference photo with AI to generate physical descriptions.
 * Uses campaign AI settings to pick local (Ollama vision) or cloud (Claude).
 *
 * Body: { imagePath: string, bodyParts: string[], seedName?: string, campaignId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const { imagePath, imagePaths, bodyParts, seedName, campaignId } = await request.json();

    // Support single image or multiple
    const allPaths: string[] = imagePaths || (imagePath ? [imagePath] : []);
    if (allPaths.length === 0) {
      return NextResponse.json({ error: 'imagePath or imagePaths is required' }, { status: 400 });
    }

    // Read and resize all images to fit Claude's 5MB limit
    const MAX_BYTES = 4_000_000; // 4MB target (leaves room for base64 overhead)
    const MAX_DIMENSION = 2048;
    const images: Array<{ base64: string; mediaType: string }> = [];
    for (const imgPath of allPaths) {
      const fullPath = path.join(process.cwd(), 'public', imgPath.replace(/^\//, ''));
      let imageBuffer: Buffer = Buffer.from(await fs.readFile(fullPath));

      // Resize if too large
      if (imageBuffer.length > MAX_BYTES) {
        imageBuffer = Buffer.from(await sharp(imageBuffer)
          .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer());
      }

      // If still too large after resize, compress harder
      if (imageBuffer.length > MAX_BYTES) {
        imageBuffer = Buffer.from(await sharp(imageBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer());
      }

      const mediaType = 'image/jpeg'; // Always JPEG after potential resize
      images.push({ base64: imageBuffer.toString('base64'), mediaType });
    }

    const prompt = buildDescribePrompt(bodyParts, seedName);

    // Resolve provider from campaign settings
    let providerChoice: 'local' | 'cloud' = 'cloud';
    let localVisionModel = 'llava';
    if (campaignId) {
      const settings = await getCampaignAISettings(campaignId);
      providerChoice = resolveProvider(settings, 'referenceDescription');
      localVisionModel = settings.localVisionModel || 'llava';
    }

    let textContent: string;

    if (providerChoice === 'local') {
      // Local only supports single image
      textContent = await describeWithOllama(images[0].base64, prompt, localVisionModel);
    } else {
      if (!CLAUDE_API_KEY) {
        return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
      }
      textContent = await describeWithClaude(images, prompt);
    }

    // Parse the JSON response
    let parsed: Record<string, unknown>;
    try {
      const cleaned = textContent.replace(/^```json?\s*/m, '').replace(/\s*```$/m, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: textContent }, { status: 500 });
    }

    return NextResponse.json({ descriptions: parsed, provider: providerChoice });
  } catch (error) {
    console.error('[Describe] Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Prompt Builder ───────────────────────────────────────────────────────

function buildDescribePrompt(bodyParts?: string[], seedName?: string): string {
  const bodyPartsList = (bodyParts || [
    'HEAD', 'TORSO',
    'LEFT_UPPER_ARM', 'LEFT_LOWER_ARM',
    'RIGHT_UPPER_ARM', 'RIGHT_LOWER_ARM',
    'LEFT_UPPER_LEG', 'LEFT_LOWER_LEG',
    'RIGHT_UPPER_LEG', 'RIGHT_LOWER_LEG',
  ]).map((p: string) => p.replace(/_/g, ' ').toLowerCase());

  return `You are analyzing a reference photo to describe a person's PHYSICAL BODY for a tabletop RPG character (seed: ${seedName || 'unknown'}).

CRITICAL RULES:
- Describe ONLY the person's physical body — skin, muscles, bone structure, hair, eyes, scars, tattoos, birthmarks.
- COMPLETELY IGNORE all clothing, jewelry, accessories, armor, hats, glasses. Describe the body UNDERNEATH as if they were unclothed.
- You MUST determine gender (Male, Female, or Non-binary) from physical features.
- You MUST determine build and skin tone.
- Look carefully at eye color — examine the iris closely, not reflections or lighting artifacts. If multiple photos are provided, cross-reference them for the most accurate reading.
- For hair color, describe the NATURAL base color (e.g. "dark brown", "auburn", "black with reddish undertones"), not lighting-affected highlights.
- For hair texture, identify the NATURAL texture (straight, wavy, curly, etc.) by looking at loose strands — don't confuse styling (braids, updos) with natural texture.
- For hair style, describe exactly how the hair is worn — include braids, accessories (feathers, beads, ornaments), partings, and any distinctive styling across ALL photos.

Return a JSON object with these exact keys:

"overall": {
  "gender": "Male" or "Female" or "Non-binary",
  "build": one of ["Slight", "Slim", "Lean", "Average", "Athletic", "Stocky", "Muscular", "Heavy", "Large"],
  "skinTone": a specific natural term (e.g. "Fair", "Olive", "Medium", "Caramel", "Deep Brown")
}

"HEAD": {
  "faceShape": one of ["Oval", "Round", "Square", "Heart", "Long", "Diamond", "Angular"],
  "eyeShape": one of ["Almond", "Round", "Hooded", "Downturned", "Upturned", "Wide-set", "Deep-set", "Narrow"],
  "eyeColor": exact iris color (e.g. "dark brown", "hazel", "blue-grey"),
  "facialHair": description or "None",
  "hairColor": natural base color,
  "hairLength": one of ["Bald", "Buzzed", "Short", "Ear-length", "Chin-length", "Shoulder-length", "Mid-back", "Waist-length", "Hip-length", "Knee-length", "Floor-length"],
  "hairTexture": the NATURAL texture of the hair itself — one of ["Straight", "Wavy", "Curly", "Coily", "Kinky", "Wiry", "Fine", "Thick"]. Look at loose strands or the wave pattern, not how it's styled. Braided hair can still be wavy or curly underneath.
  "hairStyle": how the hair is actually worn/styled in the photos — be specific about styling details. Include braids, ponytails, updos, accessories (feathers, beads, clips, ribbons), partings, bangs. Example: "loose braids with feather ornament" or "half-up with side braids". Look at ALL provided photos for the most complete picture.
  "cosmetics": any visible makeup, war paint, face paint, or "None",
  "hygiene": one of ["Pristine", "Well-kept", "Average", "Rugged", "Rough", "Unkempt", "Feral"],
  "description": other notable features (scars, moles, piercings, bone structure — NOT clothing/accessories)
}

For each body part (${bodyPartsList.join(', ')}):
{ "description": physical body description only — musculature, skin texture, scars, tattoos, birthmarks, body hair. NO clothing. 1-2 sentences. }

If a body part is hidden by clothing, infer from overall build. Never mention what they are wearing.

Return ONLY valid JSON, no markdown. Keys: UPPERCASE body part names (HEAD, TORSO, LEFT_UPPER_ARM, etc.) plus "overall".`;
}

// ── Claude (Cloud) ───────────────────────────────────────────────────────

async function describeWithClaude(images: Array<{ base64: string; mediaType: string }>, prompt: string): Promise<string> {
  // Build content array: all images first, then the text prompt
  const content: Array<Record<string, unknown>> = [];
  for (const img of images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
  }
  content.push({ type: 'text', text: images.length > 1
    ? `You have ${images.length} reference photos of the SAME person from different angles. Cross-reference all photos to determine accurate features.\n\n${prompt}`
    : prompt });

  const response = await fetch(`${CLAUDE_API_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(90_000), // More time for multiple images
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text?: string }> };
  return data.content.filter(b => b.type === 'text').map(b => b.text || '').join('');
}

// ── Ollama (Local) ───────────────────────────────────────────────────────

async function describeWithOllama(base64: string, prompt: string, model: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [base64],
      stream: false,
      options: { temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(120_000), // Local models can be slower
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Ollama error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { response: string };
  return data.response;
}
