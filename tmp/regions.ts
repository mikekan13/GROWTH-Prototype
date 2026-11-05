import { prisma } from '../app/src/lib/db';
import { regionKeys } from '../app/src/services/genesis-possessions';
(async () => { const c = await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } }); console.log(regionKeys(JSON.parse(c.data)).join(' | ')); process.exit(0); })();
