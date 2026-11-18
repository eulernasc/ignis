'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {transform,legacyId,prepare}=require('../lib/legacy-migration.cjs');
const normal={id:'2026-11|maquinas|MAQ0143|a1',placa:'MAQ0143',grupo:'maquinas',operacao:'CENIBRA',
 mes:'2026-11',categoria:'Problema mecânico',descricaoCausa:'Correia',acaoRealizada:false,prazo:'2026-12-20',
 historico:[{tipo:'Abertura da ocorrência',autor:'Operador José',quando:'2026-11-18T12:00:00Z'}]};
test('migração é idempotente',()=>assert.equal(legacyId(normal,0),legacyId(normal,70)));
test('não presume a autoria com base no nome',()=>{
 const {data}=transform(normal,0);
 assert.equal(data.createdByUid,null);
 assert.equal(data.createdByLegacyName,'Operador José');
 assert.deepEqual(data.legacyHistorico,normal.historico);
 assert.equal(data.mes,'2026-11');
 assert.equal(data.prazo,'2026-12-20');
});
test('histórico de outra causa é preservado',()=>{
 const {data}=transform({...normal,categoria:'Outro',categoriaOutro:'Condição operacional específica'},0);
 assert.equal(data.categoria,'Outro');
 assert.equal(data.categoriaOutro,'Condição operacional específica');
});
test('categorias antigas desconhecidas ficam legíveis como Outra',()=>{
 const {data}=transform({...normal,categoria:'Vazamento externo'},0);
 assert.equal(data.categoria,'Outro');
 assert.equal(data.categoriaOutro,'Vazamento externo');
});
test('detectar duplicidade de ID antes de migrar',()=>assert.throws(()=>prepare([normal,{...normal}]),/duplicados/));
test('sem placa ou grupo válido impede migração',()=>assert.throws(()=>transform({...normal,placa:''},0),/sem grupo/));
test('não descarta ausência de data legada',()=>{
 const {data}=transform({...normal,criadoEm:'invalida',prazo:''},0,'2026-11-18T12:00:00.000Z');
 assert.equal(data.createdAt,'2026-11-18T12:00:00.000Z');
 assert.equal(data.prazo,'');
});
