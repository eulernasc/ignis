'use strict';
// Cria vínculo de conta SOMENTE com Admin SDK, depois de confirmar email do titular.
// Salva links de primeiro acesso em arquivo local privado, sem expor no GitHub ou logs.
// Dry-run: node scripts/enroll-legacy-user.cjs --project fueltracker-adee5 --login usuario --email email@dominio.com
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
function arg(key){const i=process.argv.indexOf(key);return i<0?'':String(process.argv[i+1]||'');}
const project=arg('--project'),login=arg('--login').trim().toLowerCase(),email=arg('--email').trim().toLowerCase();
const execute=process.argv.includes('--execute'),file=arg('--private-links-file');
if(!/^[a-z][a-z0-9-]{3,60}$/.test(project)||
   !/^[a-zA-Z0-9_.-]{2,80}$/.test(login)||
   !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  throw new Error('Forneça projeto, login legado e email reais.');
if(!getApps().length)initializeApp({projectId:project});
async function main(){
  const db=getFirestore(),auth=getAuth();
  if(db.projectId!==project)throw new Error('Credenciais do projeto errado.');
  const usersSnap=await db.doc('fueltracker/usuarios').get();
  const users=usersSnap.data()?._users||{};
  if(!users[login])throw new Error('Login legado não encontrado no documento oficial de usuários.');
  if(users[login].role==='adm')throw new Error('O master deve ser provisionado separadamente.');
  const linkRef=db.collection('ignis_case_user_links').doc(login);
  const linkSnap=await linkRef.get();
  if(linkSnap.exists&&linkSnap.data().email!==email)
    throw new Error('Login já vinculado a outro email. Revisão manual obrigatória.');
  let existing=null;
  try{existing=await auth.getUserByEmail(email);}
  catch(e){if(e.code!=='auth/user-not-found')throw e;}
  if(existing&&existing.disabled)throw new Error('Conta Firebase desativada.');
  if(existing&&linkSnap.exists&&linkSnap.data().uid!==existing.uid)
    throw new Error('UID do vínculo existente não corresponde ao usuário Firebase.');
  if(existing&&!linkSnap.exists)throw new Error('Email já cadastrado sem vínculo legado. Exige revisão manual para evitar roubo de conta.');
  process.stdout.write(JSON.stringify({project,legacyLogin:login,email,
    hasFirebaseAccount:!!existing,hasBinding:linkSnap.exists,dryRun:!execute})+'\n');
  if(!execute)return;
  if(process.env.CONFIRM_FIREBASE_PROJECT!==project||
     process.env.CONFIRM_LEGACY_LOGIN!==login||
     process.env.CONFIRM_NEW_EMAIL!==email)
    throw new Error('Confirmação de projeto, login e email obrigatória.');
  if(!file||!path.isAbsolute(file))throw new Error('Forneça --private-links-file ABSOLUTO para saída protegida.');
  // Exigir arquivo inexistente antes de modificar qualquer usuário.
  const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);
  try{
    const user=existing||await auth.createUser({
      email,displayName:String(users[login].nome||login).slice(0,80),
      password:crypto.randomBytes(48).toString('base64url'),emailVerified:false
    });
    if(!linkSnap.exists)await linkRef.create({
      legacyLogin:login,email,uid:user.uid,createdAt:FieldValue.serverTimestamp()
    });
    const roleRef=db.collection('ignis_case_roles').doc(user.uid);
    if(!(await roleRef.get()).exists)
      await roleRef.create({active:true,editAll:false,deleteCases:false,
        provisionedAt:FieldValue.serverTimestamp(),legacyLogin:login});
    const reset=await auth.generatePasswordResetLink(email);
    const verify=await auth.generateEmailVerificationLink(email);
    fs.writeFileSync(file,JSON.stringify({project,legacyLogin:login,email,uid:user.uid,
      privateMessage:'Envie links APENAS ao titular por canal confirmado. Apague após uso.',
      firstPasswordResetLink:reset,emailVerificationLink:verify},null,2),{mode:0o600});
    process.stdout.write('Conta vinculada. Links SENSÍVEIS gravados somente no arquivo protegido: '+file+'\n');
  }catch(e){throw new Error('Cadastro não concluído; revisar conta/links no Firebase antes de repetir. '+e.message);}
}
main().catch(e=>{console.error(e.message||e);process.exitCode=1;});
