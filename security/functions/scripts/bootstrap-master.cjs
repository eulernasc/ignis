'use strict';
// Requer credenciais ADMINISTRATIVAS via Application Default Credentials.
// Dry-run: node scripts/bootstrap-master.cjs --project fueltracker-adee5 --email admin@dominio.com
// Execute somente após verificar UID e email na saída.
const {initializeApp,getApps}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
function arg(k){const i=process.argv.indexOf(k);return i===-1?'':String(process.argv[i+1]||'');}
const project=arg('--project'),email=arg('--email').trim().toLowerCase(),execute=process.argv.includes('--execute');
if(!/^[a-z][a-z0-9-]{3,60}$/.test(project)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  throw new Error('Forneça --project e --email válidos.');
if(!getApps().length)initializeApp({projectId:project});
async function main(){
  const db=getFirestore();
  if(db.projectId!==project)throw new Error('Projeto de credenciais diferente do solicitado.');
  const auth=getAuth(),user=await auth.getUserByEmail(email);
  if(user.disabled)throw new Error('Conta desativada: não autorizar.');
  if(!user.emailVerified)throw new Error('Verifique o email no Firebase Authentication antes de promover o master.');
  process.stdout.write(JSON.stringify({project,email,uid:user.uid,existingClaims:user.customClaims||{},dryRun:!execute})+'\n');
  if(!execute)return;
  if(process.env.CONFIRM_FIREBASE_PROJECT!==project||
    process.env.CONFIRM_MASTER_UID!==user.uid||
    process.env.CONFIRM_MASTER_EMAIL!==email)
    throw new Error('Confirmações ambientais não conferem: nada alterado.');
  // Não sobrescrever claims de outros recursos.
  await auth.setCustomUserClaims(user.uid,{...(user.customClaims||{}),ignisMaster:true});
  process.stdout.write('ADM Master autorizado por custom claim: '+user.uid+'\n');
  process.stdout.write('Saia e entre novamente para renovar o token. Verifique acesso antes do corte.\n');
}
main().catch(err=>{console.error(err.message||err);process.exitCode=1;});
