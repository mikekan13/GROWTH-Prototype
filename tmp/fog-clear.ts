import { prisma } from '@/lib/db';
prisma.lastKnown.deleteMany({}).then(r => { console.log('cleared', r.count); process.exit(0); });
