'use strict';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html'),shared=read('ignis-multiselect.js'),plan=read('planejamento2027.js');
new Function(shared);
new Function(plan);
assert.match(html,/ignis-multiselect\.js\?v=20261118b/);
for(const id of ['planOperation','planPlate','planGroup'])
  assert.ok(plan.includes('ignisMultiFilter.render("'+id+'"'),'Filtro ausente: '+id);
assert.match(read('planejamento2027.css'),/#page-planejamento \.ignis-shared-filter/);
assert.doesNotMatch(html,/function renderDashMixedSummary\(/,'Dashboard não pode ter modo misto novo');

let applied=0;
const context=vm.createContext({
  Set,Map,Array,Promise,console,
  window:{matchMedia:()=>({matches:false})},
  document:{addEventListener(){},getElementById(){return null;}}
});
vm.runInContext(shared,context);
const filters=context.window.ignisMultiFilter;
const cfg={
  caption:'Operação',title:'Operações',allLabel:'Todas as operações',
  countLabel:'operações',placeholder:'Buscar operação',
  options:[['Ribas','Ribas'],['Betim','Betim'],['Juatuba','Juatuba']],
  onApply:()=>applied++
};
const markup=filters.render('planOperation',cfg);
assert.match(markup,/Concluir/);
assert.match(markup,/checkbox/);
assert.match(markup,/Buscar operação/);
assert.equal(filters.selected('planOperation'),null,'Começar com todas as operações');
filters.change('planOperation','Juatuba',false);
filters.apply('planOperation');
assert.equal(applied,1);
assert.deepEqual(Array.from(filters.selected('planOperation')).sort(),['Betim','Ribas']);
filters.render('planOperation',cfg);
assert.deepEqual(Array.from(filters.selected('planOperation')).sort(),['Betim','Ribas'],
  'Seleção persiste após re-render do Acompanhamento');
filters.change('planOperation','Ribas',false);
filters.cancel('planOperation');
assert.deepEqual(Array.from(filters.selected('planOperation')).sort(),['Betim','Ribas'],
  'Cancelar não deve aplicar seleção provisória');
filters.setSelection('planOperation',['Ribas','Juatuba']);
assert.deepEqual(Array.from(filters.selected('planOperation')).sort(),['Juatuba','Ribas']);
filters.reset('planOperation');
assert.equal(filters.selected('planOperation'),null,'Limpar filtros deve reativar Todos');

filters.render('planGroup',{
  caption:'Tipo',options:[['maquinas','Máquinas'],['pesada','Frota pesada'],['leve','Frota leve']],
  allLabel:'Todos os tipos'
});
filters.setSelection('planGroup',['maquinas','pesada']);
assert.deepEqual(Array.from(filters.selected('planGroup')).sort(),['maquinas','pesada']);
console.log('OK: filtros exclusivos do Acompanhamento, múltiplas seleções, Concluir, Cancelar e Limpar.');
