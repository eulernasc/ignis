import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getAuth,setPersistence,browserSessionPersistence,signInWithEmailAndPassword,signOut,onAuthStateChanged}
 from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
const app=initializeApp({
  apiKey:'AIzaSyBdfrSrif-vThP3WqWJF76hhKE7FXGFpL0',
  authDomain:'fueltracker-adee5.firebaseapp.com',
  projectId:'fueltracker-adee5',
  appId:'1:488178201286:web:ecde03cc0488f4c3ffddc7'
},'ignis-secure-pilot');
const auth=getAuth(app),fn=getFunctions(app,'southamerica-east1');
const $=id=>document.getElementById(id);
const call=async(name,data={})=>(await httpsCallable(fn,name)(data)).data;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error)}
function view(login,privatePanel,master){
  $('login').hidden=!login;$('private').hidden=!privatePanel;$('master').hidden=!master;
}
let access=null;
async function refresh(){
  if(!access)return;
  $('results').replaceChildren();
  let cursor=null,count=0;
  do{
    const r=await call('ignisCasesList',{limit:80,cursor});
    for(const t of r.records||[]){
      const card=document.createElement('article');
      card.className='card';
      const title=document.createElement('strong');
      title.textContent=(t.placa||'Sem placa')+' · '+(t.categoria==='Outro'&&t.categoriaOutro?('Outro: '+t.categoriaOutro):t.categoria||'Sem causa');
      const meta=document.createElement('div');
      meta.className='small';
      meta.textContent=(t.grupo||'')+' · '+(t.acaoRealizada?'Concluída':'Pendente')+' · '+(t.responsavel||'Sem responsável');
      card.append(title,meta);$('results').append(card);count++;
    }
    cursor=r.nextCursor;
  }while(cursor&&count<400);
  if(!count)$('results').textContent='Nenhuma ocorrência migrada ainda.';
  status(count+' ocorrências consultadas pelo backend autenticado.');
}
onAuthStateChanged(auth,async user=>{
  access=null;
  if(!user){view(true,false,false);return;}
  try{
    const p=await call('ignisCasesAccess');
    access=p;view(false,true,p.isMaster===true);
    $('identity').textContent=(user.email||'Email não informado')+' · UID: '+p.uid;
    $('rights').textContent=p.isMaster?'ADM Master':
      ['leitura',p.canEditAll?'edição geral':'edição das próprias',p.canDelete?'exclusão':'sem exclusão'].join(' · ');
    status('Firebase Auth confirmado. Backend autorizou sua conta.');
  }catch(e){view(true,false,false);status('Não autorizado: '+(e.message||e),true);await signOut(auth);}
});
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;
  try{
    const data=new FormData(e.currentTarget);
    await setPersistence(auth,browserSessionPersistence);
    await signInWithEmailAndPassword(auth,String(data.get('email')).trim(),String(data.get('password')));
    e.currentTarget.reset();
  }catch(err){status('Falha ao entrar: '+(err.code||err.message),true)}
  finally{b.disabled=false}
});
$('logout').addEventListener('click',()=>signOut(auth).catch(e=>status(e.message,true)));
$('refresh').addEventListener('click',()=>refresh().catch(e=>status('Falha ao consultar: '+e.message,true)));
$('grant-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;
  try{
    if(access?.isMaster!==true)throw Error('Somente ADM Master pode conceder acesso.');
    const d=new FormData(e.currentTarget);
    const result=await call('ignisCaseGrantAccess',{
      email:String(d.get('email')||'').trim().toLowerCase(),
      active:d.has('active'),editAll:d.has('editAll'),deleteCases:d.has('deleteCases')
    });
    status('Permissões atualizadas no servidor para '+result.email+'.');
  }catch(err){status('Permissão não salva: '+(err.message||err),true)}
  finally{b.disabled=false}
});
