import { getSheetsService } from "./google";

export async function writeCharacterDataToSheet(spreadsheetId: string, characterData: Record<string, unknown>): Promise<void> {
  console.log(`📝 Writing character data to sheet ${spreadsheetId}`);
  
  try {
    const sheets = await getSheetsService();
    
    // For now, we'll write basic character information
    // This can be expanded to write all the named ranges
    const updates: Array<{ range: string; values: unknown[][] }> = [];
    
    if ((characterData.identity as { name?: string })?.name) {
      // Update CharacterName named range
      updates.push({
        range: 'CharacterName',
        values: [[(characterData.identity as { name?: string }).name]]
      });
    }
    
    // Add attribute updates
    if (characterData.attributes) {
      for (const [attrName, attrData] of Object.entries(characterData.attributes as Record<string, unknown>)) {
        if (attrData && typeof attrData === 'object') {
          // Write current values
          if (typeof (attrData as { current?: number }).current === 'number') {
            updates.push({
              range: `current${attrName.charAt(0).toUpperCase() + attrName.slice(1)}`,
              values: [[(attrData as { current?: number }).current]]
            });
          }
          
          // Write levels
          if (typeof (attrData as { level?: number }).level === 'number') {
            updates.push({
              range: `${attrName.charAt(0).toUpperCase() + attrName.slice(1)}Level`,
              values: [[(attrData as { level?: number }).level]]
            });
          }
          
          // Write augments
          if (typeof (attrData as { augment?: number }).augment === 'number') {
            updates.push({
              range: `${attrName.charAt(0).toUpperCase() + attrName.slice(1)}Augment`,
              values: [[(attrData as { augment?: number }).augment]]
            });
          }
          
          // Write positive/negative augments if they exist
          if (typeof (attrData as { augmentPositive?: number }).augmentPositive === 'number') {
            updates.push({
              range: `${attrName.charAt(0).toUpperCase() + attrName.slice(1)}AugmentPositive`,
              values: [[(attrData as { augmentPositive?: number }).augmentPositive]]
            });
          }
          
          if (typeof (attrData as { augmentNegative?: number }).augmentNegative === 'number') {
            updates.push({
              range: `${attrName.charAt(0).toUpperCase() + attrName.slice(1)}AugmentNegative`,
              values: [[(attrData as { augmentNegative?: number }).augmentNegative]]
            });
          }
        }
      }
    }
    
    // Write character image if it exists
    if ((characterData.identity as { image?: string })?.image) {
      updates.push({
        range: 'CharacterImage',
        values: [[(characterData.identity as { image?: string }).image]]
      });
    }
    
    if (updates.length === 0) {
      console.log(`ℹ️  No data to write to sheet ${spreadsheetId}`);
      return;
    }
    
    // Batch update all the values
    console.log(`📊 Writing ${updates.length} updates to sheet`);
    
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates
      }
    });
    
    console.log(`✅ Successfully wrote character data to sheet ${spreadsheetId}`);
    
  } catch (error) {
    console.error(`❌ Failed to write character data to sheet ${spreadsheetId}:`, error);
    throw error;
  }
}