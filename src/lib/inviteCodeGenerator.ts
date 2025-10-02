/**
 * GM Invite Code Generator
 * Generates secure, industry-standard invite codes for GM account creation
 * Format: GM-XXXX-XXXX-XXXX (e.g., GM-K7M2-P9N4-Q5R8)
 */

import { customAlphabet } from 'nanoid';

// Custom alphabet excluding ambiguous characters (0, O, I, l, 1)
// Using uppercase letters and numbers for readability
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// Generate segments with nanoid for cryptographic security
const generateSegment = customAlphabet(ALPHABET, 4);

/**
 * Generates a GM invite code with format: GM-XXXX-XXXX-XXXX
 * Uses nanoid for cryptographically secure random generation
 */
export function generateGMInviteCode(): string {
  const segment1 = generateSegment();
  const segment2 = generateSegment();
  const segment3 = generateSegment();

  return `GM-${segment1}-${segment2}-${segment3}`;
}

/**
 * Validates the format of a GM invite code
 */
export function isValidGMInviteCodeFormat(code: string): boolean {
  const pattern = /^GM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;
  return pattern.test(code);
}

/**
 * Formats a code for display (adds dashes if missing)
 */
export function formatInviteCode(code: string): string {
  // Remove any existing dashes and spaces
  const cleaned = code.replace(/[-\s]/g, '').toUpperCase();

  // Check if it starts with GM
  if (!cleaned.startsWith('GM')) {
    throw new Error('Invalid invite code format');
  }

  // Extract the characters after GM
  const chars = cleaned.substring(2);

  if (chars.length !== 12) {
    throw new Error('Invalid invite code length');
  }

  // Format as GM-XXXX-XXXX-XXXX
  return `GM-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Generates multiple GM invite codes
 */
export function generateGMInviteCodes(count: number): string[] {
  const codes: string[] = [];
  const uniqueCodes = new Set<string>();

  while (uniqueCodes.size < count) {
    const code = generateGMInviteCode();
    if (!uniqueCodes.has(code)) {
      uniqueCodes.add(code);
      codes.push(code);
    }
  }

  return codes;
}
