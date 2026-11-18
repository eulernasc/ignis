'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {accessFor,canEditCase,canRemoveCase}=require('../lib/occurrence-access.cjs');
const me={uid:'user-a',token:{}},other={uid:'user-b',token:{}};
const master={uid:'master-uid',token:{ignisMaster:true}};
const original={createdByUid:'user-a',deletedAt:null};
test('usuário sem autenticação não acessa',()=>{
  const p=accessFor({auth:null,permission:{active:true,editAll:true,deleteCases:true}});
  assert.equal(p.canRead,false);assert.equal(p.canDelete,false);
});
test('usuário sem ativação no servidor não acessa',()=>{
  const p=accessFor({auth:me,permission:null});
  assert.equal(p.canRead,false);
  assert.equal(canEditCase(p,me,original),false);
});
test('autor só edita o próprio registro',()=>{
  const p=accessFor({auth:me,permission:{active:true}});
  assert.equal(canEditCase(p,me,original),true);
  assert.equal(canRemoveCase(p,me,original),false);
  assert.equal(canEditCase(p,me,{createdByUid:'user-b'}),false);
});
test('editor delegado pode editar registros de terceiros sem poder excluir',()=>{
  const p=accessFor({auth:other,permission:{active:true,editAll:true,deleteCases:false}});
  assert.equal(canEditCase(p,other,original),true);
  assert.equal(canRemoveCase(p,other,original),false);
});
test('permissão de exclusão independente da edição',()=>{
  const p=accessFor({auth:other,permission:{active:true,editAll:false,deleteCases:true}});
  assert.equal(canEditCase(p,other,original),false);
  assert.equal(canRemoveCase(p,other,original),true);
});
test('master acessa independentemente da ACL',()=>{
  const p=accessFor({auth:master,permission:null});
  assert.equal(p.isMaster,true);
  assert.equal(canEditCase(p,master,original),true);
  assert.equal(canRemoveCase(p,master,original),true);
});
test('legado sem owner só pode ser editado por master ou delegado',()=>{
  const p=accessFor({auth:me,permission:{active:true}});
  assert.equal(canEditCase(p,me,{createdByUid:null}),false);
});
test('registro excluído não é editável nem excluído novamente',()=>{
  const p=accessFor({auth:master});
  const deleted={...original,deletedAt:'2026-11-18T15:00:00Z'};
  assert.equal(canEditCase(p,master,deleted),false);
  assert.equal(canRemoveCase(p,master,deleted),false);
});
