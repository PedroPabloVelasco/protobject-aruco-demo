import { state, now, s2 } from './state.js';

const nsR=document.getElementById('ns-r'), nsY=document.getElementById('ns-y'), nsG=document.getElementById('ns-g');
const ewR=document.getElementById('ew-r'), ewY=document.getElementById('ew-y'), ewG=document.getElementById('ew-g');
const banner=document.getElementById('banner'), info=document.getElementById('info');
const qNS=document.getElementById('queue-ns'), qEW=document.getElementById('queue-ew');
const passingBox=document.getElementById('passing'); const passDir=passingBox.querySelector('.dir');

export function setLights(side,color){
  const set=(r,y,g)=>{ r.classList.toggle('on',color==='red'); y.classList.toggle('on',color==='yellow'); g.classList.toggle('on',color==='green'); };
  if (side==='NS') set(nsR,nsY,nsG); else set(ewR,ewY,ewG);
}
export function setBothRed(){ nsR.classList.add('on');nsY.classList.remove('on');nsG.classList.remove('on'); ewR.classList.add('on');ewY.classList.remove('on');ewG.classList.remove('on'); }
export function setBanner(txt){ banner.textContent=txt; }
export function setInfo(){ info.textContent=`Fase: ${state.phase}`; }
export function showPassing(side){ passDir.textContent=side; passingBox.classList.add('show'); }
export function hidePassing(){ passingBox.classList.remove('show'); }

export function renderQueues(){
  const icon=r=>r==='auto'?'🚗':(r==='bus'?'🚌':(r==='bici'?'🚲':'🚑'));
  const render=arr=>arr.map(v=>{
    const wait=Math.max(0, s2(now()-v.enqueuedAt)).toFixed(0)+'s';
    return `<div class="q-item"><span class="q-icon">${icon(v.role)}</span>${v.role}&nbsp;&nbsp;⏱ ${wait}</div>`;
  }).join('') || '<div class="q-item" style="opacity:.7">Sin cola</div>';

  qNS.innerHTML = render(state.NS);
  qEW.innerHTML = render(state.EW);
}
