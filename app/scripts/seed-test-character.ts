/**
 * Seed a test character with full data for canvas testing.
 * Run: npx tsx scripts/seed-test-character.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import path from 'path';

const dbPath = path.join(process.cwd(), 'dev.db');
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const SAMPLE_CHARACTER_DATA = {
  identity: { name: 'Kael Ashenmire' },
  tkv: 247,
  levels: {
    wealthLevel: 6,
    techLevel: 5,
    healthLevel: 7,
  },
  attributes: {
    clout: { level: 14, current: 12, augmentPositive: 2, augmentNegative: 0 },
    celerity: { level: 18, current: 18, augmentPositive: 0, augmentNegative: 0 },
    constitution: { level: 10, current: 7, augmentPositive: 1, augmentNegative: 1 },
    flow: { level: 16, current: 14, augmentPositive: 2, augmentNegative: 0 },
    frequency: { level: 20, current: 4 },
    focus: { level: 15, current: 15, augmentPositive: 0, augmentNegative: 0 },
    willpower: { level: 20, current: 20, augmentPositive: 0, augmentNegative: 0 },
    wisdom: { level: 12, current: 8, augmentPositive: 1, augmentNegative: 0 },
    wit: { level: 16, current: 16, augmentPositive: 0, augmentNegative: 0 },
  },
  conditions: {
    weak: false,
    clumsy: false,
    exhausted: false,
    deafened: false,
    deathsDoor: false,
    muted: false,
    overwhelmed: false,
    confused: false,
    incoherent: false,
  },
  creation: {
    seed: { name: 'Cambion', baseFateDie: 'd20' },
    root: { name: 'Street Apothecary' },
  },
  possessions: 'Manor House\nWar Horse\nSmall Retinue\nTrade License\nFamily Heirloom\nAlchemist Workshop',
  grovines: [
    { goal: 'Overthrow the tyrant', opportunity: 'Rally the common folk', kv: 10 },
    { goal: 'Master fire magic', opportunity: 'Find ancient tome', kv: 25 },
    { goal: 'Become legendary', opportunity: 'Win the tournament', kv: 15 },
    { goal: 'Find my family', opportunity: 'Meet the oracle', kv: 20 },
  ],
  age: '34',
  birthday: '03/15/2012',
  inventory: [
    {
      id: 'inv-1',
      name: 'Flame Sword of Destiny',
      type: 'weapon',
      quantity: 1,
      equipped: true,
      description: 'A blade forged in dragon fire, granting swift strikes to its wielder.',
      properties: ['Fire Damage', '+2 Speed', 'Legendary'],
      value: 5000,
      weight: 4,
      rarity: 'legendary',
    },
    {
      id: 'inv-2',
      name: 'Amulet of the Arcane',
      type: 'accessory',
      quantity: 1,
      equipped: true,
      description: 'An ancient amulet pulsing with magical energy, enhancing spell casting speed.',
      properties: ['Magic Power +15%', 'Mana Regen +5'],
      value: 3200,
      weight: 0.5,
      rarity: 'rare',
    },
    {
      id: 'inv-3',
      name: 'Mithril Chain Shirt',
      type: 'armor',
      quantity: 1,
      equipped: true,
      description: 'Lightweight chainmail woven from mithril links.',
      properties: ['Light Armor', 'No Stealth Penalty'],
      value: 2500,
      weight: 8,
      rarity: 'very rare',
    },
    {
      id: 'inv-4',
      name: 'Apothecary Kit',
      type: 'tool',
      quantity: 1,
      equipped: false,
      description: 'A full kit of herbs, vials, and alchemical tools.',
      properties: ['Herbalism', 'Poison Craft'],
      value: 150,
      weight: 3,
      rarity: 'uncommon',
    },
    {
      id: 'inv-5',
      name: 'Health Potion',
      type: 'consumable',
      quantity: 5,
      equipped: false,
      description: 'Restores 2d4+2 HP when consumed.',
      value: 50,
      weight: 0.5,
      rarity: 'common',
    },
    {
      id: 'inv-6',
      name: 'Ring of the Learned',
      type: 'accessory',
      quantity: 1,
      equipped: true,
      description: 'A simple ring worn by ancient scholars, sharpening the mind.',
      properties: ['Intelligence +1', 'Perfect Recall'],
      value: 1800,
      weight: 0.1,
      rarity: 'uncommon',
    },
    {
      id: 'inv-7',
      name: 'Dried Starbloom',
      type: 'consumable',
      quantity: 12,
      equipped: false,
      description: 'Rare alchemical ingredient. Glows faintly under moonlight.',
      value: 25,
      weight: 0.1,
      rarity: 'rare',
    },
    {
      id: 'inv-8',
      name: 'Bedroll & Travel Gear',
      type: 'misc',
      quantity: 1,
      equipped: false,
      description: 'Standard adventuring supplies.',
      value: 10,
      weight: 5,
      rarity: 'common',
    },
  ],
};

async function main() {
  // Find first campaign
  const campaign = await prisma.campaign.findFirst({
    include: { characters: true },
  });

  if (!campaign) {
    console.log('No campaigns found. Create one first via the app.');
    process.exit(1);
  }

  console.log(`Found campaign: ${campaign.name} (${campaign.id})`);

  if (campaign.characters.length > 0) {
    // Update first character with sample data
    const char = campaign.characters[0];
    await prisma.character.update({
      where: { id: char.id },
      data: {
        name: 'Kael Ashenmire',
        data: JSON.stringify(SAMPLE_CHARACTER_DATA),
      },
    });
    console.log(`Updated character "${char.name}" -> "Kael Ashenmire" with full sample data`);
  } else {
    // Create a new character
    const gmUser = await prisma.user.findFirst();
    if (!gmUser) {
      console.log('No users found.');
      process.exit(1);
    }

    await prisma.character.create({
      data: {
        name: 'Kael Ashenmire',
        campaignId: campaign.id,
        userId: gmUser.id,
        data: JSON.stringify(SAMPLE_CHARACTER_DATA),
        status: 'ACTIVE',
      },
    });
    console.log('Created character "Kael Ashenmire" with full sample data');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
