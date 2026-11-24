import {getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, signOut}
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {doc, getDocFromServer}
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export async function loginHash(login){
  const value=String(login||'').trim().toLowerCase();
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}

export function createIgnisAuth(app,db){
  const auth=getAuth(app);
  async function loadProfile(user){
    if(!user)throw new Error('Autenticação necessária.');
    const snap=await getDocFromServer(doc(db,'ignis_profiles',user.uid));
    const p=snap.exists()?snap.data():null;
    if(!p||p.active!==true||!p.login||!['adm','admin','usuario'].includes(p.role)){
      throw new Error('Conta sem acesso ativo ao IGNIS.');
    }
    return {id:p.login,nome:p.nome||p.login,role:p.role,perms:Array.isArray(p.perms)?p.perms:[],uid:user.uid};
  }
  async function login(username,password,emailHint=''){
    const normalized=String(username||'').trim().toLowerCase();
    if(!normalized||!password)throw new Error('Informe usuário e senha.');
    const hash=await loginHash(normalized);
    const alias=await getDocFromServer(doc(db,'ignis_auth_aliases',hash));
    const email=alias.exists()?String(alias.data().email||''):String(emailHint|| (normalized.includes('@')?normalized:'')).trim();
    if(!email){const e=new Error('Esta conta usa e-mail próprio. Informe o e-mail já cadastrado no Firebase.');e.code='IGNIS_EMAIL_REQUIRED';throw e;}
    await setPersistence(auth,browserSessionPersistence);
    const credential=await signInWithEmailAndPassword(auth,email,password);
    try{
      const profile=await loadProfile(credential.user);
      if(profile.id!==normalized||!credential.user.uid.startsWith('ignis_')||!hash.startsWith(credential.user.uid.slice(6)))throw new Error('O login não corresponde à conta autenticada.');
      return profile;
    }catch(e){await signOut(auth);throw e;}
  }
  async function restore(){
    await auth.authStateReady();
    if(!auth.currentUser)return null;
    try{return await loadProfile(auth.currentUser);}
    catch(e){await signOut(auth);throw e;}
  }
  return {login,restore,logout:()=>signOut(auth),auth};
}
