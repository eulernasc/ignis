/* IGNIS · Acompanhamento de Performance — tratativas por placa, limites inferior/superior e filtros mensais.
   O estado desta tela usa o salvamento leve já existente do IGNIS. */
'use strict';
function ignisPlanEsc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function ignisPlanConfig(){
  if(!state.planejamento2027 || typeof state.planejamento2027!=='object')state.planejamento2027={};
  const c=state.planejamento2027;
  if(!c.metas || typeof c.metas!=='object')c.metas={};
  for(const [group,def] of Object.entries({pesada:90,leve:93,maquinas:95})){
    const n=Number(c.metas[group]);if(!Number.isFinite(n)||n<=0||n>150)c.metas[group]=def;
  }
  if(!Number.isFinite(Number(c.limiteSuperior))||Number(c.limiteSuperior)<=100||Number(c.limiteSuperior)>200)c.limiteSuperior=110;
  if(!Array.isArray(c.tratativas))c.tratativas=[];
  return c;
}

function ignisPlanGroup(tipo){
  if(tipo==='pesada')return 'pesada';
  if(tipo==='leve')return 'leve';
  if(['maquina','trator','empilhadeira'].includes(tipo))return 'maquinas';
  return '';
}

function ignisPlanMonthOf(a){
  const p=a?.periodoId?state.semanas?.[a.periodoId]:null;
  return String(p?.dataFim||p?.dataIni||a?.data||'').slice(0,7);
}

function ignisPlanMonthChoices(){
  const months=new Set();
  Object.values(state.semanas||{}).forEach(p=>{const m=String(p?.dataFim||p?.dataIni||'').slice(0,7);if(/^\d{4}-\d\d$/.test(m))months.add(m);});
  (state.abastecimentos||[]).forEach(a=>{if(!a?.periodoId){const m=String(a?.data||'').slice(0,7);if(/^\d{4}-\d\d$/.test(m))months.add(m);}});
  ignisPlanConfig().tratativas.forEach(t=>{const m=String(t?.mes||'');if(/^\d{4}-\d{2}$/.test(m))months.add(m);});
  return [...months].sort().reverse();
}

function ignisPlanMonthLabel(month){
  const [year,m]=month.split('-');const names=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return (names[Number(m)-1]||month)+' de '+year;
}

function ignisPlanSummary(month){
  const groups=new Map(), conf=ignisPlanConfig();
  for(const a of state.abastecimentos||[]){
    if(ignisPlanMonthOf(a)!==month)continue;
    const placa=String(a.placa||'').trim().toUpperCase();
    if(!placa)continue;
    const tipo=typeof getTipoIgnis==='function'?getTipoIgnis(a):String(a.tipoIgnis||'');
    const grupo=ignisPlanGroup(tipo);
    if(!grupo)continue;
    const key=grupo+'|'+placa;let x=groups.get(key);
    if(!x){x={placa,grupo,operacao:getMaquina(placa)?.operacao||a.operacao||'',litros:0,atividade:0,meta:0,metasoma:0,metapeso:0};groups.set(key,x);}
    const l=Number(a.litros)||0,h=Number(a.horas)||0;if(l<=0||h<=0)continue;
    x.litros+=l;x.atividade+=h;
    const m=Number(a.metaIdeal||getMaquina(placa)?.meta||0);
    if(m>0){x.metasoma+=m*l;x.metapeso+=l;}
  }
  const all=[...groups.values()].filter(x=>x.litros>0&&x.atividade>0).map(x=>{
    const kmL=x.grupo==='pesada'||x.grupo==='leve';
    const media=kmL?x.atividade/x.litros:x.litros/x.atividade;
    const meta=x.metapeso>0?x.metasoma/x.metapeso:0;
    const eficiencia=meta>0?(kmL?media/meta*100:meta/media*100):null;
    const limite=Number(conf.metas[x.grupo]),limiteSuperior=Number(conf.limiteSuperior);
    return {...x,media,meta,eficiencia,limite,limiteSuperior,unidade:kmL?'km/L':'L/h',atividadeUnidade:kmL?'km':'h',abaixo:eficiencia!==null&&eficiencia<limite,acima:eficiencia!==null&&eficiencia>limiteSuperior};
  });
  return all;
}

function ignisPlanActionState(t){
  if(!t)return 'sem registro';
  if(t.acaoRealizada===true||t.acaoRealizada==='sim')return 'realizada';
  if(t.acaoRealizada===false||t.acaoRealizada==='nao')return 'pendente';
  return 'não verificada'; // Legados com status "Resolvido" não comprovam a ação
}
function ignisPlanRegisterState(t){
  if(!t)return 'Sem registro';
  return t.statusRegistro||({'Pendente':'Registrada','Em andamento':'Em acompanhamento','Resolvido':'Concluída'}[t.status]||'Registrada');
}
function ignisPlanLocalDate(){const now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');}
function ignisPlanOverdue(t){
  // Callback seguro para Array.filter/Array.some: o segundo argumento dessas APIs
  // é o índice, não uma data de referência.
  const today=ignisPlanLocalDate();
  return Boolean(t&&ignisPlanActionState(t)!=='realizada'&&/^\d{4}-\d{2}-\d{2}$/.test(String(t.prazo||''))&&t.prazo<today);
}
function ignisPlanFmtDate(date){
  const s=String(date||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
}
function ignisPlanCauseName(t){return t?.categoria||'Causa não informada';}
function ignisPlanCases(mes,grupo,placa){
  return ignisPlanConfig().tratativas.filter(t=>t.mes===mes&&t.grupo===grupo&&String(t.placa).toUpperCase()===String(placa).toUpperCase())
    .sort((a,b)=>String(b.criadoEm||'').localeCompare(String(a.criadoEm||'')));
}
function ignisPlanSafeParam(s){return encodeURIComponent(String(s||'')).replace(/'/g,'%27');}
function ignisPlanChangeRecord(before,next){
  const fields={categoria:'Causa',descricaoCausa:'Descrição da causa',acaoCorretiva:'Ação corretiva',acaoRealizada:'Ação realizada',statusRegistro:'Situação do registro',
    responsavel:'Responsável',prazo:'Prazo',dataAcao:'Data da resolução',observacao:'Observações'};
  return Object.entries(fields).filter(([k])=>String(before?.[k]??'')!==String(next?.[k]??'')).map(([key,label])=>({
    campo:label,anterior:before?.[key]??'',atual:next?.[key]??''
  }));
}
function ignisPlanHistory(t){
  const arr=Array.isArray(t?.historico)?t.historico:[];
  return arr.map(h=>'<article class="p27-history-item"><div><strong>'+ignisPlanEsc(h.tipo||'Atualização')+'</strong><span>'+ignisPlanEsc(h.autor||'Não identificado')+' · '+ignisPlanEsc(String(h.quando||'').replace('T',' ').slice(0,16))+'</span></div>'+
    (h.alteracoes?.length?'<ul>'+h.alteracoes.map(x=>'<li><b>'+ignisPlanEsc(x.campo)+'</b>: '+ignisPlanEsc(String(x.anterior??'—'))+' → '+ignisPlanEsc(String(x.atual??'—'))+'</li>').join('')+'</ul>':'<p>Atualização registrada.</p>')+'</article>').join('')
  ||'<div class="p27-legacy-note">Ocorrência anterior a esta versão. As alterações antigas não possuem histórico detalhado; as próximas atualizações serão registradas.</div>';
}

function ignisPlanInlineCase(t){
  const key=ignisPlanSafeParam(t.id),s=ignisPlanActionState(t),overdue=ignisPlanOverdue(t);
  const isDone=s==='realizada';
  const when=isDone?(t.dataAcao?ignisPlanFmtDate(t.dataAcao):'Data não informada'):ignisPlanFmtDate(t.prazo);
  const status=isDone?'Concluída':overdue?'Vencida':'Pendente';
  return `<div class="p27-inline-case" data-case="${ignisPlanEsc(t.id)}">
    <div class="p27-inline-head"><strong>${ignisPlanEsc(ignisPlanCauseName(t))}</strong>
    <span class="p27-inline-badge ${isDone?'p27-done':overdue?'p27-urgent':'p27-active'}">${status}</span></div>
    <div class="p27-inline-info"><span class="${overdue?'p27-bad':''}">${isDone?'Concluída em':'Prazo'}: <b>${when}</b></span>
    <span>Resp.: ${ignisPlanEsc(t.responsavel||'Não informado')}</span></div>
    <div class="p27-inline-buttons">
      ${!isDone?`<button type="button" class="p27-mini primary" onclick="ignisPlanQuickFinish('${key}')">Concluir</button>
       <button type="button" class="p27-mini" onclick="ignisPlanToggleExtend('${key}')">Prorrogar</button>`:''}
      <button type="button" class="p27-mini" onclick="ignisPlanOpen('${ignisPlanSafeParam(t.placa)}','${ignisPlanSafeParam(t.grupo)}','${key}','${ignisPlanSafeParam(t.mes)}')">Detalhes</button>
      <button type="button" class="p27-mini danger" onclick="ignisPlanDeleteCase('${key}')">Excluir</button>
    </div>
    ${!isDone?`<div class="p27-extend" id="p27-extend-${key}" hidden>
      <label>Nova data<input type="date" min="${ignisPlanLocalDate()}" value="${t.prazo&&t.prazo>=ignisPlanLocalDate()?ignisPlanEsc(t.prazo):ignisPlanLocalDate()}"></label>
      <label>Justificativa<input type="text" maxlength="220" placeholder="Motivo da prorrogação"></label>
      <div class="p27-inline-buttons">
        <button type="button" class="p27-mini primary" onclick="ignisPlanExtend('${key}')">Salvar novo prazo</button>
        <button type="button" class="p27-mini" onclick="ignisPlanToggleExtend('${key}')">Cancelar</button>
      </div>
    </div>`:''}
  </div>`;
}

function ignisPlanCaseById(encoded){
  return ignisPlanConfig().tratativas.find(t=>t.id===decodeURIComponent(encoded))||null;
}

function ignisPlanAuthor(){return String(window._authUser?.nome||window._authUser?.id||'Não identificado');}

function ignisPlanAuditUpdate(t,next,label,extra=[]){
  const now=new Date().toISOString();
  next.atualizadoEm=now;next.atualizadoPor=ignisPlanAuthor();
  next.historico=Array.isArray(t.historico)?t.historico.slice():[];
  next.historico.push({id:now+'-'+Math.random().toString(36).slice(2,9),quando:now,autor:ignisPlanAuthor(),tipo:label,
    alteracoes:ignisPlanChangeRecord(t,next).concat(extra)});
  return next;
}

async function ignisPlanCommitInline(mutate,successMessage){
  if(window._ignisPlanSaving){showToast('Já existe uma alteração sendo sincronizada.','info');return false;}
  const conf=ignisPlanConfig(),before=JSON.stringify({tratativas:conf.tratativas,excluidas:conf.excluidas||{}});
  window._ignisPlanSaving=true;
  const status=document.getElementById('p27-inline-save');if(status)status.textContent='Salvando no Firebase...';
  const start=Date.now();
  try{
    mutate(conf);
    const ok=await saveState({mode:'light',keys:['planejamento2027'],immediate:true});
    if(!ok)throw new Error(window._lastFirebaseSaveError||'Firebase não confirmou o salvamento.');
    ignisPlanRender();showToast(successMessage,'success');
    console.info('IGNIS Performance: operação confirmada em '+((Date.now()-start)/1000).toFixed(1)+'s.');
    return true;
  }catch(err){
    const old=JSON.parse(before);conf.tratativas=old.tratativas;conf.excluidas=old.excluidas;
    ignisPlanRender();showToast('Não foi possível salvar. Alteração revertida.','error');
    console.error('IGNIS Performance: erro de salvamento',err);return false;
  }finally{window._ignisPlanSaving=false;}
}

async function ignisPlanQuickFinish(encoded){
  const t=ignisPlanCaseById(encoded);if(!t)return;
  if(ignisPlanActionState(t)==='realizada'){showToast('Esta ação já está concluída.','info');return;}
  if(!confirm('Confirmar que a ação corretiva da placa '+t.placa+' foi realizada?'))return;
  await ignisPlanCommitInline(conf=>{
    const index=conf.tratativas.findIndex(x=>x.id===t.id);if(index<0)throw new Error('Ocorrência não encontrada');
    conf.tratativas[index]=ignisPlanAuditUpdate(t,{...t,acaoRealizada:true,dataAcao:ignisPlanLocalDate()},'Ação corretiva concluída');
  },'Ação concluída e registrada no histórico.');
}

function ignisPlanToggleExtend(encoded){
  const panel=document.getElementById('p27-extend-'+encoded);
  if(!panel)return;panel.hidden=!panel.hidden;
  if(!panel.hidden)panel.querySelector('input[type="date"]')?.focus();
}

async function ignisPlanExtend(encoded){
  const t=ignisPlanCaseById(encoded),panel=document.getElementById('p27-extend-'+encoded);
  if(!t||!panel)return;
  const prazo=String(panel.querySelector('input[type="date"]')?.value||'');
  const motivo=String(panel.querySelector('input[type="text"]')?.value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(prazo)||prazo<ignisPlanLocalDate()||(t.prazo&&prazo<=t.prazo)){
    showToast('Informe uma data futura, posterior ao prazo anterior.','error');return;
  }
  if(motivo.length<5){showToast('Informe o motivo da prorrogação.','error');return;}
  await ignisPlanCommitInline(conf=>{
    const index=conf.tratativas.findIndex(x=>x.id===t.id);if(index<0)throw new Error('Ocorrência não encontrada');
    conf.tratativas[index]=ignisPlanAuditUpdate(t,{...t,prazo,acaoRealizada:false,dataAcao:'',motivoProrrogacao:motivo},
      'Prazo prorrogado',[{campo:'Justificativa',anterior:'',atual:motivo}]);
  },'Novo prazo salvo e registrado no histórico.');
}

async function ignisPlanDeleteCase(encoded){
  const t=ignisPlanCaseById(encoded);if(!t)return;
  if(!confirm('Excluir definitivamente a ocorrência de '+ignisPlanCauseName(t)+' da placa '+t.placa+'?'))return;
  await ignisPlanCommitInline(conf=>{
    conf.tratativas=conf.tratativas.filter(x=>x.id!==t.id);
    if(!conf.excluidas||typeof conf.excluidas!=='object')conf.excluidas={};
    conf.excluidas[t.id]=new Date().toISOString();
  },'Ocorrência excluída.');
}

function ignisPlanRender(){
  const root=document.getElementById('page-planejamento');if(!root)return;
  const conf=ignisPlanConfig(), months=ignisPlanMonthChoices();
  if(!window._ignisPlanMonth||!months.includes(window._ignisPlanMonth)){
    window._ignisPlanMonth=months[0]||ignisPlanLocalDate().slice(0,7);
  }
  const mon=window._ignisPlanMonth,groupFilter=window._ignisPlanGroup||'',statusFilter=window._ignisPlanStatus||'',q=String(window._ignisPlanQuery||'').trim().toUpperCase();
  const list=ignisPlanSummary(mon),cases=conf.tratativas.filter(t=>t.mes===mon);
  const allOverdue=conf.tratativas.filter(ignisPlanOverdue);
  const rows=list.filter(x=>x.abaixo||x.acima||cases.some(t=>t.placa===x.placa&&t.grupo===x.grupo))
    .map(x=>({...x,ocorrencias:ignisPlanCases(mon,x.grupo,x.placa)}));
  for(const t of cases){
    if(rows.some(x=>x.grupo===t.grupo&&x.placa===t.placa))continue;
    rows.push({placa:t.placa,grupo:t.grupo,operacao:t.operacao||'',media:0,meta:0,eficiencia:null,
      limite:conf.metas[t.grupo]||0,limiteSuperior:Number(conf.limiteSuperior),
      unidade:t.grupo==='maquinas'?'L/h':'km/L',atividade:0,atividadeUnidade:t.grupo==='maquinas'?'h':'km',
      abaixo:false,acima:false,semDados:true,ocorrencias:ignisPlanCases(mon,t.grupo,t.placa)});
  }
  const desvio=x=>x.eficiencia===null?0:x.abaixo?x.limite-x.eficiencia:x.acima?x.eficiencia-x.limiteSuperior:0;
  rows.sort((a,b)=>desvio(b)-desvio(a)||a.placa.localeCompare(b.placa));
  const uncovered=rows.filter(x=>!x.ocorrencias.length).length;
  const unresolved=cases.filter(t=>ignisPlanActionState(t)!=='realizada').length;
  const done=cases.filter(t=>ignisPlanActionState(t)==='realizada').length;
  const seen=rows.filter(x=>{
    if(groupFilter&&groupFilter!==x.grupo)return false;
    if(statusFilter==='sem-tratativa'&&x.ocorrencias.length)return false;
    if(statusFilter==='pendente'&&!x.ocorrencias.some(t=>ignisPlanActionState(t)!=='realizada'))return false;
    if(statusFilter==='vencido'&&!x.ocorrencias.some(ignisPlanOverdue))return false;
    if(statusFilter==='resolvido'&&!x.ocorrencias.some(t=>ignisPlanActionState(t)==='realizada'))return false;
    if(statusFilter==='registro-concluido'&&!x.ocorrencias.some(t=>ignisPlanRegisterState(t)==='Concluída'))return false;
    return !q||(x.placa+' '+x.operacao+' '+x.ocorrencias.map(t=>t.responsavel+' '+t.categoria).join(' ')).toUpperCase().includes(q);
  });
  const labels={pesada:'Frota Pesada',leve:'Frota Leve',maquinas:'Máquinas'};
  const format=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  root.innerHTML=`
  <div class="page-header"><div class="page-header-title"><div class="page-title">Acompanhamento de Performance</div>
  <div class="page-sub">Registre a causa, acompanhe a ação corretiva e preserve o histórico por placa e equipamento.</div></div></div>
  <div class="p27-info"><strong>Regras de acompanhamento</strong><span>Metas propostas de 90% (pesada), 93% (leve) e 95% (máquinas), ajustáveis após validação operacional.
  A conclusão do <b>registro</b> não significa que a <b>ação corretiva</b> foi realizada.</span></div>
  <div class="p27-top">
    <div class="p27-stat"><span>Abaixo da meta</span><strong>${list.filter(x=>x.abaixo).length}</strong><small>Veículos abaixo do limite</small></div>
    <div class="p27-stat p27-stat-high"><span>Acima de ${format(conf.limiteSuperior)}%</span><strong>${list.filter(x=>x.acima).length}</strong><small>Acima da faixa superior</small></div>
    <div class="p27-stat"><span>Sem registro</span><strong>${uncovered}</strong><small>Veículos aguardando causa</small></div>
    <div class="p27-stat"><span>Ações pendentes</span><strong>${unresolved}</strong><small>No período escolhido</small></div>
    <div class="p27-stat p27-stat-overdue"><span>Prazos vencidos</span><strong>${allOverdue.length}</strong><small>Todos os períodos · <button type="button" onclick="ignisPlanShowOverdue()">Ver pendências</button></small></div>
    <div class="p27-stat"><span>Ações realizadas</span><strong>${done}</strong><small>No período escolhido</small></div>
  </div>
  <div id="p27-inline-save" class="p27-inline-save" aria-live="polite"></div>
  <div class="p27-panel"><div class="p27-panel-head"><div><strong>Faixa de acompanhamento da eficiência</strong>
    <p>Veículos abaixo da meta do grupo ou acima do limite superior entram no acompanhamento. Os valores podem ser configurados.</p></div></div>
    <div class="p27-metas">
      ${Object.entries(labels).map(([key,name])=>`<label><span>${name}</span><div><input type="number" min="1" max="150" step="0.5" value="${Number(conf.metas[key])}" onchange="ignisPlanMetaChange('${key}',this.value)"><em>%</em></div></label>`).join('')}
      <label class="p27-upper"><span>Limite superior</span><div><input type="number" min="101" max="200" step="0.5" value="${Number(conf.limiteSuperior)}" onchange="ignisPlanUpperChange(this.value)"><em>%</em></div></label>
    </div>
  </div>
  <div class="p27-panel"><div class="p27-panel-head"><div><strong>Acompanhamento por veículo</strong>
    <p>Cada veículo pode ter várias ocorrências, com causas, responsáveis e prazos independentes.</p></div></div>
    <div class="p27-filters">
      <label>Período<select id="p27-month" onchange="window._ignisPlanMonth=this.value;ignisPlanRender()">${months.map(m=>`<option value="${m}" ${m===mon?'selected':''}>${ignisPlanMonthLabel(m)}</option>`).join('')}</select></label>
      <label>Grupo<select onchange="window._ignisPlanGroup=this.value;ignisPlanRender()"><option value="">Todos</option>${Object.entries(labels).map(([k,l])=>`<option value="${k}" ${groupFilter===k?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Situação<select onchange="window._ignisPlanStatus=this.value;ignisPlanRender()">
        <option value="">Todas</option>
        <option value="sem-tratativa" ${statusFilter==='sem-tratativa'?'selected':''}>Sem registro</option>
        <option value="pendente" ${statusFilter==='pendente'?'selected':''}>Ações pendentes</option>
        <option value="vencido" ${statusFilter==='vencido'?'selected':''}>Prazos vencidos</option>
        <option value="resolvido" ${statusFilter==='resolvido'?'selected':''}>Ações realizadas</option>
        <option value="registro-concluido" ${statusFilter==='registro-concluido'?'selected':''}>Registros concluídos</option></select></label>
      <label>Busca<input id="p27-search" placeholder="Placa, operação, causa ou responsável" value="${ignisPlanEsc(window._ignisPlanQuery||'')}" oninput="ignisPlanSearch(this.value)"></label>
    </div>
    <div class="p27-table-wrap"><table class="p27-table"><thead><tr>
      <th>Placa / operação</th><th>Grupo</th><th>Real / meta</th><th>Eficiência</th>
      <th>Faixa de referência</th><th>Ocorrências / situação</th><th>Ações</th></tr></thead><tbody>
      ${seen.length?seen.map(x=>{
        const total=x.ocorrencias.length,pendentes=x.ocorrencias.filter(t=>ignisPlanActionState(t)!=='realizada').length,
          vencidos=x.ocorrencias.filter(ignisPlanOverdue).length,ef=x.eficiencia===null?'—':format(x.eficiencia)+'%',
          id=ignisPlanSafeParam(x.placa);
        return `<tr><td><strong>${ignisPlanEsc(x.placa)}</strong><small>${ignisPlanEsc(x.operacao||'Sem operação')}</small></td>
          <td>${labels[x.grupo]||ignisPlanEsc(x.grupo)}</td>
          <td>${x.semDados?'Sem dados no período':`${format(x.media)} / ${x.meta>0?format(x.meta):'—'} ${x.unidade}`}
          <small>${x.semDados?'':format(x.atividade)+' '+x.atividadeUnidade+' no período'}</small></td>
          <td><strong class="${x.abaixo?'p27-bad':x.acima?'p27-high':'p27-good'}">${ef}</strong>
            ${x.abaixo?'<small class="p27-bad">Abaixo da meta</small>':x.acima?'<small class="p27-high">Acima do limite</small>':''}</td>
          <td>${format(x.limite)}% a ${format(x.limiteSuperior)}%</td>
          <td><div class="p27-inline-list">${x.ocorrencias.length?x.ocorrencias.map(ignisPlanInlineCase).join(""):'<span class="p27-pill p27-pending">Sem ocorrência</span>'}</div></td>
          <td><div class="p27-actions"><button class="p27-action" onclick="ignisPlanOpen('${id}','${x.grupo}','','${mon}')">Nova ocorrência</button></div></td></tr>`;
      }).join(''):`<tr><td colspan="7" class="p27-empty">${list.length?'Nenhum veículo corresponde aos filtros.':'Nenhum dado de abastecimento encontrado neste mês. Selecione outro período ou importe relatórios.'}</td></tr>`}
    </tbody></table></div>
  </div>
  <div id="p27-editor-root"></div>`;
}

function ignisPlanSearch(v){
  window._ignisPlanQuery=String(v||'');
  const root=document.getElementById('page-planejamento');
  if(!root)return;
  const caret=document.getElementById('p27-search')?.selectionStart??0;
  ignisPlanRender();
  const field=document.getElementById('p27-search');if(field){field.focus();field.setSelectionRange(Math.min(caret,field.value.length),Math.min(caret,field.value.length));}
}

function ignisPlanClose(){
  const root=document.getElementById('p27-editor-root');
  if(root)root.innerHTML='';
  document.body?.classList.remove('p27-modal-open');
}

function ignisPlanShowOverdue(){
  const root=document.getElementById('p27-editor-root');if(!root)return;
  const entries=ignisPlanConfig().tratativas.filter(ignisPlanOverdue)
    .sort((a,b)=>String(a.prazo||'').localeCompare(String(b.prazo||'')));
  root.innerHTML=`<div class="p27-backdrop" onclick="if(event.target===this)ignisPlanClose()">
   <section class="p27-editor p27-wide" role="dialog" aria-modal="true" aria-label="Prazos vencidos">
    <div class="p27-editor-head"><div><strong>Prazos vencidos</strong><small>Todos os períodos · ações ainda não realizadas</small></div>
      <button type="button" onclick="ignisPlanClose()" aria-label="Fechar">×</button></div>
    <div class="p27-case-list">${entries.length?entries.map(t=>`
      <div class="p27-case-item p27-overdue-item">
        <div><strong>${ignisPlanEsc(t.placa)} · ${ignisPlanEsc(ignisPlanCauseName(t))}</strong>
          <small>${ignisPlanEsc(t.mes)} · ${ignisPlanEsc(t.responsavel||'Sem responsável')} · Venceu em ${ignisPlanFmtDate(t.prazo)}</small></div>
        <button class="p27-action" onclick="ignisPlanOpen('${ignisPlanSafeParam(t.placa)}','${ignisPlanSafeParam(t.grupo)}','${ignisPlanSafeParam(t.id)}','${ignisPlanSafeParam(t.mes)}')">Tratar</button>
      </div>`).join(''):'<div class="p27-empty">Nenhum prazo vencido.</div>'}</div>
    <div class="p27-editor-actions"><button class="p27-action p27-secondary" type="button" onclick="ignisPlanClose()">Fechar</button></div>
   </section></div>`;
  document.body?.classList.add('p27-modal-open');
}

function ignisPlanList(encoded,grupo,period){
  const placa=decodeURIComponent(encoded),mes=decodeURIComponent(period||window._ignisPlanMonth);
  const records=ignisPlanCases(mes,grupo,placa);
  const root=document.getElementById('p27-editor-root');if(!root)return;
  root.innerHTML=`<div class="p27-backdrop" onclick="if(event.target===this)ignisPlanClose()">
    <section class="p27-editor p27-wide" role="dialog" aria-modal="true" aria-label="Ocorrências por veículo">
      <div class="p27-editor-head"><div><strong>${ignisPlanEsc(placa)} · Histórico de ocorrências</strong>
      <small>${ignisPlanMonthLabel(mes)} · ${records.length} causa(s) registrada(s)</small></div>
      <button type="button" onclick="ignisPlanClose()" aria-label="Fechar">×</button></div>
      <div class="p27-case-list">${records.map(t=>`
        <article class="p27-case-card">
          <div class="p27-case-heading"><div><strong>${ignisPlanEsc(ignisPlanCauseName(t))}</strong>
            <small>Responsável: ${ignisPlanEsc(t.responsavel||'Não informado')}</small></div>
            <button class="p27-action" type="button" onclick="ignisPlanOpen('${ignisPlanSafeParam(placa)}','${grupo}','${ignisPlanSafeParam(t.id)}','${mes}')">Editar</button></div>
          <div class="p27-case-badges"><span class="p27-pill">${ignisPlanEsc(ignisPlanRegisterState(t))}</span>
            <span class="p27-pill ${ignisPlanActionState(t)==='realizada'?'p27-done':ignisPlanOverdue(t)?'p27-urgent':'p27-active'}">
              Ação ${ignisPlanEsc(ignisPlanActionState(t))}</span></div>
          <p>${ignisPlanEsc(t.descricaoCausa||t.observacao||'Sem descrição detalhada')}</p>
          <p><strong>Ação corretiva:</strong> ${ignisPlanEsc(t.acaoCorretiva||'Não especificada')}</p>
          <p><strong>Prazo:</strong> ${ignisPlanFmtDate(t.prazo)} ${ignisPlanOverdue(t)?' · PRAZO VENCIDO':''}</p>
          <details class="p27-history"><summary>Histórico de atualizações (${Array.isArray(t.historico)?t.historico.length:0})</summary>
            ${ignisPlanHistory(t)}</details>
        </article>`).join('')}</div>
      <div class="p27-editor-actions"><button type="button" class="p27-action p27-secondary" onclick="ignisPlanClose()">Fechar</button>
        <button type="button" class="p27-action" onclick="ignisPlanOpen('${ignisPlanSafeParam(placa)}','${grupo}','','${mes}')">Nova ocorrência</button></div>
    </section></div>`;
  document.body?.classList.add('p27-modal-open');
}

function ignisPlanFields(){
  const frm=document.querySelector('#p27-editor-root .p27-editor form, #p27-editor-root form.p27-editor');
  if(!frm)return;
  const categoria=frm.querySelector('[name="categoria"]')?.value||'';
  const acao=frm.querySelector('[name="acaoRealizada"]')?.value||'';
  const desc=frm.querySelector('[data-p27-description]');
  const question=frm.querySelector('[data-p27-action-question]');
  const proposal=frm.querySelector('[data-p27-proposed-action]');
  const info={
    'Problema mecânico':['Descreva o problema identificado *','O problema mecânico foi resolvido? *','Ação para corrigir o problema *'],
    'Dirigibilidade':['Descreva a necessidade de reciclagem *','A reciclagem do motorista/operador foi realizada? *','Treinamento ou reciclagem prevista *'],
    'Parâmetro':['Justificativa para alteração do parâmetro *','O parâmetro de consumo já foi alterado? *','Alteração de parâmetro proposta *']
  };
  const fields=info[categoria];
  if(desc)desc.textContent=fields?.[0]||'Descrição da causa *';
  if(question)question.textContent=fields?.[1]||'A ação corretiva foi realizada? *';
  if(proposal)proposal.textContent=fields?.[2]||'Ação corretiva planejada *';
  const due=frm.querySelector('[data-p27-deadline]'),done=frm.querySelector('[data-p27-action-date]');
  if(due){due.hidden=acao!=='nao';const input=due.querySelector('input');if(input)input.required=acao==='nao';}
  if(done){done.hidden=acao!=='sim';const input=done.querySelector('input');if(input)input.required=acao==='sim';}
  const warning=frm.querySelector('[data-p27-status-note]');
  if(warning)warning.textContent=acao==='sim'?'Ação informada como realizada. Guarde a data e evidência da conclusão.':
   acao==='nao'?'Ação pendente: informe o prazo obrigatório, mesmo que o registro esteja concluído.':
   'Informe se o problema foi resolvido, se a reciclagem ocorreu ou se o parâmetro foi alterado.';
}

function ignisPlanOpen(encoded,grupo,caseEncoded='',period=''){
  const placa=decodeURIComponent(encoded),mes=decodeURIComponent(period||window._ignisPlanMonth);
  const caseId=caseEncoded?decodeURIComponent(caseEncoded):'';
  const conf=ignisPlanConfig(),original=caseId?conf.tratativas.find(t=>t.id===caseId):null;
  if(caseId&&!original){showToast('Esta ocorrência não foi encontrada. Atualize a aba.','error');return;}
  const old=original||{},root=document.getElementById('p27-editor-root');if(!root)return;
  const known=['Problema mecânico','Dirigibilidade','Parâmetro'];
  const categoria=known.includes(old.categoria)?old.categoria:'';
  const action=ignisPlanActionState(old);
  const actionValue=action==='realizada'?'sim':action==='pendente'?'nao':'';
  const current=ignisPlanSummary(mes).find(x=>x.grupo===grupo&&x.placa===placa);
  const efficiency=Number.isFinite(current?.eficiencia)?current.eficiencia.toFixed(1)+'%':'sem apuração no mês';
  root.innerHTML=`<div class="p27-backdrop" onclick="if(event.target===this)ignisPlanClose()">
    <form class="p27-editor p27-wide" role="dialog" aria-modal="true" aria-label="${original?'Editar':'Registrar'} ocorrência"
      onsubmit="ignisPlanSubmit(event,'${ignisPlanSafeParam(placa)}','${grupo}','${ignisPlanSafeParam(caseId)}','${ignisPlanSafeParam(mes)}')">
      <div class="p27-editor-head"><div><strong>${original?'Editar ocorrência':'Nova ocorrência'} · ${ignisPlanEsc(placa)}</strong>
        <small>${ignisPlanMonthLabel(mes)} · eficiência ${efficiency}</small></div>
        <button type="button" onclick="ignisPlanClose()" aria-label="Fechar">×</button></div>
      ${original&&!categoria?`<p class="p27-legacy-note">Categoria anterior: ${ignisPlanEsc(old.categoria||'Não informada')}. Reclassifique para uma das três causas abaixo. O texto antigo será preservado.</p>`:''}
      <label>Causa identificada *
        <select name="categoria" required onchange="ignisPlanFields()">
          <option value="">Selecione uma causa</option>
          ${known.map(x=>`<option value="${x}" ${categoria===x?'selected':''}>${x}</option>`).join('')}
        </select></label>
      <label><span data-p27-description>Descrição da causa *</span>
        <textarea name="descricaoCausa" maxlength="1500" rows="3" required placeholder="Registre as evidências e a causa identificada">${ignisPlanEsc(old.descricaoCausa||old.observacao||'')}</textarea></label>
      <label><span data-p27-proposed-action>Ação corretiva planejada *</span>
        <textarea name="acaoCorretiva" maxlength="1200" rows="3" required placeholder="O que será feito para corrigir o desvio?">${ignisPlanEsc(old.acaoCorretiva||'')}</textarea></label>
      <div class="p27-form-grid">
        <label>Responsável pela tratativa *<input name="responsavel" maxlength="120" required value="${ignisPlanEsc(old.responsavel||'')}" placeholder="Instrutor / responsável"></label>
        <label><span data-p27-action-question>A ação corretiva foi realizada? *</span>
          <select name="acaoRealizada" required onchange="ignisPlanFields()">
            <option value="">Selecione</option><option value="sim" ${actionValue==='sim'?'selected':''}>Sim</option>
            <option value="nao" ${actionValue==='nao'?'selected':''}>Não, pendente</option>
          </select></label>
      </div>
      <div class="p27-form-grid">
        <label data-p27-deadline hidden>Prazo previsto para resolução *
          <input type="date" name="prazo" value="${ignisPlanEsc(old.prazo||'')}"></label>
        <label data-p27-action-date hidden>Data em que a ação foi realizada *
          <input type="date" name="dataAcao" value="${ignisPlanEsc(old.dataAcao||ignisPlanLocalDate())}"></label>
        <label>Situação do registro
          <select name="statusRegistro">
            ${['Registrada','Em acompanhamento','Concluída'].map(v=>`<option value="${v}" ${ignisPlanRegisterState(old)===v?'selected':''}>${v}</option>`).join('')}
          </select></label>
      </div>
      <p class="p27-action-note" data-p27-status-note></p>
      <label>Observações adicionais (opcional)
        <textarea name="observacao" rows="3" maxlength="1500" placeholder="Retornos do instrutor, evidências, novas orientações...">${ignisPlanEsc(old.observacao||'')}</textarea></label>
      ${original?`<details class="p27-history"><summary>Histórico de atualizações (${Array.isArray(old.historico)?old.historico.length:0})</summary>
        ${ignisPlanHistory(old)}</details>`:''}
      <div id="p27-save-state" class="p27-save-state" role="status" aria-live="polite"></div>
      <div class="p27-editor-actions">
        <button type="button" class="p27-action p27-secondary" onclick="ignisPlanClose()">Cancelar</button>
        <button type="submit" class="p27-action" id="p27-save-btn">Salvar ocorrência</button></div>
    </form></div>`;
  document.body?.classList.add('p27-modal-open');
  ignisPlanFields();
}

async function ignisPlanSubmit(ev,encoded,grupo,caseEncoded='',period=''){
  ev.preventDefault();
  const f=ev.currentTarget,form=new FormData(f),placa=decodeURIComponent(encoded),mes=decodeURIComponent(period||window._ignisPlanMonth);
  const conf=ignisPlanConfig(),id=caseEncoded?decodeURIComponent(caseEncoded):`${mes}|${grupo}|${placa}|${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const idx=conf.tratativas.findIndex(t=>t.id===id),old=idx>=0?conf.tratativas[idx]:null;
  if(caseEncoded&&!old){showToast('Ocorrência não encontrada.','error');return;}
  const before=JSON.stringify(conf.tratativas),now=new Date().toISOString();
  const categoria=String(form.get('categoria')||''),acao=String(form.get('acaoRealizada')||'');
  const responsavel=String(form.get('responsavel')||'').trim(),prazo=String(form.get('prazo')||''),dataAcao=String(form.get('dataAcao')||'');
  const descricaoCausa=String(form.get('descricaoCausa')||'').trim(),acaoCorretiva=String(form.get('acaoCorretiva')||'').trim();
  if(!['Problema mecânico','Dirigibilidade','Parâmetro'].includes(categoria)||!descricaoCausa||!acaoCorretiva||!responsavel||!['sim','nao'].includes(acao)){
    showToast('Preencha a causa, descrição, ação, responsável e confirmação.','error');return;
  }
  if(acao==='nao'&&!/^\d{4}-\d{2}-\d{2}$/.test(prazo)){showToast('Defina o prazo para a ação pendente.','error');return;}
  if(acao==='sim'&&!/^\d{4}-\d{2}-\d{2}$/.test(dataAcao)){showToast('Informe a data em que a ação foi realizada.','error');return;}
  const current=ignisPlanSummary(mes).find(x=>x.grupo===grupo&&x.placa===placa);
  const author=String(window._authUser?.nome||window._authUser?.id||'Usuário autenticado');
  const next={...old,id,placa,mes,grupo,
    operacao:old?.operacao||current?.operacao||'',categoria,descricaoCausa,acaoCorretiva,
    acaoRealizada:acao==='sim',responsavel,prazo:acao==='nao'?prazo:(old?.prazo||''),
    dataAcao:acao==='sim'?dataAcao:'',
    statusRegistro:String(form.get('statusRegistro')||'Registrada'),
    observacao:String(form.get('observacao')||'').trim(),
    eficienciaNoRegistro:old?.eficienciaNoRegistro??current?.eficiencia??null,
    metaNoRegistro:old?.metaNoRegistro??current?.meta??null,
    criadoEm:old?.criadoEm||now,atualizadoEm:now,atualizadoPor:author,
    historico:Array.isArray(old?.historico)?old.historico.slice():[]};
  next.status=next.statusRegistro==='Concluída'?'Concluído':next.statusRegistro==='Em acompanhamento'?'Em andamento':'Pendente';
  const differences=ignisPlanChangeRecord(old,next);
  if(!old||differences.length){
    next.historico.push({id:now+'-'+Math.random().toString(36).slice(2,8),quando:now,autor:author,
      tipo:old?'Atualização da ocorrência':'Abertura da ocorrência',alteracoes:differences});
  }
  if(idx>=0)conf.tratativas[idx]=next;else conf.tratativas.push(next);
  const btn=f.querySelector('#p27-save-btn'),note=f.querySelector('#p27-save-state');if(btn)btn.disabled=true;
  if(note)note.textContent='Confirmando no Firebase...';
  try{
    const ok=await saveState({mode:'light',keys:['planejamento2027'],immediate:true});
    if(!ok)throw new Error(window._lastFirebaseSaveError||'A gravação não foi confirmada pelo Firebase.');
    ignisPlanRender();
    showToast('Ocorrência salva e histórico atualizado.','success');
  }catch(err){
    conf.tratativas=JSON.parse(before);
    if(btn)btn.disabled=false;
    if(note)note.textContent='Salvamento não confirmado: '+String(err.message||err);
    showToast('A ocorrência não foi confirmada na nuvem.','error');
  }
}

async function ignisPlanMetaChange(grupo,value){
  const num=Number(value);if(!Number.isFinite(num)||num<1||num>150){showToast('Informe um percentual entre 1 e 150.','error');ignisPlanRender();return;}
  const c=ignisPlanConfig(),before=c.metas[grupo];c.metas[grupo]=num;
  if(!c.metasRevisadas||typeof c.metasRevisadas!=='object')c.metasRevisadas={};
  const oldStamp=c.metasRevisadas[grupo];c.metasRevisadas[grupo]=new Date().toISOString();
  try{const ok=await saveState({mode:'light',keys:['planejamento2027'],immediate:true});if(!ok)throw new Error('Firebase não confirmou a alteração.');showToast('Limite de performance atualizado.','success');}
  catch(e){c.metas[grupo]=before;if(oldStamp)c.metasRevisadas[grupo]=oldStamp;else delete c.metasRevisadas[grupo];showToast('Não foi possível confirmar a meta na nuvem.','error');}
  ignisPlanRender();
}

async function ignisPlanUpperChange(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=100||n>200){showToast('O limite superior precisa ser maior que 100% e no máximo 200%.','error');ignisPlanRender();return;}
  const c=ignisPlanConfig(),old=Number(c.limiteSuperior);
  c.limiteSuperior=n;
  try{
    const ok=await saveState({mode:'light',keys:['planejamento2027'],immediate:true});
    if(!ok)throw new Error('Firebase não confirmou a alteração.');
    showToast('Limite superior atualizado.','success');
  }catch(e){c.limiteSuperior=old;showToast('Não foi possível confirmar o limite superior na nuvem.','error');}
  ignisPlanRender();
}

window.addEventListener('ignis:data-ready',()=>{if(document.getElementById('page-planejamento')?.classList.contains('active'))ignisPlanRender();});
