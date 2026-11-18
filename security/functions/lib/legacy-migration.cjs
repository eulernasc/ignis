'use strict';
const crypto=require('node:crypto');
const allowedGroups=new Set(['pesada','leve','maquinas']);
const allowedCats=new Set(['Problema mecânico','Dirigibilidade','Parâmetro','Outro']);
const allowedStatus=new Set(['Registrada','Em acompanhamento','Concluída']);
function txt(v,max=120){return String(v==null?'':v).trim().slice(0,max);}
function date(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function stamp(v,fallback){
  const d=new Date(v||'');
  return Number.isFinite(d.valueOf())?d.toISOString():fallback;
}
function legacyId(record,index){
  // Índice somente em registros que não possuem ID. Nunca inferir identidade por nome.
  const source=txt(record?.id,700)||JSON.stringify([index,record?.placa,record?.mes,record?.categoria,record?.criadoEm]);
  return 'legacy_'+crypto.createHash('sha256').update(source).digest('hex').slice(0,40);
}
function transform(record,index,now='2026-01-01T00:00:00.000Z'){
  if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Registro inválido '+index);
  const grupo=txt(record.grupo,40),placa=txt(record.placa,120).toUpperCase();
  if(!allowedGroups.has(grupo)||!placa)throw new Error('Ocorrência '+index+' sem grupo/placa válida');
  const category=txt(record.categoria,100);
  const categoria=allowedCats.has(category)?category:'Outro';
  const legacyOther=categoria==='Outro'?txt(record.categoriaOutro||category||'Causa legada sem classificação',120):'';
  const createdAt=stamp(record.criadoEm,now),updatedAt=stamp(record.atualizadoEm,createdAt);
  const performed=record.acaoRealizada===true||String(record.acaoRealizada).toLowerCase()==='sim';
  const author=txt(record.criadoPor||record.autor||record.historico?.[0]?.autor,120);
  const oldStatus=txt(record.statusRegistro,50);
  const data={
    legacyId:txt(record.id,700),
    legacySource:'fueltracker/dados_v4:planejamento2027.tratativas',
    placa,grupo,operacao:txt(record.operacao,180),
    categoria,categoriaOutro:legacyOther,
    descricaoCausa:txt(record.descricaoCausa||record.observacao||'Registro anterior sem descrição detalhada',1500),
    acaoCorretiva:txt(record.acaoCorretiva||'A definir',1200),
    responsavel:txt(record.responsavel||'Não informado',120),
    acaoRealizada:performed,prazo:date(record.prazo),dataAcao:date(record.dataAcao),
    statusRegistro:allowedStatus.has(oldStatus)?oldStatus:'Registrada',
    observacao:txt(record.observacao,1500),
    mes:/^\d{4}-\d{2}$/.test(String(record.mes||''))?String(record.mes):createdAt.slice(0,7),
    createdAt,updatedAt,createdByUid:null,updatedByUid:null,
    createdByLegacyName:author,version:1,deletedAt:null,
    legacyHistorico:Array.isArray(record.historico)?record.historico:[]
  };
  return {id:legacyId(record,index),data};
}
function prepare(records,now){
  if(!Array.isArray(records))throw new Error('Ocorrências devem ser uma lista.');
  const seen=new Set();
  return records.map((record,i)=>{
    const entry=transform(record,i,now);
    if(seen.has(entry.id))throw new Error('IDs legados duplicados. Revise antes de migrar: '+entry.id);
    seen.add(entry.id);
    return entry;
  });
}
module.exports={transform,legacyId,prepare};
