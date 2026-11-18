'use strict';
/* IGNIS | Backend de ocorrências isoladas. NÃO ativar antes da migração Auth+Rules.
 * Cloud Functions v2 usa tokens de Firebase Authentication verificados pelo SDK.
 * Custom claim ignisMaster é atribuída apenas por Admin SDK fora do navegador.
 */
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {accessFor,canEditCase,canRemoveCase}=require('./lib/occurrence-access.cjs');
if(!getApps().length)initializeApp();
const db=getFirestore();
const cases=db.collection('ignis_secure_cases');
const roles=db.collection('ignis_case_roles');
const settings={region:'southamerica-east1',maxInstances:10,memory:'256MiB',timeoutSeconds:30};
const safeText=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const isoDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';
const serialize=v=>{
  if(v&&typeof v.toDate==='function')return v.toDate().toISOString();
  if(Array.isArray(v))return v.map(serialize);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,serialize(x)]));
  return v;
};
function fail(code,message){throw new HttpsError(code,message);}
async function context(req){
  if(!req.auth?.uid)fail('unauthenticated','Entre com Firebase Authentication para acessar ocorrências.');
  const master=req.auth.token?.ignisMaster===true;
  const permission=master?null:(await roles.doc(req.auth.uid).get()).data();
  const access=accessFor({auth:req.auth,permission});
  if(!access.canRead)fail('permission-denied','Usuário sem acesso autorizado às ocorrências.');
  return access;
}
function caseId(input){
  const id=safeText(input,180);
  if(!/^[a-zA-Z0-9_-]{8,180}$/.test(id))fail('invalid-argument','Identificador inválido.');
  return id;
}
function makeFields(input,create=false){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid-argument','Dados inválidos.');
  const fields={
    placa:120,grupo:40,operacao:180,categoria:100,categoriaOutro:120,
    descricaoCausa:1500,acaoCorretiva:1200,responsavel:120,
    prazo:10,dataAcao:10,statusRegistro:50,observacao:1500
  };
  const allowed=new Set([...Object.keys(fields),'acaoRealizada']);
  for(const key of Object.keys(input)){
    if(!allowed.has(key))fail('invalid-argument','Campo não permitido: '+key);
    if(typeof input[key]!==(key==='acaoRealizada'?'boolean':'string'))fail('invalid-argument','Tipo incorreto em '+key);
    if(key!=='acaoRealizada'&&input[key].length>fields[key])fail('invalid-argument','Campo excede o limite: '+key);
  }
  const out={};
  for(const [key,max] of Object.entries(fields)){
    if(Object.prototype.hasOwnProperty.call(input,key))out[key]=safeText(input[key],max);
  }
  if(Object.prototype.hasOwnProperty.call(input,'acaoRealizada'))out.acaoRealizada=input.acaoRealizada;
  if('prazo'in out&&out.prazo&&!isoDate(out.prazo))fail('invalid-argument','Prazo inválido.');
  if('dataAcao'in out&&out.dataAcao&&!isoDate(out.dataAcao))fail('invalid-argument','Data de conclusão inválida.');
  if('categoria'in out&&!['Problema mecânico','Dirigibilidade','Parâmetro','Outro'].includes(out.categoria))
    fail('invalid-argument','Causa inválida.');
  if('grupo'in out&&!['pesada','leve','maquinas'].includes(out.grupo))fail('invalid-argument','Grupo inválido.');
  if('statusRegistro'in out&&!['Registrada','Em acompanhamento','Concluída'].includes(out.statusRegistro))fail('invalid-argument','Situação inválida.');
  if(create){
    if(out.categoria==='Outro'&&(!out.categoriaOutro||out.categoriaOutro.length<3))
      fail('invalid-argument','Especifique a outra causa.');
    for(const key of ['placa','grupo','categoria','descricaoCausa','acaoCorretiva','responsavel']){
      if(!out[key])fail('invalid-argument','Campo obrigatório: '+key);
    }
    if(out.acaoRealizada!==true&&!out.prazo)fail('invalid-argument','Informe o prazo da ação pendente.');
    if(out.acaoRealizada===true&&!out.dataAcao)fail('invalid-argument','Informe a data da ação realizada.');
  }
  return out;
}
exports.ignisCasesAccess=onCall(settings,async req=>{
  const p=await context(req);
  return {...p,uid:req.auth.uid};
});
exports.ignisCasesList=onCall(settings,async req=>{
  await context(req);
  const limit=Math.max(1,Math.min(150,Number(req.data?.limit)||80));
  let query=cases.orderBy('createdAt','desc').limit(limit);
  if(req.data?.cursor){
    const last=await cases.doc(caseId(req.data.cursor)).get();
    if(!last.exists)fail('invalid-argument','Cursor não encontrado.');
    query=query.startAfter(last);
  }
  const snap=await query.get();
  return {
    records:snap.docs.filter(d=>!d.data().deletedAt).map(d=>({id:d.id,...serialize(d.data())})),
    nextCursor:snap.docs.length===limit?snap.docs.at(-1).id:null
  };
});
exports.ignisCaseHistory=onCall(settings,async req=>{
  await context(req);
  const id=caseId(req.data?.id);
  const snap=await cases.doc(id).get();
  if(!snap.exists)fail('not-found','Ocorrência não encontrada.');
  const events=await snap.ref.collection('events').orderBy('at','desc').limit(200).get();
  return {events:events.docs.map(d=>({id:d.id,...serialize(d.data())}))};
});
exports.ignisCaseCreate=onCall(settings,async req=>{
  const p=await context(req);
  if(!p.canCreate)fail('permission-denied','Sem acesso para criar.');
  const fields=makeFields(req.data?.fields,true);
  const ref=cases.doc();
  const event=ref.collection('events').doc();
  const actor=req.auth.uid;
  const batch=db.batch();
  batch.create(ref,{...fields,createdByUid:actor,updatedByUid:actor,
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    mes:new Date().toISOString().slice(0,7),version:1,deletedAt:null});
  batch.create(event,{kind:'created',actorUid:actor,at:FieldValue.serverTimestamp(),changes:Object.keys(fields)});
  await batch.commit();
  return {id:ref.id};
});
exports.ignisCaseUpdate=onCall(settings,async req=>{
  const p=await context(req),id=caseId(req.data?.id);
  const fields=makeFields(req.data?.fields,false);
  if(!Object.keys(fields).length)fail('invalid-argument','Nenhum campo alterado.');
  if(!Number.isInteger(req.data?.expectedVersion)||req.data.expectedVersion<1)
    fail('invalid-argument','Versão de edição obrigatória.');
  const ref=cases.doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)fail('not-found','Ocorrência não encontrada.');
    const previous=snap.data();
    if(!canEditCase(p,req.auth,previous))fail('permission-denied','Só o autor ou editor autorizado pode alterar esta ocorrência.');
    if(previous.version!==req.data.expectedVersion)fail('aborted','A ocorrência foi alterada por outra pessoa. Recarregue.');
    const updated={...previous,...fields};
    if(updated.categoria==='Outro'&&(!String(updated.categoriaOutro||'').trim()||String(updated.categoriaOutro).trim().length<3))
      fail('invalid-argument','Especifique a outra causa.');
    if(updated.categoria!=='Outro'&&fields.categoria==='Outro')fail('invalid-argument','Causa inválida.');
    const diff={};
    for(const [key,value] of Object.entries(fields)){
      if(previous[key]!==value)diff[key]={before:previous[key]??null,after:value};
    }
    if(!Object.keys(diff).length)return {id,version:previous.version};
    const nextVersion=previous.version+1;
    tx.update(ref,{...fields,updatedAt:FieldValue.serverTimestamp(),updatedByUid:req.auth.uid,version:nextVersion});
    tx.create(ref.collection('events').doc(),{
      kind:'updated',actorUid:req.auth.uid,at:FieldValue.serverTimestamp(),changes:diff
    });
    return {id,version:nextVersion};
  });
});
exports.ignisCaseDelete=onCall(settings,async req=>{
  const p=await context(req),id=caseId(req.data?.id),ref=cases.doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)fail('not-found','Ocorrência não encontrada.');
    if(!canRemoveCase(p,req.auth,snap.data()))
      fail('permission-denied','Só o ADM Master ou quem possui permissão de excluir pode remover.');
    tx.update(ref,{deletedAt:FieldValue.serverTimestamp(),deletedByUid:req.auth.uid,
      updatedAt:FieldValue.serverTimestamp(),version:Number(snap.data().version||0)+1});
    tx.create(ref.collection('events').doc(),{kind:'deleted',actorUid:req.auth.uid,at:FieldValue.serverTimestamp()});
    return {id,deleted:true};
  });
});
exports.ignisCaseGrantAccess=onCall(settings,async req=>{
  if(!req.auth?.uid||req.auth.token?.ignisMaster!==true)
    fail('permission-denied','Somente o ADM Master concede permissões.');
  const uid=safeText(req.data?.uid,128);
  if(!/^[^/]{1,128}$/.test(uid))fail('invalid-argument','UID inválido.');
  // Só contas existentes e verificadas pelo Firebase Authentication podem receber acesso.
  await getAuth().getUser(uid);
  const active=req.data?.active===true;
  const editAll=active&&req.data?.editAll===true;
  const deleteCases=active&&req.data?.deleteCases===true;
  await roles.doc(uid).set({active,editAll,deleteCases,
    updatedByUid:req.auth.uid,updatedAt:FieldValue.serverTimestamp()});
  return {uid,active,editAll,deleteCases};
});
