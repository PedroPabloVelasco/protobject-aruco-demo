import { W } from './constants.js';
import { state } from './state.js';

export function computeScores(){
  const count = (arr, role)=>arr.filter(v=>v.role===role).length;
  const NS = { car:count(state.NS,'auto'), bike:count(state.NS,'bici'), bus:count(state.NS,'bus'), ped:state.pedRequests, amb:count(state.NS,'ambulancia') };
  const EW = { car:count(state.EW,'auto'), bike:count(state.EW,'bici'), bus:count(state.EW,'bus'), ped:state.pedRequests, amb:count(state.EW,'ambulancia') };

  const S_NS = W.auto*NS.car + W.bici*NS.bike + W.bus*NS.bus + W.peaton*NS.ped + W.ambulancia*NS.amb;
  const S_EW = W.auto*EW.car + W.bici*EW.bike + W.bus*EW.bus + W.peaton*EW.ped + W.ambulancia*EW.amb;
  return { S_NS, S_EW, NS, EW };
}
