// Copilot types — campaign AI assistant

export interface CopilotAction {
  id: string;
  type: 'create_forge_item' | 'create_location' | 'create_campaign_item' | 'update_character';
  description: string;
  params: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface CopilotContext {
  campaignSummary: string;
  /** Complete present knowledge of every character at the table (Mike
   *  2026-07-11): attributes, conditions, ALL trait effect text, equipment.
   *  Always included — effect-bearing content must be PUSHED, never left
   *  to mention-matching or tool calls JEWL might not think to make. */
  tableState: string;
  retrievedData: string;
  rulesContext: string;
}

export interface CopilotResponse {
  message: string;
  actions: CopilotAction[];
}

export interface EntityIndex {
  characters: { id: string; name: string }[];
  forgeItems: { id: string; name: string; type: string }[];
  locations: { id: string; name: string; type: string }[];
  campaignItems: { id: string; name: string; type: string }[];
  members: { username: string }[];
}
