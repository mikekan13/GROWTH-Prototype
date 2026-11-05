import { it } from 'vitest';
import { buildQwen21BodyPrompt } from '../app/src/ai/portraits/qwen21-workflow';
it('print', () => { console.log('PROMPT>>', buildQwen21BodyPrompt(undefined, undefined, 'Male')); });
