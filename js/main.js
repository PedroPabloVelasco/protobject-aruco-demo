import { state } from './state.js';
import {
  GREEN_BASE, YELLOW_TIME, ALL_RED_TIME, TICK_DECISION_MS, MIN_GREEN,
  PASS_BASE, PASS_HEADWAY
} from './constants.js';
import {
  upsertEntity, pruneStale, removeOne, clearAll, getSideArray
} from './queue.js';
import { computeScores } from './scoring.js';
import { decide } from './decision.js';
import {
  beginGreen, endGreen, scheduleOne, currentIndex, currentAnchor
} from './scheduler.js';
import {
  setLights, setBothRed, setBanner, setInfo, renderQueues, showPassing, hidePassing
} from './ui.js';

/* ============================================================
   0) Receptor temprano (evita "no callback registered")
   ============================================================ */
Protobject.Core.onReceived(()=>{});

/* ============================================================
   1) Utilidades para "tiempo máximo esperado por tipo"
   ============================================================ */
// tiempo restante para que un lado obtenga su PRÓXIMO verde (aprox conservadora)
function etaToGreen(side){
  const elapsed = (performance.now() - state.phaseStart)/1000;
  const remainingGreen = Math.max(0, (GREEN_BASE + state.extended) - elapsed);
  if (state.phase === side+'_GREEN') return 0;
  // si el otro lado está verde, necesitamos: resto de su verde + amarillo + all red
  return remainingGreen + YELLOW_TIME + ALL_RED_TIME;
}

// calcula, para cada tipo, el peor ETA (NS+EW) respetando la regla 4s + 2*i
function estimateMaxWaitByType(){
  const types = ['auto','bici','bus','ambulancia'];
  const res = {};
  for (const type of types){
    let maxEta = 0;

    for (const side of ['NS','EW']){
      const arrSide = getSideArray(side);
      const ofType = arrSide.filter(v=>v.role===type);
      if (ofType.length===0) continue;

      // último de ese tipo por orden de llegada en este lado
      const ordered = arrSide
        .filter(v=>v.role===type)
        .sort((a,b)=>a.enqueuedAt - b.enqueuedAt);
      const last = ordered[ordered.length-1];

      // cuántos de ese mismo tipo van antes que él (en este lado)
      const beforeSame = ordered.findIndex(v=>v.id===last.id);

      const base = PASS_BASE[type] ?? PASS_BASE.auto;

      if (state.phase === side+'_GREEN'){
        // si ya hay programación, úsala; si no, estima desde el índice actual
        const anchor = currentAnchor(side) ?? performance.now();
        const startIdx = Math.max(currentIndex(side), -1);  // -1 => siguiente es i=0
        const i = startIdx + 1 + beforeSame;
        const eta = last.scheduledOutAt
          ? (last.scheduledOutAt - performance.now())/1000
          : ((anchor + (base + PASS_HEADWAY*i)*1000) - performance.now())/1000;
        maxEta = Math.max(maxEta, Math.max(0, eta));
      } else {
        // lado rojo: ancla = primer instante de posible verde para ese lado
        const anchorS = performance.now() + etaToGreen(side)*1000;
        const i = beforeSame; // orden relativo en el primer verde
        const eta = (anchorS + (base + PASS_HEADWAY*i)*1000 - performance.now())/1000;
        maxEta = Math.max(maxEta, Math.max(0, eta));
      }
    }

    res[type] = Math.ceil(maxEta);
  }
  return res;
}

// pinta el "Tiempo máximo esperado por tipo (NS+EW)" en el panel
function renderWaitByType(){
  const el = document.getElementById('waitByType');
  if (!el) return;
  const r = state.stats.maxWait;
  const icon = t => t==='auto'?'🚗':(t==='bus'?'🚌':(t==='bici'?'🚲':'🚑'));
  el.innerHTML = ['auto','bici','bus','ambulancia']
    .map(t => `${icon(t)} ${t}: <b>${r[t]}s</b>`).join(' &nbsp; ');
}


/* ============================================================
   2) Recepción de payloads (eventos del móvil + ArUco)
   ============================================================ */
function handlePayload(payload){
  // a) Eventos del remoto (persisten hasta pasar/clear)
  if (payload && payload.evt){
    const { type } = payload.evt;

    if (type==='add'){
      const { id, role, dir } = payload.evt;
      const item = upsertEntity(id, role, dir, 'event');
      // si ese lado ya está verde, programamos en caliente
      if (item && state.phase === dir+'_GREEN'){ scheduleOne(dir, item); }
      renderQueues(); renderWaitByType();
      return;
    }

    if (type==='removeOne'){
      const { role, dir } = payload.evt;
      removeOne(role, dir);
      renderQueues(); renderWaitByType();
      return;
    }

    if (type==='clearAll'){
      clearAll();
      renderQueues(); renderWaitByType();
      return;
    }
  }

  // b) Compat: ArUco enriquecido (caduca si no se vuelve a ver)
  let sawPed = false;
  if (payload && payload.det){
    for (const k of Object.keys(payload.det)){
      const { role, dir } = payload.det[k];
      if (role==='peaton'){ sawPed=true; continue; }
      const rr = (role==='auto'||role==='bus'||role==='bici'||role==='ambulancia')?role:'auto';
      const dd = (dir==='NS'||dir==='EW')?dir:'NS';
      const item = upsertEntity(k, rr, dd, 'vision');
      if (item && state.phase === dd+'_GREEN'){ scheduleOne(dd, item); }
    }
  }
  if (sawPed){
    const t = performance.now();
    if (t - state.lastPedAt > 1500){ state.pedRequests++; state.lastPedAt = t; }
  }
  renderQueues(); renderWaitByType();
}
Protobject.Core.onReceived(handlePayload);

/* ============================================================
   3) Transiciones
   ============================================================ */
async function toAllRed(ms=ALL_RED_TIME*1000){
  state.token++; const my=state.token;
  state.phase='ALL_RED'; setBothRed(); setBanner('Todo rojo'); setInfo();
  await new Promise(r=>setTimeout(r,ms));
  if (my!==state.token) return;
}

async function toYellow(side){
  state.token++; const my=state.token;
  state.phase = side==='NS' ? 'YELLOW_NS' : 'YELLOW_EW';
  setLights(side,'yellow'); setBanner(`${side} Amarillo`); setInfo();
  await new Promise(r=>setTimeout(r, YELLOW_TIME*1000));
  if (my!==state.token) return;
  await toAllRed();
}

async function green(side, base=GREEN_BASE){
  state.phase = side==='NS' ? 'NS_GREEN' : 'EW_GREEN';
  setLights(side,'green'); setBanner(`${side} Verde`); setInfo();
  state.phaseStart = performance.now(); state.extended = 0;
  if (side==='NS') state.lastGreenStartNS = performance.now();
  else state.lastGreenStartEW  = performance.now();
  showPassing(side);
  beginGreen(side);               // agenda presentes + loop de pop
  renderWaitByType();             // actualiza “max wait” con el nuevo anchor
}

/* ============================================================
   4) Motor de decisión
   ============================================================ */
setInterval(()=>{
  pruneStale();
  renderQueues();

  const d = decide();

  if (d.action==='extend'){
    state.extended+=1;
    setBanner(`Extensión ${d.side} (${d.why})`);
    renderWaitByType();
    return;
  }

  if (d.action==='switch'){
    const fromSide = (state.phase==='NS_GREEN') ? 'NS' :
                     (state.phase==='EW_GREEN') ? 'EW' : null;
    if (!fromSide) return;
    (async()=>{
      endGreen(fromSide);
      await toYellow(fromSide);
      await toAllRed();
      hidePassing();
      await green(d.target, GREEN_BASE);
    })();
    return;
  }

  // Atajo: si el verde actual no tiene demanda y el opuesto sí, tras MIN_GREEN cambiamos
  const sc = computeScores();
  const elapsed = (performance.now() - state.phaseStart)/1000;
  if (state.phase==='NS_GREEN' && sc.S_NS===0 && sc.S_EW>0 && elapsed>=MIN_GREEN){
    (async()=>{ endGreen('NS'); await toYellow('NS'); await toAllRed(); hidePassing(); await green('EW', GREEN_BASE); })();
    return;
  }
  if (state.phase==='EW_GREEN' && sc.S_EW===0 && sc.S_NS>0 && elapsed>=MIN_GREEN){
    (async()=>{ endGreen('EW'); await toYellow('EW'); await toAllRed(); hidePassing(); await green('NS', GREEN_BASE); })();
    return;
  }

  // siempre refrescamos los tiempos estimados
  renderWaitByType();
}, TICK_DECISION_MS);

/* ============================================================
   5) Ciclo base anti-"deadlock"
   ============================================================ */
setInterval(async ()=>{
  const elapsed = (performance.now() - state.phaseStart)/1000;
  if (state.phase==='NS_GREEN' && elapsed >= (GREEN_BASE + state.extended)){
    endGreen('NS'); await toYellow('NS'); await toAllRed(); hidePassing(); await green('EW', GREEN_BASE);
  } else if (state.phase==='EW_GREEN' && elapsed >= (GREEN_BASE + state.extended)){
    endGreen('EW'); await toYellow('EW'); await toAllRed(); hidePassing(); await green('NS', GREEN_BASE);
  }
  renderWaitByType(); // también aquí por si alternamos
}, 300);

/* ============================================================
   6) Arranque
   ============================================================ */
(async function init(){
  await toAllRed(400);
  await green('NS', GREEN_BASE);
  renderQueues();
  renderWaitByType();
})();
