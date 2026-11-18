'use strict';
// Pura e testável: esta autorização deve ser executada pelo servidor.
// Nenhuma role fornecida pelo navegador é confiável.
function accessFor({auth,permission}){
  if(!auth?.uid)return {authenticated:false,canRead:false,canCreate:false,canEditAll:false,canDelete:false,isMaster:false};
  const master=auth.token?.ignisMaster===true;
  const active=master||permission?.active===true;
  return {
    authenticated:true,isMaster:master,
    canRead:active,
    canCreate:active,
    canEditAll:active&&(master||permission?.editAll===true),
    canDelete:active&&(master||permission?.deleteCases===true)
  };
}
function canEditCase(access,auth,record){
  if(!access?.canRead||!auth?.uid||!record||record.deletedAt)return false;
  return access.canEditAll===true ||
    (typeof record.createdByUid==='string'&&record.createdByUid.length>0&&record.createdByUid===auth.uid);
}
function canRemoveCase(access,auth,record){
  return !!(auth?.uid&&access?.canDelete===true&&record&&!record.deletedAt);
}
module.exports={accessFor,canEditCase,canRemoveCase};
