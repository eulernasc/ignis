import {collection,doc,getDocFromServer,getDocsFromServer,query,where,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
export function mayReadCases(p){return !!p&&(p.role==='adm'||p.role==='admin'||p.perms?.includes('planejamento'));}
export function mayEditCase(p,t){return mayReadCases(p)&&(p.role==='adm'||p.perms?.includes('ocorrencias_editar_todas')||!!p.uid&&p.uid===t?._secureOwner);}
function unpack(x){const d=x.data();return {...d.record,_secureVersion:d.version,_secureOwner:d.createdByUid};}
async function key(id){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}
function clean(t){const {_secureVersion,_secureOwner,...record}=t;return JSON.parse(JSON.stringify(record));}
export function createCaseStore(db,auth){
  let ready=false;
  async function load(profile){
    ready=false;
    if(!mayReadCases(profile))return {ready:true,records:[]};
    const marker=await getDocFromServer(doc(db,'ignis_security','config'));
    if(!marker.exists()||marker.data().casesReady!==true)return {ready:false};
    const records=(await getDocsFromServer(query(collection(db,'ignis_cases'),where('deleted','==',false)))).docs.map(unpack);
    ready=true;return {ready:true,records};
  }
  async function apply(before,after,profile){
    if(!ready)throw new Error('Ocorrências protegidas ainda não estão disponíveis. Nenhuma alteração enviada.');
    if(!mayReadCases(profile)||auth.currentUser?.uid!==profile.uid)throw new Error('Sem autorização.');
    const old=new Map(before.map(t=>[t.id,t])),next=new Map(after.map(t=>[t.id,t]));
    if(old.size!==before.length||next.size!==after.length)throw new Error('Identificadores duplicados.');
    const changed=[...new Set([...old.keys(),...next.keys()])].filter(id=>JSON.stringify(old.get(id))!==JSON.stringify(next.get(id)));
    if(!changed.length)return after;
    if(changed.length!==1)throw new Error('Salve uma ocorrência por vez.');
    const id=changed[0],previous=old.get(id),incoming=next.get(id);
    if(!id||typeof id!=='string')throw new Error('Identificador inválido.');
    if(previous&&!incoming&&profile.role!=='adm')throw new Error('Somente ADM Master pode excluir.');
    if(previous&&incoming&&!mayEditCase(profile,previous))throw new Error('Somente o autor ou editor autorizado pode editar.');
    const ref=doc(db,'ignis_cases',await key(id));
    const saved=await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);
      if(!!previous!==snap.exists())throw new Error('A ocorrência mudou. Atualize a página.');
      const current=snap.exists()?snap.data():null;
      if(current&&(current.deleted||current.version!==previous._secureVersion))throw new Error('A ocorrência mudou. Atualize a página.');
      if(!incoming){tx.update(ref,{deleted:true,updatedByUid:profile.uid,version:current.version+1,updatedAt:serverTimestamp()});return null;}
      const record=clean(incoming),past=current?.record?.historico||[];
      if(!Array.isArray(past))throw new Error('Histórico inválido; procure o administrador.');
      const events=Array.isArray(record.historico)?record.historico:[];
      const event=events.length>past.length?events.at(-1):{id:crypto.randomUUID(),tipo:current?'Atualização da ocorrência':'Abertura da ocorrência',alteracoes:[]};
      record.historico=[...past,{...event,autor:profile.nome,autorUid:profile.uid,quando:new Date().toISOString()}];
      record.atualizadoPor=profile.nome;
      const version=(current?.version||0)+1,owner=current?current.createdByUid:profile.uid;
      tx.set(ref,{record,createdByUid:owner,updatedByUid:profile.uid,version,deleted:false,updatedAt:serverTimestamp()});
      return {...record,_secureVersion:version,_secureOwner:owner};
    });
    return after.map(t=>t.id===id?saved:t).filter(Boolean);
  }
  return {load,apply,canEdit:(p,t)=>ready&&mayEditCase(p,t),isReady:()=>ready};
}
