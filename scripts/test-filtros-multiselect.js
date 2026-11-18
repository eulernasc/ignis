'use strict';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dirname=path.dirname(fileURLToPath(import.meta.url));
const read=name=>fs.readFileSync(path.join(dirname,'..',name),'utf8');
const html=read('index.html'),shared=read('ignis-multiselect.js'),plan=read('planejamento2027.js'),css=read('filtros-unificados.css');
new Function(shared);new Function(plan);
const stage=html.match(/<script id="ignis-stage2-polish-js">([\s\S]*?)<\/script>/);
assert.ok(stage&&stage[1],'Script de filtros do Dashboard não encontrado');
new Function(stage[1]);
assert.match(html,/ignis-multiselect\.js\?v=20261118a/,'script compartilhado não carregado');
assert.match(html,/renderDashMixedSummary\(list\)/,'Dashboard mistura unidades');
assert.match(html,/function getSelectedDashTypes\(/,'Filtro de tipo não suporta multisseleção');
assert.match(plan,/ignisMultiFilter\.render\("planOperation"/);
assert.match(plan,/ignisMultiFilter\.render\("planPlate"/);
assert.match(plan,/ignisMultiFilter\.render\("planGroup"/);
assert.match(css,/ignis-shared-filter/);
assert.match(css,/dash-dropdown-done/);
let applied=0;
const context=vm.createContext({
  Set,Map,Array,Promise,console,
  window:{matchMedia:()=>({matches:false})},
  document:{addEventListener(){},getElementById(){return null;}}
});
vm.runInContext(shared,context);
const filters=context.window.ignisMultiFilter;
const cfg={caption:'Tipo de veículo',title:'Tipos de veículo',
  allLabel:'Todos os tipos',countLabel:'tipos',placeholder:'Buscar tipo',
  options:[['__maquinas__','Máquinas'],['__pesada__','Frota pesada'],['__leve__','Frota leve']],
  onApply:()=>applied++};
const markup=filters.render('dashType',cfg);
assert.match(markup,/Concluir/);assert.match(markup,/checkbox/);assert.match(markup,/Buscar tipo/);
assert.equal(filters.selected('dashType'),null);
filters.change('dashType','__leve__',false);
filters.apply('dashType');
assert.equal(applied,1);
assert.deepEqual(Array.from(filters.selected('dashType')).sort(),['__maquinas__','__pesada__']);
filters.render('dashType',cfg);
assert.deepEqual(Array.from(filters.selected('dashType')).sort(),['__maquinas__','__pesada__'],'seleções persistem após render');
filters.change('dashType','__maquinas__',false);
filters.cancel('dashType');
assert.deepEqual(Array.from(filters.selected('dashType')).sort(),['__maquinas__','__pesada__'],'cancelar preserva seleção confirmada');
filters.setSelection('dashType',['__maquinas__','__leve__']);
assert.deepEqual(Array.from(filters.selected('dashType')).sort(),['__leve__','__maquinas__']);
filters.reset('dashType');assert.equal(filters.selected('dashType'),null);
const begin=html.indexOf('function getFilteredAbast('),end=html.indexOf('// ── DASHBOARD',begin);
assert.ok(begin>=0&&end>begin,'Filtro de abastecimentos não encontrado');
const records=[
  {placa:'PES1',tipoIgnis:'pesada',operacao:'Ribas',litros:100,horas:200,data:'2026-11-15'},
  {placa:'LEV1',tipoIgnis:'leve',operacao:'Betim',litros:50,horas:600,data:'2026-11-15'},
  {placa:'MAQ1',tipoIgnis:'maquina',operacao:'Ribas',litros:20,horas:2,data:'2026-11-15'}
];
const dataset={tab:'custom',semanas:{},abastecimentos:records};
const view=vm.createContext({
  Set,Map,Date,Number,Array,Object,
  state:dataset,
  document:{getElementById:()=>null},
  getTipoIgnis:a=>a.tipoIgnis,
  getMaquina:p=>({operacao:records.find(r=>r.placa===p)?.operacao}),
  getSelectedPlacas:()=>null,
  getSelectedModelos:()=>null
});
vm.runInContext(html.slice(begin,end),view);
const run=(ops,types)=>vm.runInContext('getFilteredAbast',view)(ops,types);
assert.equal(run(null,null).length,3,'Todos os tipos deve mostrar dados');
assert.deepEqual(Array.from(run(null,new Set(['__maquinas__','__pesada__'])),x=>x.placa).sort(),['MAQ1','PES1']);
assert.deepEqual(Array.from(run(new Set(['Ribas']),new Set(['__maquinas__','__pesada__'])),x=>x.placa).sort(),['MAQ1','PES1']);
assert.equal(run(new Set(['Betim']),new Set(['__maquinas__','__pesada__'])).length,0,'filtros precisam se combinar por interseção');
// Simula a tela com km/L e L/h: não é permitido exibir média única.
const fakeEls=new Map();
const fakeElement=id=>{if(!fakeEls.has(id))fakeEls.set(id,{textContent:'',innerHTML:'',style:{}});return fakeEls.get(id);};
const mixedSource=stage[1].slice(stage[1].indexOf('function renderDashMixedSummary('),stage[1].indexOf('function decorateCompTypeOptions('));
assert.ok(mixedSource.startsWith('function renderDashMixedSummary('));
const mixedContext=vm.createContext({
  Map,Set,Number,String,Array,Object,console,
  window:{_selectedOps:new Set()},
  document:{getElementById:fakeElement},
  getTipoIgnis:a=>a.tipoIgnis,
  getMaquina:p=>({operacao:records.find(r=>r.placa===p)?.operacao,meta:p==='MAQ1'?12:2})
});
vm.runInContext(mixedSource,mixedContext);
vm.runInContext('renderDashMixedSummary',mixedContext)([records[0],records[2]]);
assert.equal(fakeElement('kpi-maquinas').textContent,'2');
assert.equal(fakeElement('kpi-media').textContent,'—','Não misturar médias de km/L e L/h');
assert.match(fakeElement('op-chart-container').innerHTML,/km\/L/);
assert.match(fakeElement('op-chart-container').innerHTML,/L\/h/);
assert.match(fakeElement('kpi-efic-sub').textContent,/Unidades distintas/);
console.log('OK: multisseleção, cancelar/concluir, tipos combinados, filtros de operação, unidades e CSS.');
