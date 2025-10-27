import { state } from './state.js';
import { GREEN_BASE, YELLOW_TIME, ALL_RED_TIME, TICK_DECISION_MS, MIN_GREEN, ARUCO_REGISTER_MS } from './constants.js';
import { upsertEntity, removeOne, clearAll } from './queue.js';
import { computeScores } from './scoring.js';
import { decide } from './decision.js';
import { beginGreen, endGreen, scheduleOne } from './scheduler.js';
import { setLights, setBothRed, setBanner, setInfo, renderQueues, showPassing, hidePassing } from './ui.js';


// Store para rastrear el tiempo de detección de ArUcos
const arucoDetectionStore = new Map(); // K: id, V: { firstSeen: number, registered: boolean }

// UID para asegurar que cada auto de ArUco sea único
let arucoUid = 0;
// Timestamp del último payload de ArUco recibido
let lastArucoPayloadAt = 0;


// Receptor temprano (evita "no callback registered")
Protobject.Core.onReceived(()=>{});

// Utilidades para "tiempo máximo esperado por tipo"

// tiempo restante para que un lado obtenga su PRÓXIMO verde (aprox conservadora)
function etaToGreen(side){
  const elapsed = (performance.now() - state.phaseStart)/1000;
  const remainingGreen = Math.max(0, (GREEN_BASE + state.extended) - elapsed);
  if (state.phase === side+'_GREEN') return 0;
  // si el otro lado está verde, necesitamos: resto de su verde + amarillo + all red
  return remainingGreen + YELLOW_TIME + ALL_RED_TIME;
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

// Recepción de payloads (eventos del móvil + ArUco)
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

  // b) Detección ArUco (con umbral de 3 segundos)
  let sawPed = false;
  const now = performance.now();
  const currentPayloadIds = new Set(); // IDs vistos en *este* payload

  // Usamos 'typeof' para chequear si 'det' existe (incluso si es un objeto vacío {})
  if (payload && typeof payload.det !== 'undefined') {
      // Actualizamos el timestamp del último payload de ArUco
      lastArucoPayloadAt = now; 
      
      // 1. Procesar IDs actualmente visibles
      for (const k of Object.keys(payload.det)) {
          currentPayloadIds.add(k);
          const { role, dir } = payload.det[k];

          if (role === 'peaton') { sawPed = true; continue; }

          let entry = arucoDetectionStore.get(k);

          if (!entry) {
              // NUEVA DETECCIÓN
              // Es la primera vez que vemos este ID. Lo anotamos.
              arucoDetectionStore.set(k, { firstSeen: now, registered: false });
          } else if (!entry.registered) {
              // DETECCIÓN CONTINUA (AÚN NO REGISTRADO)
              // Ya lo estamos viendo. Chequear si cumple el tiempo.
              const duration = now - entry.firstSeen;
              
              if (duration >= ARUCO_REGISTER_MS) {
                  // UMBRAL CUMPLIDO (3+ segundos)
                  console.log(`[Aruco Main] Registrando ${k} (visto por ${duration}ms)`);

                  // Definir rol y dirección
                  const rr = (role === 'auto' || role === 'bus' || role === 'bici' || role === 'ambulancia') ? role : 'auto';
                  const dd = (dir === 'NS' || dir === 'EW') ? dir : 'NS';

                  // Generar ID ÚNICO (como el remote)
                  const uniqueId = `aruco-${rr}-${dd}-${Date.now()}-${++arucoUid}`;
                  // Añadirlo como 'event' para que sea persistente
                  const item = upsertEntity(uniqueId, rr, dd, 'event'); 
                  
                  // Agendarlo si el semáforo ya está en verde
                  if (item && state.phase === dd + '_GREEN') {
                      scheduleOne(dd, item);
                  }

                  // Marcar como registrado para no volver a añadirlo en *esta* aparición
                  entry.registered = true;
              }
          }
          // else: (entry.registered === true) -> Ya lo vimos y registramos, no hacer nada.
      }
  
      // 2. Limpiar IDs que ya no están visibles (mientras AÚN recibimos payloads)
      // Si un ID (ej. 'NS-100') estaba en el store pero no vino en este payload,
      // significa que desapareció.
      for (const k of Array.from(arucoDetectionStore.keys())) {
          if (!currentPayloadIds.has(k)) {
              console.log(`[Aruco Main] ${k} desapareció. Reseteando.`);
              arucoDetectionStore.delete(k);
          }
      }
  } // Fin de if (payload.det)

  if (sawPed){
    const t = performance.now();
    if (t - state.lastPedAt > 1500){ state.pedRequests++; state.lastPedAt = t; }
  }
  renderQueues(); renderWaitByType();
}

Protobject.Core.onReceived(handlePayload);

// Transiciones

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

// Motor de decisión

setInterval(()=>{
  renderQueues();

  const now = performance.now();
  // Si han pasado más de 1s sin NINGÚN payload de ArUco, asumimos que
  // la cámara se apagó o los marcadores se fueron.
  // Usamos 1000ms (un valor seguro, mayor al PERSIST_MS de 500ms de aruco_ns)
  if (lastArucoPayloadAt > 0 && (now - lastArucoPayloadAt > 1000)) { 
      if (arucoDetectionStore.size > 0) {
          // Si el store no está vacío, lo limpiamos.
          console.log("[Aruco Main] Payload de ArUco caducado (Timeout). Limpiando store.");
          arucoDetectionStore.clear();
      }
      // Reseteamos el timestamp para que no se limpie en bucle
      lastArucoPayloadAt = 0; 
  }

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

// Ciclo base anti-"deadlock"

setInterval(async ()=>{
  const elapsed = (performance.now() - state.phaseStart)/1000;
  if (state.phase==='NS_GREEN' && elapsed >= (GREEN_BASE + state.extended)){
    endGreen('NS'); await toYellow('NS'); await toAllRed(); hidePassing(); await green('EW', GREEN_BASE);
  } else if (state.phase==='EW_GREEN' && elapsed >= (GREEN_BASE + state.extended)){
    endGreen('EW'); await toYellow('EW'); await toAllRed(); hidePassing(); await green('NS', GREEN_BASE);
  }
  renderWaitByType(); // también aquí por si alternamos
}, 300);

// Arranque
(async function init(){
  await toAllRed(400);
  await green('NS', GREEN_BASE);
  renderQueues();
  renderWaitByType();
})();
