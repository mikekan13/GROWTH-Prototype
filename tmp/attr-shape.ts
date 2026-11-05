import { prisma } from '../app/src/lib/db';
(async () => { const d = JSON.parse((await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } })).data); console.log(JSON.stringify(d.attributes.clout), JSON.stringify(d.attributes.frequency)); process.exit(0); })();
