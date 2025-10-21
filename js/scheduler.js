import { state, now, updateMaxWait } from './state.js';
import { PASS_BASE, PASS_HEADWAY } from './constants.js';
import { getSideArray } from './queue.js';
import { markServed } from './queue.js';
import { renderQueues } from './ui.js';

// Contexto por lado con ancla e índice de turno
const ctx = { NS:null, EW:null };

export function beginGreen(side){
  const arr = getSideArray(side);
  // ambulancia al frente, luego FIFO
  arr.sort((a,b)=>{
    const pa=(a.role==='ambulancia')?1:0, pb=(b.role==='ambulancia')?1:0;
    return pb-pa || a.enqueuedAt - b.enqueuedAt;
  });
  ctx[side] = { anchor: now(), idx: -1 };

  // Agenda los presentes
  for (const v of arr) scheduleOne(side, v);

  // Loop para “pop” de vencidos
  startPopLoop(side);
}

export function scheduleOne(side, v){
  if (!ctx[side]) return; // solo si está en verde
  const base = PASS_BASE[v.role] ?? PASS_BASE.auto;
  const c = ctx[side];
  c.idx += 1;
  v.scheduledOutAt = c.anchor + (base + PASS_HEADWAY*c.idx)*1000;
}

export function endGreen(side){
  ctx[side] = null;
  const arr = getSideArray(side);
  for (const v of arr){ v.scheduledOutAt = null; }
}

function startPopLoop(side){
  const id = setInterval(()=>{
    if (state.phase !== side+'_GREEN'){ clearInterval(id); return; }
    const arr = getSideArray(side);
    const t = now();
    let removed = 0;
    while (arr.length && arr[0].scheduledOutAt && arr[0].scheduledOutAt <= t){
      const gone = arr.shift();

      // *** NUEVO: tiempo de espera real de este vehículo ***
      const waitSec = (t - gone.enqueuedAt) / 1000;
      updateMaxWait(gone.role, waitSec);

      markServed(gone.id);
      removed++;
    }
    if (removed>0) renderQueues();
  }, 120);
}


// util para obtener el índice del último turno asignado en el lado (si está en verde)
export function currentIndex(side){
  // ctx está dentro de este módulo; lo exponemos de forma segura
  // @ts-ignore
  return (typeof ctx !== 'undefined' && ctx[side]) ? ctx[side].idx : -1;
}
// util para obtener el anchor si está en verde
export function currentAnchor(side){
  // @ts-ignore
  return (typeof ctx !== 'undefined' && ctx[side]) ? ctx[side].anchor : null;
}
