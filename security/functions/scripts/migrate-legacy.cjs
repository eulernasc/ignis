'use strict';
// Migração SOMENTE pelo operador autenticado com ADC/Admin SDK, nunca no navegador.
// Uso: node scripts/migrate-legacy.cjs --project fueltracker-adee5
// Execução requer --execute, --backup /caminho/seguro.json e CONFIRM_*.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore,Timestamp,FieldValue}=require('firebase-admin/firestore');
const {prepare}=require('../lib/legacy-migration.cjs');
function arg(name){const i=process.argv.indexOf(name);return i<0?'':String(process.argv[i+1]||'');}
const project=arg('--project'),execute=process.argv.includes('--execute');
if(!/^[a-z][a-z0-9-]{3,60}$/.test(project))throw new Error('Informe --project com ID exato do projeto Firebase.');
if(!getApps().length)initializeApp({projectId:project});
const db=getFirestore();
async function main(){
  if(db.projectId!==project)throw new Error('Credenciais conectadas ao projeto inesperado: '+db.projectId);
  const snap=await db.doc('fueltracker/dados_v4').get();
  if(!snap.exists)throw new Error('Manifesto dados_v4 não encontrado. Não usar um fallback às cegas.');
  const source=snap.data()?.planejamento2027?.tratativas;
  if(!Array.isArray(source))throw new Error('Campo planejamento2027.tratativas ausente.');
  if(!source.length)throw new Error('Nenhuma ocorrência encontrada; migração vazia não é aceita.');
  const hash=crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const records=prepare(source,new Date().toISOString());
  const statuses={source:source.length,already:0,toCreate:0};
  const missing=[];
  for(let i=0;i<records.length;i+=100){
    const part=records.slice(i,i+100);
    const snapshots=await db.getAll(...part.map(x=>db.collection('ignis_secure_cases').doc(x.id)));
    for(let j=0;j<snapshots.length;j++){
      if(snapshots[j].exists){
        if(snapshots[j].data()?.legacyId!==part[j].data.legacyId)
          throw new Error('Conflito: ocorrência com ID gerado já existe e não corresponde ao legado.');
        statuses.already++;
      }else{statuses.toCreate++;missing.push(part[j]);}
    }
  }
  process.stdout.write(JSON.stringify({project,collection:'ignis_secure_cases',
    original:statuses,sourceSha256:hash,mode:execute?'execute':'dry-run'})+'\n');
  if(!execute)return;
  if(process.env.CONFIRM_FIREBASE_PROJECT!==project ||
    process.env.CONFIRM_CASE_COUNT!==String(source.length) ||
    process.env.CONFIRM_CASE_SHA256!==hash)
    throw new Error('Confirmações obrigatórias divergentes. Revise dry-run antes de executar.');
  const backup=arg('--backup');
  if(!backup||!path.isAbsolute(backup))throw new Error('Forneça --backup com caminho ABSOLUTO, privado e inexistente.');
  const payload=JSON.stringify({source:'fueltracker/dados_v4:planejamento2027.tratativas',
    project,count:source.length,sha256:hash,createdAt:new Date().toISOString(),records:source},null,2);
  fs.writeFileSync(backup,payload,{mode:0o600,flag:'wx'});
  process.stdout.write('Backup privado criado; não publique no GitHub: '+backup+'\n');
  if(!missing.length){process.stdout.write('Nada a gravar. Migração já realizada.\n');return;}
  for(let i=0;i<missing.length;i+=200){
    const batch=db.batch();
    const chunk=missing.slice(i,i+200);
    for(const {id,data} of chunk){
      if(Buffer.byteLength(JSON.stringify(data))>850000)
        throw new Error('Ocorrência maior que 850KB; rever anexo/histórico de '+id);
      const ref=db.collection('ignis_secure_cases').doc(id);
      batch.create(ref,{...data,
        createdAt:Timestamp.fromDate(new Date(data.createdAt)),
        updatedAt:Timestamp.fromDate(new Date(data.updatedAt))});
      batch.create(ref.collection('events').doc('legacy_import'),{
        kind:'legacy-imported',actorUid:null,at:FieldValue.serverTimestamp(),
        note:'Importação administrativa, autoria UID ainda não verificada',legacyId:data.legacyId
      });
    }
    await batch.commit();
    process.stdout.write('Importadas '+Math.min(i+chunk.length,missing.length)+' de '+missing.length+'\n');
  }
  process.stdout.write('Migração concluída sem modificar os registros originais.\n');
}
main().catch(e=>{console.error(e.message||e);process.exitCode=1;});
