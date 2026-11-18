/* IGNIS: seleção múltipla compartilhada, sem alteração de dados */
(function(){
'use strict';
const filters=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const copy=s=>s===null?null:new Set(s);
function label(f){
  const s=f.applied;
  if(s===null||!s.size||s.size===f.options.length)return f.allLabel;
  if(s.size===1)return f.options.find(o=>s.has(o.value))?.label||f.allLabel;
  return s.size+' '+f.countLabel;
}
function define(key,cfg){
  if(!/^[a-zA-Z0-9_-]+$/.test(key))throw Error('Filtro inválido');
  let f=filters.get(key);
  const options=(cfg.options||[]).map(x=>Array.isArray(x)?{value:String(x[0]),label:String(x[1])}:{value:String(x.value),label:String(x.label)});
  if(!f){
    const initial=Array.isArray(cfg.initial)&&cfg.initial.length?new Set(cfg.initial.map(String)):null;
    f={key,applied:initial,draft:copy(initial),open:false};filters.set(key,f);
  }
  f.options=options;f.caption=cfg.caption;f.title=cfg.title||cfg.caption;
  f.subtitle=cfg.subtitle||'Selecione uma ou mais opções';
  f.allLabel=cfg.allLabel||'Todas as opções';f.countLabel=cfg.countLabel||'selecionados';
  f.placeholder=cfg.placeholder||'Buscar';f.icon=cfg.icon||'';
  f.className=cfg.className||'';f.onApply=typeof cfg.onApply==='function'?cfg.onApply:()=>{};
  if(f.applied!==null){
    const available=new Set(options.map(o=>o.value));
    f.applied=new Set([...f.applied].filter(v=>available.has(v)));
    if(!f.applied.size||f.applied.size===options.length)f.applied=null;
  }
  f.draft=copy(f.applied);f.open=false;return f;
}
function render(key,cfg){
  const f=define(key,cfg),base='imf-'+key;
  const items=f.options.map(o=>'<label class="dash-option ignis-multi-option"><input type="checkbox" value="'+esc(o.value)+'" checked onchange="ignisMultiFilter.change(\''+key+'\',this.value,this.checked)"><span class="dash-option-text">'+esc(o.label)+'</span></label>').join('');
  return '<div class="ignis-shared-filter dash-filter-control ignis-filter-control '+esc(f.className)+'" id="'+base+'">'
    +'<span class="dash-filter-caption ignis-filter-caption">'+esc(f.caption)+'</span>'
    +'<button type="button" class="dash-filter-trigger ignis-multi-trigger" aria-expanded="false" aria-haspopup="true" onclick="ignisMultiFilter.toggle(\''+key+'\')">'
    +'<span class="dash-filter-trigger-icon" aria-hidden="true">'+(f.icon||'▦')+'</span><span class="dash-filter-value ignis-multi-label">'+esc(label(f))+'</span>'
    +'<svg class="dash-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>'
    +'<div class="dash-dropdown ignis-multi-menu" style="display:none">'
    +'<div class="dash-dropdown-heading"><div><div class="dash-dropdown-title">'+esc(f.title)+'</div><div class="dash-dropdown-subtitle">'+esc(f.subtitle)+'</div></div>'
    +'<button type="button" class="dash-dropdown-done" onclick="ignisMultiFilter.apply(\''+key+'\')">Concluir</button></div>'
    +'<label class="dash-search-box"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
    +'<input type="search" class="ignis-multi-search" placeholder="'+esc(f.placeholder)+'" autocomplete="off" oninput="ignisMultiFilter.search(\''+key+'\',this.value)" onkeydown="ignisMultiFilter.keydown(event,\''+key+'\')"></label>'
    +'<label class="dash-option dash-option-all"><input type="checkbox" class="ignis-multi-all" checked onchange="ignisMultiFilter.all(\''+key+'\')"><span class="dash-option-text">'+esc(f.allLabel)+'</span></label>'
    +'<div class="dash-option-list ignis-multi-list">'+items+'</div></div></div>';
}
function element(key){return document.getElementById('imf-'+key);}
function selected(key){return copy(filters.get(key)?.applied??null);}
function refresh(key){
  const f=filters.get(key),el=element(key);if(!f||!el)return;
  const s=f.draft,all=s===null||s.size===0||s.size===f.options.length;
  const a=el.querySelector('.ignis-multi-all');if(a)a.checked=all;
  el.querySelectorAll('.ignis-multi-option input').forEach(c=>{c.checked=all||s.has(c.value);});
  const text=el.querySelector('.ignis-multi-label');if(text)text.textContent=label(f);
}
function close(key,commit){
  const f=filters.get(key),el=element(key);if(!f)return;
  if(commit){
    const d=f.draft;f.applied=!d||!d.size||d.size===f.options.length?null:new Set(d);
  }else f.draft=copy(f.applied);
  f.open=false;
  if(el){
    el.classList.remove('is-open');const m=el.querySelector('.ignis-multi-menu');if(m)m.style.display='none';
    el.querySelector('.ignis-multi-trigger')?.setAttribute('aria-expanded','false');refresh(key);
  }
  if(commit)f.onApply(selected(key));
}
function toggle(key){
  const f=filters.get(key),el=element(key);if(!f||!el)return;
  if(f.open){close(key,false);return;}
  for(const [k,x] of filters)if(k!==key&&x.open)close(k,false);
  ['op-dropdown-menu','placa-dropdown-menu','modelo-dropdown-menu'].forEach(id=>{
    const m=document.getElementById(id);if(m)m.style.display='none';
  });
  f.draft=copy(f.applied);f.open=true;
  el.classList.add('is-open');el.querySelector('.ignis-multi-menu').style.display='block';
  el.querySelector('.ignis-multi-trigger').setAttribute('aria-expanded','true');refresh(key);
  if(!window.matchMedia?.('(max-width:768px)').matches)setTimeout(()=>el.querySelector('.ignis-multi-search')?.focus(),0);
}
function change(key,value,checked){
  const f=filters.get(key);if(!f)return;
  if(f.draft===null)f.draft=new Set(f.options.map(o=>o.value));
  if(checked)f.draft.add(value);else f.draft.delete(value);
  refresh(key);
}
function all(key){const f=filters.get(key);if(f){f.draft=null;refresh(key);}}
function search(key,value){
  const el=element(key);if(!el)return;
  const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const term=clean(value);
  el.querySelectorAll('.ignis-multi-option').forEach(n=>{n.style.display=clean(n.textContent).includes(term)?'':'none';});
}
function keydown(e,key){
  if(e.key==='Escape'){e.preventDefault();close(key,false);}
  if(e.key==='Enter'){e.preventDefault();close(key,true);}
}
let mouseDown=null;
document.addEventListener('mousedown',e=>mouseDown=e.target);
document.addEventListener('click',e=>{
  for(const [key,f] of filters)if(f.open){
    const el=element(key);
    if(el&&!el.contains(e.target)&&!el.contains(mouseDown))close(key,false);
  }
});
window.ignisMultiFilter={render,selected,toggle,change,all,search,keydown,apply:k=>close(k,true),cancel:k=>close(k,false),isOpen:k=>!!filters.get(k)?.open};
})();
