import '../app/scripts/_server-only-shim';
import { seatBeingIn, insideOf } from '../app/src/services/being-inside';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3', FUSION = 'cmvcfyn460009zc48xhwl6kb8';
async function main() {
  const r = await seatBeingIn(C, K, { id: FUSION, type: 'CAMPAIGN_ITEM' }, 'gm');
  console.log('seated:', r, '| now inside:', await insideOf(K));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
