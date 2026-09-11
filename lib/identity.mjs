import {createHash} from 'node:crypto';
export function gameId(value) {
  const id=String(value??'').trim().toLowerCase();
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw Error('Invalid saved match ID.');
  return id;
}
export function stableId(value) {
  const h=createHash('sha256').update(value).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
