'use strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));

async function main(){
  const source=fs.readFileSync(path.resolve(__dirname,'../planejamento2027.js'),'utf8');
  new Function(source);
  const state={planejamento2027:{},semanas:{},abastecimentos:[
    {placa:'RHT5F20',data:'2026-11-11',tipoIgnis:'pesada',litros:100,horas:100,metaIdeal:1.5,operacao:'Ribas'},
    {placa:'AAB1234',data:'2026-11-10',tipoIgnis:'pesada',litros:100,horas:200,metaIdeal:1.5,operacao:'Betim'}
  ]};
  const page={innerHTML:''},modal={innerHTML:''};
  let extendedPanel=null;
  const document={
    addEventListener(){},
    getElementById:id=>id==='page-planejamento'?page:id==='p27-editor-root'?modal:id.startsWith('p27-extend-')?extendedPanel:null,
    querySelector:()=>null,
    body:{classList:{add(){},remove(){}}}
  };
  const window={addEventListener(){},_authUser:{nome:'Instrutor (teste)'}};
  let saves=0,shouldSave=true;
  const saveOptions=[];
  const notifications=[];
  class FakeFormData{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}
  const context={state,document,window,FormData:FakeFormData,
    getTipoIgnis:a=>a.tipoIgnis,getMaquina:()=>({meta:1.5}),
    saveState:async(opts)=>{saves++;saveOptions.push(opts);return shouldSave;},
    confirm:()=>true,
    console:{info(){},error(){}},
    showToast:(msg,kind)=>notifications.push([msg,kind])};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../ignis-multiselect.js'),'utf8'),context,{filename:'ignis-multiselect.js'});
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
  assert.match(page.innerHTML,/Faixa de performance/);
  assert.match(page.innerHTML,/Personalizado/);
  assert.match(page.innerHTML,/ignis-filterbar/);
  assert.match(page.innerHTML,/imf-planOperation/);
  assert.match(page.innerHTML,/imf-planPlate/);
  assert.match(page.innerHTML,/imf-planGroup/);
  assert.match(page.innerHTML,/Todas as operações/);
  assert.match(page.innerHTML,/Todas as placas/);
  assert.equal(context.ignisPlanSummary('2026-11').length,2);
  assert.equal(context.ignisPlanSummary('2026-11').filter(x=>x.acima).length,1);
  window._ignisPlanFaixa='acima';
  context.ignisPlanRender();
  let tableHtml=page.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(tableHtml,/AAB1234/,'faixa acima seleciona veículo acima da meta superior');
  assert.doesNotMatch(tableHtml,/RHT5F20/,'faixa acima não inclui veículo abaixo');
  window._ignisPlanFaixa='abaixo';
  context.ignisPlanRender();
  tableHtml=page.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(tableHtml,/RHT5F20/,'faixa abaixo seleciona veículo abaixo da meta');
  assert.doesNotMatch(tableHtml,/AAB1234/);
  window._ignisPlanFaixa='ambos';
  window.ignisMultiFilter.setSelection('planOperation',['Betim']);
  tableHtml=page.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(tableHtml,/AAB1234/);
  assert.doesNotMatch(tableHtml,/RHT5F20/);
  window.ignisMultiFilter.reset('planOperation');
  window.ignisMultiFilter.setSelection('planPlate',['RHT5F20']);
  tableHtml=page.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(tableHtml,/RHT5F20/);
  assert.doesNotMatch(tableHtml,/AAB1234/);
  window.ignisMultiFilter.reset('planPlate');
  window.ignisMultiFilter.setSelection('planOperation',['Ribas','Betim']);
  window.ignisMultiFilter.setSelection('planGroup',['pesada']);
  tableHtml=page.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(tableHtml,/RHT5F20/,'múltiplas operações incluem Ribas');
  assert.match(tableHtml,/AAB1234/,'múltiplas operações incluem Betim');
  window.ignisMultiFilter.reset('planOperation');
  window.ignisMultiFilter.reset('planGroup');
  context.ignisPlanRender();

  const periodSpec=context.ignisPlanPeriodSpec();
  assert.equal(periodSpec.mode,'month');
  context.ignisPlanSetPeriodMode('custom');
  context.ignisPlanSetCustomDate('start','2026-11-10');
  context.ignisPlanSetCustomDate('end','2026-11-10');
  assert.match(page.innerHTML,/type="date"/);
  assert.equal(Array.from(context.ignisPlanSummary({start:'2026-11-10',end:'2026-11-10'}).map(x=>x.placa)).join(','),'AAB1234');
  tableHtml=page.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(tableHtml,/AAB1234/);
  assert.doesNotMatch(tableHtml,/RHT5F20/,'intervalo personalizado respeita a data individual');
  context.ignisPlanSetPeriodMode('month');
  context.ignisPlanResetFilters();

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
  assert.match(page.innerHTML,/p27-compact-cases/,'resumo compacto na Performance');
  assert.match(page.innerHTML,/Ver histórico \(2\)/,'histórico reúne ambas as ocorrências');
  assert.doesNotMatch(page.innerHTML,/ignisPlanQuickFinish\(/,'ações por ocorrência saem da tabela');
  assert.doesNotMatch(page.innerHTML,/ignisPlanDeleteCase\(/,'exclusão não polui a Performance');
  context.ignisPlanGoToCases('RHT5F20','pesada');
  assert.equal(window._ignisPlanTab,'ocorrencias');
  assert.match(page.innerHTML,/Histórico de ocorrências/,'histórico abre na aba correta');
  assert.match(page.innerHTML,/Prorrogar/,'prorrogação disponível nas Ocorrências');
  assert.match(page.innerHTML,/Concluir/,'conclusão disponível nas Ocorrências');
  assert.match(page.innerHTML,/Excluir/,'exclusão disponível nas Ocorrências');
  const plateFilter=window.ignisMultiFilter.selected('planCasesPlate');
  const groupFilter=window.ignisMultiFilter.selected('planCasesGroup');
  assert.ok(plateFilter===null||plateFilter.has('RHT5F20'),
    'placa escolhida preservada quando não representa todas as opções');
  assert.ok(groupFilter===null||groupFilter.has('pesada'),
    'grupo escolhido preservado quando não representa todas as opções');
  window._ignisPlanTab='performance';
  context.ignisPlanRender();
  extendedPanel={
    querySelector(selector){return {value:selector.includes('date')?'2027-01-01':'Oficina aguardando peças de reposição'};},
    hidden:false
  };
  const firstKey=encodeURIComponent(first.id);
  await context.ignisPlanExtend(firstKey);
  assert.equal(conf.tratativas.find(x=>x.id===first.id).prazo,'2027-01-01');
  assert.ok(conf.tratativas.find(x=>x.id===first.id).historico.some(x=>x.tipo==='Prazo prorrogado'));
  await context.ignisPlanQuickFinish(firstKey);
  assert.equal(conf.tratativas.find(x=>x.id===first.id).acaoRealizada,true);
  assert.ok(conf.tratativas.find(x=>x.id===first.id).historico.some(x=>x.tipo==='Ação corretiva concluída'));
  const secondId=conf.tratativas.find(x=>x.id!==first.id).id;
  shouldSave=false;
  await context.ignisPlanDeleteCase(encodeURIComponent(secondId));
  assert.ok(conf.tratativas.some(x=>x.id===secondId),'erro de gravação deve reverter exclusão');
  shouldSave=true;
  await context.ignisPlanDeleteCase(encodeURIComponent(secondId));
  assert.equal(conf.tratativas.length,1);
  assert.ok(conf.excluidas[secondId],'exclusão mantém tombstone contra restauração por outra sessão');
  assert.ok(saveOptions.every(o=>Array.isArray(o.keys)&&o.keys.length===1&&o.keys[0]==='planejamento2027'),
    'salvamento deve ser restrito ao módulo');
  // Empilhadeiras: devem sumir desta aba, mas máquinas e tratores permanecem.
  const beforeFilteringSaveCount=saves;
  state.maquinas=[
    {placa:'EMP1234',tipoIgnis:'empilhadeira'},
    {placa:'MOF1200',tipoIgnis:'maquina',modelo:'MOFFETT M4'}
  ];
  state.abastecimentos.push(
    {placa:'EMP1234',data:'2026-11-11',tipoIgnis:'empilhadeira',litros:500,horas:1,metaIdeal:10,operacao:'Ribas'},
    {placa:'MOF1200',data:'2026-11-11',tipoIgnis:'maquina',modelo:'MOFFETT M4',litros:600,horas:1,metaIdeal:10,operacao:'Ribas'},
    {placa:'TRA0069',data:'2026-11-11',tipoIgnis:'trator',litros:120,horas:10,metaIdeal:10,operacao:'Ribas'},
    {placa:'MAQ0155',data:'2026-11-11',tipoIgnis:'maquina',litros:120,horas:10,metaIdeal:10,operacao:'Ribas'}
  );
  const forkliftCases=[
    {id:'forklift-case-1',mes:'2026-11',placa:'EMP1234',grupo:'maquinas',categoria:'Problema mecânico',acaoRealizada:false,prazo:'2026-01-01'},
    {id:'forklift-case-2',mes:'2026-11',placa:'MOF1200',grupo:'maquinas',categoria:'Problema mecânico',acaoRealizada:false,prazo:'2026-01-01'}
  ];
  conf.tratativas.push(...forkliftCases);
  const summaryWithoutForklifts=context.ignisPlanSummary('2026-11');
  const summaryPlates=summaryWithoutForklifts.map(x=>x.placa);
  assert.ok(summaryPlates.includes('TRA0069'),'Tratores devem continuar sendo Máquinas');
  assert.ok(summaryPlates.includes('MAQ0155'),'Máquinas normais permanecem no acompanhamento');
  assert.ok(!summaryPlates.includes('EMP1234'),'Empilhadeira explícita não entra na média');
  assert.ok(!summaryPlates.includes('MOF1200'),'Equipamento MOFFETT não entra na média mesmo cadastrado como máquina');
  assert.equal(context.ignisPlanGroup('empilhadeira'),'','Empilhadeira não pertence ao grupo Máquinas no Acompanhamento');
  context.ignisPlanRender();
  const afterForkliftHtml=page.innerHTML;
  assert.match(afterForkliftHtml,/TRA0069/);
  assert.match(afterForkliftHtml,/MAQ0155/);
  assert.doesNotMatch(afterForkliftHtml,/EMP1234|MOF1200/,'Empilhadeiras e ocorrências antigas ficam ocultas');
  context.ignisPlanShowOverdue();
  assert.doesNotMatch(modal.innerHTML,/EMP1234|MOF1200/,'Prazos vencidos de empilhadeiras não contam na aba');
  assert.equal(conf.tratativas.some(x=>x.id==='forklift-case-1'),true,'Ocorrências históricas não podem ser apagadas');
  assert.equal(saves,beforeFilteringSaveCount,'Exclusão visual não deve gravar no Firebase');

  const index=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  assert.ok(index.includes("const scopedPlanning=mode==='light'"),'fluxo segmentado está disponível');
  assert.match(index,/filtros-unificados\.css\?v=/,'CSS global de filtros carregado');
  assert.match(index,/planejamento2027\.js\?v=20261118c/,'novo módulo sem cache antigo');
  const filterCss=fs.readFileSync(path.resolve(__dirname,'../filtros-unificados.css'),'utf8');
  assert.match(filterCss,/button\.dash-dropdown-done/,'botão Concluir possui padrão visual');
  for(const pageId of ['page-dashboard','page-abastecimentos','page-arla','page-comparativo','page-motoristas','page-fechamento'])
    assert.ok(filterCss.includes('#'+pageId)||filterCss.includes('.page .filter-'),'padronização de '+pageId);

  assert.ok(index.includes('const excluidas={...(current.excluidas||{})}'),'merge Firestore conserva exclusões');
  assert.ok(index.includes('excluidas,tratativas:[...cases.values()]'),'Firestore não ressuscita as exclusões');
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
