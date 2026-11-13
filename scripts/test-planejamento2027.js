'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

async function main(){
  const source=fs.readFileSync(path.resolve(__dirname,'../planejamento2027.js'),'utf8');
  new Function(source);
  const state={planejamento2027:{},semanas:{},abastecimentos:[
    {placa:'RHT5F20',data:'2026-11-11',tipoIgnis:'pesada',litros:100,horas:100,metaIdeal:1.5,operacao:'Ribas'}
  ]};
  const page={innerHTML:''},modal={innerHTML:''};
  const document={
    getElementById:id=>id==='page-planejamento'?page:id==='p27-editor-root'?modal:null,
    querySelector:()=>null,
    body:{classList:{add(){},remove(){}}}
  };
  const window={addEventListener(){},_authUser:{nome:'Instrutor (teste)'}};
  let saves=0,shouldSave=true;
  const notifications=[];
  class FakeFormData{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}
  const context={state,document,window,FormData:FakeFormData,
    getTipoIgnis:a=>a.tipoIgnis,getMaquina:()=>({meta:1.5}),
    saveState:async()=>{saves++;return shouldSave;},
    showToast:(msg,kind)=>notifications.push([msg,kind])};
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'planejamento2027.js'});
  const submit=(values,id='')=>context.ignisPlanSubmit({
    preventDefault(){},
    currentTarget:{values,querySelector(){return {disabled:false,textContent:''};}}
  },'RHT5F20','pesada',id?encodeURIComponent(id):'','2026-11');
  const base={categoria:'Problema mecânico',descricaoCausa:'Vazamento de diesel',
    acaoCorretiva:'Corrigir mangueira',acaoRealizada:'nao',responsavel:'Instrutor 1',
    prazo:'2026-01-01',dataAcao:'',statusRegistro:'Concluída',observacao:'Oficina comunicada'};

  const conf=context.ignisPlanConfig();
  assert.deepEqual(Object.keys(conf.metas).sort(),['leve','maquinas','pesada']);
  assert.equal(conf.metas.pesada,90);
  assert.equal(conf.metas.leve,93);
  assert.equal(conf.metas.maquinas,95);
  assert.equal(context.ignisPlanSummary('2026-11')[0].abaixo,true);
  context.ignisPlanRender();
  assert.match(page.innerHTML,/Acompanhamento de Performance/);
  assert.match(page.innerHTML,/Nova ocorrência/);
  await submit(base);
  assert.equal(conf.tratativas.length,1);
  const first=conf.tratativas[0];
  assert.equal(context.ignisPlanRegisterState(first),'Concluída');
  assert.equal(context.ignisPlanActionState(first),'pendente');
  assert.equal(context.ignisPlanOverdue(first),true);
  assert.equal(first.historico.length,1);
  assert.equal(first.atualizadoPor,'Instrutor (teste)');
  await submit({...base,categoria:'Dirigibilidade',descricaoCausa:'Reciclagem necessária',
    acaoCorretiva:'Realizar treinamento',acaoRealizada:'sim',dataAcao:'2026-11-11',prazo:'',
    statusRegistro:'Registrada'});
  assert.equal(conf.tratativas.length,2);
  assert.notEqual(conf.tratativas[0].id,conf.tratativas[1].id);
  assert.equal(context.ignisPlanActionState(conf.tratativas[1]),'realizada');
  assert.equal(context.ignisPlanOverdue(conf.tratativas[1]),false);
  await submit({...base,responsavel:'Instrutor 2'},first.id);
  assert.equal(conf.tratativas.length,2);
  assert.equal(conf.tratativas[0].historico.length,2);
  assert.ok(conf.tratativas[0].historico[1].alteracoes.some(x=>x.campo==='Responsável'));
  assert.equal(context.ignisPlanMonthChoices().includes('2026-11'),true);
  context.ignisPlanList('RHT5F20','pesada','2026-11');
  assert.match(modal.innerHTML,/Histórico de atualizações/);
  assert.match(modal.innerHTML,/Dirigibilidade/);
  context.ignisPlanShowOverdue();
  assert.match(modal.innerHTML,/Prazos vencidos/);
  assert.match(modal.innerHTML,/Tratar/);
  window._ignisPlanStatus='vencido';
  context.ignisPlanRender();
  assert.match(page.innerHTML,/RHT5F20/);
  window._ignisPlanStatus='';
  const before=conf.tratativas.length;
  shouldSave=false;
  await submit({...base,categoria:'Parâmetro',descricaoCausa:'Ajuste de parâmetro'});
  assert.equal(conf.tratativas.length,before,'falha no Firebase deve reverter o caso');
  shouldSave=true;
  const legacy={id:'2026-11|pesada|ABCD123',mes:'2026-11',placa:'ABCD123',grupo:'pesada',
    categoria:'Treinamento',prazo:'2026-01-01',status:'Resolvido'};
  assert.equal(context.ignisPlanActionState(legacy),'não verificada');
  assert.equal(context.ignisPlanRegisterState(legacy),'Concluída');
  assert.equal(context.ignisPlanOverdue(legacy),true);
  assert.ok(saves>=4);
  console.log('OK: metas, baixa performance, múltiplas causas, registro separado da ação,');
  console.log('histórico, vencidos, filtros, edição, legado e rollback de salvamento.');
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
