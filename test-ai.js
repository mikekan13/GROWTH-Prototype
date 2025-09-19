import { createAIService } from './lib/ai-service.js';

async function testAI() {
  console.log('🤖 Testing AI Service with Ollama...');
  
  const ai = createAIService('development');
  
  try {
    console.log('📝 Generating test NPC...');
    const npc = await ai.generateNPC({
      location: 'tavern',
      situation: 'party needs information'
    });
    
    console.log('✅ Generated NPC:', JSON.stringify(npc, null, 2));
    
  } catch (error) {
    console.error('❌ AI Test failed:', error);
  }
}

testAI();