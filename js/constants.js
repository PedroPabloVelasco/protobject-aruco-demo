export const W = { auto:1.0, bici:0.5, bus:6.0, peaton:3.0, ambulancia:1000 };

export const GREEN_BASE = 8;
export const YELLOW_TIME = 2;
export const ALL_RED_TIME = 1;
export const MIN_GREEN = 2;
export const MAX_EXTEND = 12;
export const MAX_CONTINUOUS = 40;
export const MAX_WAIT = 45;
export const DELTA_EXTEND = 2;
export const DELTA_SWITCH = 3;
export const ARUCO_REGISTER_MS = 1000;

export const PERSIST_MS = 2000;
export const TICK_DECISION_MS = 500;

// Regla de paso: base + 2*i
export const PASS_BASE = { auto:3, bici:3, bus:3, ambulancia:3 };
export const PASS_HEADWAY = 2;
