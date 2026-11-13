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
function ignisPlanOverdue(t,today=ignisPlanLocalDate()){
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
          <td><span class="p27-pill ${vencidos?'p27-urgent':pendentes?'p27-active':total?'p27-done':'p27-pending'}">
            ${total?total+' ocorrência(s)':'Sem registro'}</span>
            ${total?`<small>${pendentes} pendente(s)${vencidos?' · '+vencidos+' vencida(s)':''}</small>`:''}</td>
          <td><div class="p27-actions">
            ${total?`<button class="p27-action p27-secondary" onclick="ignisPlanList('${id}','${x.grupo}','${mon}')">Ver ${total}</button>`:''}
            <button class="p27-action" onclick="ignisPlanOpen('${id}','${x.grupo}','', '${mon}')">Nova ocorrência</button>
          </div></td></tr>`;
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

function ignisPlanOpen(encoded,grupo){
  const placa=decodeURIComponent(encoded),mes=window._ignisPlanMonth,id=mes+'|'+grupo+'|'+placa,c=ignisPlanConfig();
  const old=c.tratativas.find(t=>t.id===id)||{};
  const root=document.getElementById('p27-editor-root');if(!root)return;
  const date=String(old.prazo||'');
  root.innerHTML=`<div class="p27-backdrop" onclick="if(event.target===this)ignisPlanClose()">
    <form class="p27-editor" onsubmit="ignisPlanSubmit(event,'${encodeURIComponent(placa)}','${grupo}')">
      <div class="p27-editor-head"><div><strong>Tratativa • ${ignisPlanEsc(placa)}</strong><small>${ignisPlanMonthLabel(mes)}</small></div><button type="button" onclick="ignisPlanClose()" aria-label="Fechar">×</button></div>
      <label>Motivo identificado<select name="categoria" required><option value="">Selecione o motivo</option>${['Problema mecânico','Treinamento','Indisciplina','Em investigação','Outro'].map(c=>`<option value="${c}" ${old.categoria===c?'selected':''}>${c}</option>`).join('')}</select></label>
      <label>Responsável<input name="responsavel" maxlength="120" value="${ignisPlanEsc(old.responsavel||'')}" placeholder="Nome do responsável" required></label>
      <div class="p27-form-grid"><label>Prazo de resolução<input type="date" name="prazo" value="${ignisPlanEsc(date)}" required></label>
      <label>Status<select name="status"><option ${old.status==='Pendente'?'selected':''}>Pendente</option><option ${old.status==='Em andamento'?'selected':''}>Em andamento</option><option ${old.status==='Resolvido'?'selected':''}>Resolvido</option></select></label></div>
      <label>Observações e ações<textarea name="observacao" rows="4" maxlength="1500" placeholder="Descreva o problema, ação combinada, evidências e próximos passos">${ignisPlanEsc(old.observacao||'')}</textarea></label>
      <div id="p27-save-state" class="p27-save-state"></div><div class="p27-editor-actions"><button type="button" class="p27-action p27-secondary" onclick="ignisPlanClose()">Cancelar</button><button type="submit" class="p27-action" id="p27-save-btn">Salvar tratativa</button></div>
    </form></div>`;
  root.querySelector('select[name="categoria"]')?.focus();
}

function ignisPlanClose(){const e=document.getElementById('p27-editor-root');if(e)e.innerHTML='';}

async function ignisPlanSubmit(ev,encoded,grupo){
  ev.preventDefault();const f=ev.currentTarget,form=new FormData(f),placa=decodeURIComponent(encoded),mes=window._ignisPlanMonth;
  const c=ignisPlanConfig();const id=mes+'|'+grupo+'|'+placa,idx=c.tratativas.findIndex(x=>x.id===id);
  const old=idx>=0?c.tratativas[idx]:null;const before=JSON.stringify(c.tratativas);
  const next={...old,id,placa,mes,grupo,categoria:String(form.get('categoria')||''),responsavel:String(form.get('responsavel')||'').trim(),prazo:String(form.get('prazo')||''),status:String(form.get('status')||'Pendente'),observacao:String(form.get('observacao')||'').trim(),criadoEm:old?.criadoEm||new Date().toISOString(),atualizadoEm:new Date().toISOString(),atualizadoPor:String(window._authUser?.nome||window._authUser?.id||'')};
  if(!next.categoria||!next.responsavel||!next.prazo)return;
  if(idx>=0)c.tratativas[idx]=next;else c.tratativas.push(next);
  const btn=f.querySelector('#p27-save-btn'),note=f.querySelector('#p27-save-state');if(btn)btn.disabled=true;if(note)note.textContent='Confirmando no Firebase...';
  try{
    const ok=await saveState({mode:'light',immediate:true});
    if(!ok)throw new Error(window._lastFirebaseSaveError||'A gravação não foi confirmada pelo Firebase.');
    ignisPlanRender();showToast('Tratativa salva no Firebase.','success');
  }catch(err){
    c.tratativas=JSON.parse(before);if(btn)btn.disabled=false;
    if(note)note.textContent='Não foi possível confirmar o salvamento: '+String(err.message||err);
    showToast('A tratativa não foi confirmada na nuvem.','error');
  }
}

async function ignisPlanMetaChange(grupo,value){
  const num=Number(value);if(!Number.isFinite(num)||num<1||num>150){showToast('Informe um percentual entre 1 e 150.','error');ignisPlanRender();return;}
  const c=ignisPlanConfig(),before=c.metas[grupo];c.metas[grupo]=num;
  if(!c.metasRevisadas||typeof c.metasRevisadas!=='object')c.metasRevisadas={};
  const oldStamp=c.metasRevisadas[grupo];c.metasRevisadas[grupo]=new Date().toISOString();
  try{const ok=await saveState({mode:'light',immediate:true});if(!ok)throw new Error('Firebase não confirmou a alteração.');showToast('Limite de performance atualizado.','success');}
  catch(e){c.metas[grupo]=before;if(oldStamp)c.metasRevisadas[grupo]=oldStamp;else delete c.metasRevisadas[grupo];showToast('Não foi possível confirmar a meta na nuvem.','error');}
  ignisPlanRender();
}

async function ignisPlanUpperChange(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=100||n>200){showToast('O limite superior precisa ser maior que 100% e no máximo 200%.','error');ignisPlanRender();return;}
  const c=ignisPlanConfig(),old=Number(c.limiteSuperior);
  c.limiteSuperior=n;
  try{
    const ok=await saveState({mode:'light',immediate:true});
    if(!ok)throw new Error('Firebase não confirmou a alteração.');
    showToast('Limite superior atualizado.','success');
  }catch(e){c.limiteSuperior=old;showToast('Não foi possível confirmar o limite superior na nuvem.','error');}
  ignisPlanRender();
}

window.addEventListener('ignis:data-ready',()=>{if(document.getElementById('page-planejamento')?.classList.contains('active'))ignisPlanRender();});
