/* IGNIS · Planejamento 2027 — tratativas por placa, metas configuráveis e filtros mensais.
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
  for(let i=1;i<=12;i++)months.add('2027-'+String(i).padStart(2,'0'));
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
    const limite=Number(conf.metas[x.grupo]);
    return {...x,media,meta,eficiencia,limite,unidade:kmL?'km/L':'L/h',atividadeUnidade:kmL?'km':'h',abaixo:eficiencia!==null&&eficiencia<limite};
  });
  return all;
}

function ignisPlanRender(){
  const root=document.getElementById('page-planejamento');if(!root)return;
  const conf=ignisPlanConfig(), months=ignisPlanMonthChoices();
  if(!window._ignisPlanMonth || !months.includes(window._ignisPlanMonth)){
    const hist=months.filter(m=>m!=='2027-01'&&m!=='2027-02');
    const available=months.filter(m=>Object.values(state.semanas||{}).some(p=>String(p?.dataFim||p?.dataIni||'').startsWith(m))||state.abastecimentos?.some(a=>ignisPlanMonthOf(a)===m));
    window._ignisPlanMonth=available[0]||months[0]||'2027-01';
  }
  const mon=window._ignisPlanMonth,groupFilter=window._ignisPlanGroup||'',statusFilter=window._ignisPlanStatus||'',q=String(window._ignisPlanQuery||'').trim().toUpperCase();
  const list=ignisPlanSummary(mon),byId=new Map(conf.tratativas.filter(t=>t.mes===mon).map(t=>[t.id,t]));
  const rows=list.filter(x=>x.abaixo||byId.has(mon+'|'+x.grupo+'|'+x.placa));
  for(const t of conf.tratativas.filter(t=>t.mes===mon)){
    if(!rows.some(x=>x.grupo===t.grupo&&x.placa===t.placa))rows.push({placa:t.placa,grupo:t.grupo,operacao:t.operacao||'',media:0,meta:0,eficiencia:null,limite:conf.metas[t.grupo]||0,unidade:t.grupo==='maquinas'?'L/h':'km/L',atividade:0,atividadeUnidade:t.grupo==='maquinas'?'h':'km',abaixo:false,semDados:true});
  }
  rows.sort((a,b)=>(a.eficiencia??999)-(b.eficiencia??999)||a.placa.localeCompare(b.placa));
  const pending=rows.filter(x=>!byId.has(mon+'|'+x.grupo+'|'+x.placa)).length;
  const open=conf.tratativas.filter(t=>t.mes===mon&&t.status!=='Resolvido').length;
  const resolved=conf.tratativas.filter(t=>t.mes===mon&&t.status==='Resolvido').length;
  const seen=rows.filter(x=>{
    const t=byId.get(mon+'|'+x.grupo+'|'+x.placa);
    if(groupFilter&&groupFilter!==x.grupo)return false;
    if(statusFilter==='pendente'&&t)return false;
    if(statusFilter==='andamento'&&(!t||t.status!=='Em andamento'))return false;
    if(statusFilter==='resolvido'&&(!t||t.status!=='Resolvido'))return false;
    return !q||(x.placa+' '+x.operacao+' '+(t?.responsavel||'')).toUpperCase().includes(q);
  });
  const label={pesada:'Frota pesada',leve:'Frota leve',maquinas:'Máquinas e tratores'};
  const format=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  root.innerHTML=`
  <div class="page-header"><div class="page-header-title"><div class="page-title">Planejamento 2027</div><div class="page-sub">Tratativas de baixa eficiência por frota, máquina e período</div></div></div>
  <div class="p27-top">
   <div class="p27-stat"><span>Ativos abaixo do limite</span><strong>${list.filter(x=>x.abaixo).length}</strong><small>No mês selecionado</small></div>
   <div class="p27-stat"><span>Aguardando tratativa</span><strong>${pending}</strong><small>Sem registro de ação</small></div>
   <div class="p27-stat"><span>Em acompanhamento</span><strong>${open}</strong><small>Tratativas não resolvidas</small></div>
   <div class="p27-stat"><span>Resolvidos</span><strong>${resolved}</strong><small>Tratativas concluídas</small></div>
  </div>
  <div class="p27-panel"><div class="p27-panel-head"><div><strong>Metas de eficiência mínima</strong><p>Valores abaixo do percentual definido entram no acompanhamento.</p></div></div>
   <div class="p27-metas">
    ${Object.entries(label).map(([key,name])=>`<label><span>${name}</span><div><input type="number" min="1" max="150" step="0.5" value="${Number(conf.metas[key])}" onchange="ignisPlanMetaChange('${key}',this.value)"><em>%</em></div></label>`).join('')}
   </div>
  </div>
  <div class="p27-panel"><div class="p27-panel-head"><div><strong>Acompanhamento por veículo</strong><p>Indicadores apurados a partir dos abastecimentos importados. Clique em Registrar/Editar para acompanhar cada caso.</p></div></div>
   <div class="p27-filters">
    <label>Período<select id="p27-month" onchange="window._ignisPlanMonth=this.value;ignisPlanRender()">${months.map(m=>`<option value="${m}" ${m===mon?'selected':''}>${ignisPlanMonthLabel(m)}</option>`).join('')}</select></label>
    <label>Grupo<select onchange="window._ignisPlanGroup=this.value;ignisPlanRender()"><option value="">Todos</option>${Object.entries(label).map(([k,l])=>`<option value="${k}" ${groupFilter===k?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Status<select onchange="window._ignisPlanStatus=this.value;ignisPlanRender()"><option value="">Todos</option><option value="pendente" ${statusFilter==='pendente'?'selected':''}>Sem tratativa</option><option value="andamento" ${statusFilter==='andamento'?'selected':''}>Em andamento</option><option value="resolvido" ${statusFilter==='resolvido'?'selected':''}>Resolvidos</option></select></label>
    <label>Busca<input id="p27-search" placeholder="Placa, operação ou responsável" value="${ignisPlanEsc(window._ignisPlanQuery||'')}" oninput="ignisPlanSearch(this.value)"></label>
   </div>
   <div class="p27-table-wrap"><table class="p27-table"><thead><tr><th>Placa / operação</th><th>Grupo</th><th>Real / meta</th><th>Eficiência</th><th>Limite</th><th>Status / motivo</th><th>Ação</th></tr></thead><tbody>
   ${seen.length?seen.map(x=>{const id=mon+'|'+x.grupo+'|'+x.placa,t=byId.get(id);const ef=x.eficiencia===null?'—':format(x.eficiencia)+'%';
   return `<tr><td><strong>${ignisPlanEsc(x.placa)}</strong><small>${ignisPlanEsc(x.operacao||'Sem operação')}</small></td>
    <td>${label[x.grupo]}</td><td>${x.semDados?'Sem dados atuais':`${format(x.media)} / ${x.meta>0?format(x.meta):'—'} ${x.unidade}`}<small>${x.semDados?'':format(x.atividade)+' '+x.atividadeUnidade+' no período'}</small></td>
    <td><strong class="${x.eficiencia!==null&&x.eficiencia<x.limite?'p27-bad':'p27-good'}">${ef}</strong></td><td>${format(x.limite)}%</td>
    <td><span class="p27-pill ${!t?'p27-pending':t.status==='Resolvido'?'p27-done':'p27-active'}">${!t?'Sem tratativa':ignisPlanEsc(t.status)}</span><small>${ignisPlanEsc(t?.categoria||'')}</small></td>
    <td><button class="p27-action" onclick="ignisPlanOpen('${encodeURIComponent(x.placa)}','${x.grupo}')">${t?'Editar':'Registrar'}</button></td></tr>`;}).join(''):`<tr><td colspan="7" class="p27-empty">${list.length?'Nenhum veículo corresponde aos filtros.':'Nenhum dado de abastecimento encontrado neste mês. Selecione outro período ou importe os relatórios.'}</td></tr>`}
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
window.addEventListener('ignis:data-ready',()=>{if(document.getElementById('page-planejamento')?.classList.contains('active'))ignisPlanRender();});
