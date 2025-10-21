export const now = ()=>performance.now();
export const s2  = (ms)=>Math.max(0, ms/1000);

export const state = {
  phase: 'ALL_RED',
  token: 0,
  phaseStart: performance.now(),
  lastGreenStartNS: performance.now(),
  lastGreenStartEW: performance.now(),
  extended: 0,
  NS: [], // [{id,role,dir,enqueuedAt,lastSeen,scheduledOutAt,source}]
  EW: [],
  pedRequests: 0,
  lastPedAt: 0,
  stats: {
    maxWait: { auto:0, bici:0, bus:0, ambulancia:0 }
  },

};

export function phaseElapsed(){ return s2(now()-state.phaseStart); }
export function waitSince(sideStart){ return s2(now()-sideStart); }

export function updateMaxWait(role, seconds){
  const r = (role in state.stats.maxWait) ? role : 'auto';
  const s = Math.ceil(Math.max(0, seconds));
  state.stats.maxWait[r] = Math.max(state.stats.maxWait[r], s);
}
