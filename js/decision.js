import { state, s2, now, phaseElapsed } from './state.js';
import { computeScores } from './scoring.js';
import { DELTA_EXTEND, DELTA_SWITCH, MIN_GREEN, MAX_EXTEND, MAX_CONTINUOUS, MAX_WAIT } from './constants.js';

export function decide(){
  const sc = computeScores();
  const dS = sc.S_NS - sc.S_EW;
  const e = phaseElapsed();

  const ambNS = sc.NS.amb>0, ambEW = sc.EW.amb>0;
  if (ambNS || ambEW){
    const target = ambNS ? 'NS' : 'EW';
    if (state.phase === target+'_GREEN'){
      if (state.extended < MAX_EXTEND) return {action:'extend', side:target, why:'Ambulancia'};
      return {action:'keep'};
    }
    if ((state.phase==='NS_GREEN' || state.phase==='EW_GREEN') && e>=MIN_GREEN){
      return {action:'switch', target, why:'Ambulancia'};
    }
    return {action:'keep'};
  }

  if (state.phase==='NS_GREEN' && dS>=DELTA_EXTEND && state.extended<MAX_EXTEND) return {action:'extend', side:'NS', why:'Cola'};
  if (state.phase==='EW_GREEN' && -dS>=DELTA_EXTEND && state.extended<MAX_EXTEND) return {action:'extend', side:'EW', why:'Cola'};

  if ((state.phase==='NS_GREEN' || state.phase==='EW_GREEN') && e>=MIN_GREEN){
    if (dS>=DELTA_SWITCH && state.phase!=='NS_GREEN') return {action:'switch', target:'NS', why:'Ventaja NS'};
    if (-dS>=DELTA_SWITCH && state.phase!=='EW_GREEN') return {action:'switch', target:'EW', why:'Ventaja EW'};
  }

  const waitNS = s2(now() - state.lastGreenStartNS);
  const waitEW = s2(now() - state.lastGreenStartEW);
  if (state.phase==='NS_GREEN' && e>=MAX_CONTINUOUS) return {action:'switch', target:'EW', why:'Max continuous'};
  if (state.phase==='EW_GREEN' && e>=MAX_CONTINUOUS) return {action:'switch', target:'NS', why:'Max continuous'};
  if (state.phase==='NS_GREEN' && waitEW>=MAX_WAIT && e>=MIN_GREEN) return {action:'switch', target:'EW', why:'Max wait EW'};
  if (state.phase==='EW_GREEN' && waitNS>=MAX_WAIT && e>=MIN_GREEN) return {action:'switch', target:'NS', why:'Max wait NS'};

  return {action:'keep'};
}
