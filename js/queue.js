import { state, now } from './state.js';

// Anti-resurrección de IDs recién servidos
const servedBlock = new Map(); // id -> expireMs
const SERVED_TTL = 2500;       // ms

export function getSideArray(side){ return side==='EW' ? state.EW : state.NS; }

// source: 'event' (persiste) | 'vision' (caduca si no se ve)
export function upsertEntity(id, role, dir, source='vision'){
  const t = now();
  const exp = servedBlock.get(id);
  if (exp && t < exp) return null;

  const arr = getSideArray(dir);
  const found = arr.find(x=>x.id===id);
  if (found){
    found.role=role; found.lastSeen=t; found.source=source;
    return found;
  }
  const item = { id, role, dir, enqueuedAt:t, lastSeen:t, scheduledOutAt:null, source };
  arr.push(item);
  return item;
}

export function removeOne(role, dir){
  const arr = getSideArray(dir);
  const i = arr.findIndex(v=>v.role===role);
  if (i>=0) arr.splice(i,1);
}

export function clearAll(){ state.NS.length=0; state.EW.length=0; }

export function markServed(id){
  servedBlock.set(id, now()+SERVED_TTL);
}
