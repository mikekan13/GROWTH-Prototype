import { prisma } from '../src/lib/db';

async function main() {
  const desc = {
    characterName: 'Theron Ashvale',
    physicalDescription: {
      height: 'Tall',
      build: 'Lean',
      skinTone: 'Weathered tan',
      hairColor: 'Dark brown with grey streaks',
      hairStyle: 'Tied back loosely, unkempt',
      eyeColor: 'Pale green',
      ageAppearance: 'Late 40s, looks older from hard living',
      clothingStyle: 'Worn traveling coat over layered linen, mud-stained boots',
      distinguishingMarks: 'Jagged scar across left cheek, faded tattoo of a compass rose on right forearm',
      notableFeatures: 'Calloused hands, slight limp in left leg',
    },
    backstory: `Theron was once a cartographer for the Merchants Guild, mapping trade routes through the Ashvale lowlands that gave his family their name. When the Guild collapsed under accusations of smuggling, Theron lost everything — his position, his home, and his reputation.

He spent a decade wandering, taking odd jobs as a guide and occasional sellsword. The limp came from a bad fall in the Thornreach mountains three years ago. He still carries his old mapping tools, though the leather case is cracked and the ink has long dried.

He joined this campaign hoping to find purpose again — or at least a warm meal and people who do not know his name.`,
  };

  const result = await prisma.campaignMember.updateMany({
    where: { userId: 'cmnwdbkvn0000os48x6o2qulm' },
    data: { characterDesc: JSON.stringify(desc) },
  });
  console.log('Updated:', result.count, 'member(s)');

  const check = await prisma.campaignMember.findFirst({
    where: { userId: 'cmnwdbkvn0000os48x6o2qulm' },
    select: { characterDesc: true },
  });
  console.log('Stored length:', check?.characterDesc?.length);
}

main().catch(e => { console.error(e); process.exit(1); });
