'use strict';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import os from 'node:os';

const source=fs.readFileSync(path.resolve('index.html'),'utf8');
const open=source.indexOf('<script type="module" async>');
const start=source.indexOf('\n',open);
const close=source.indexOf('</script>',start);
assert.ok(open>=0&&start>open&&close>start,'Módulo Firebase não encontrado');
const moduleSource=source.slice(start,close);
const temp=path.join(os.tmpdir(),'ignis-firebase-sync-test-'+process.pid+'.mjs');
try{
  fs.writeFileSync(temp,moduleSource);
  execFileSync(process.execPath,['--check',temp],{stdio:'pipe'});
}finally{try{fs.unlinkSync(temp);}catch{}}

assert.match(moduleSource,/memoryLocalCache\(\)/,'Fallback de quota ausente');
assert.match(moduleSource,/fbLocalStorageHasHeadroom/,'Sonda de quota ausente');
assert.match(moduleSource,/finally\(\(\)=>clearTimeout\(timer\)\)/,'Timers não são cancelados');
assert.match(moduleSource,/ignis:firebase-core-ready/,'Prévia dos indicadores ausente');
assert.match(source,/if\(window\._dadosCarregados!==true&&!options\?\.recovery&&!options\?\.internalLoad\)/,'Bloqueio de gravações incompletas ausente');
assert.match(source,/if \(!window\._dadosCarregados\)/,'Bloqueio de importação incompleta ausente');

const begin=moduleSource.indexOf('let fbChunkBatchQueriesAllowed=true;');
const end=moduleSource.indexOf('\nfunction fbDeleteChunkSeries',begin);
assert.ok(begin>0&&end>begin,'Função de leitura de chunks não encontrada');
const readSource=moduleSource.slice(begin,end);

async function run({count=25,cache=5,denyBatch=false,invalid=-1,missing=-1}={}){
  const history={batched:0,individual:0,cache:0,progress:[]};
  const prefix='v4_abast',version='test';
  const snapshots=Array.from({length:count},(_,i)=>({
    id:prefix+'_'+version+'_'+i,
    exists:()=>i!==missing,
    data:()=>({chunk:i,version:i===invalid?'old':version,registros:[{i}]})
  }));
  const find=id=>snapshots.find(s=>s.id===id);
  const context=vm.createContext({
    Array,Map,Promise,Number,String,Date,FB_MAX_CHUNKS:800,console:{info(){},warn(){}},
    fbIsMobileDevice:()=>false,
    fbEmitProgress:(p,n,t)=>history.progress.push([p,n,t]),
    fbSleep:async()=>{},
    fbRetry:async fn=>fn(),
    withTimeout:async value=>value,
    doc:(_db,_col,id)=>id,
    db:{},
    getDocFromCache:async id=>{
      history.cache++;
      const i=Number(id.split('_').at(-1));
      if(i>=cache)throw Error('cache-miss');
      return find(id);
    },
    getDoc:async id=>{
      history.individual++;
      return find(id);
    },
    collection:()=>({}),
    documentId:()=> 'id',
    where:(_id,_op,ids)=>ids,
    query:(_col,ids)=>ids,
    getDocs:async ids=>{
      history.batched++;
      if(denyBatch){
        const e=new Error('list denied');e.code='permission-denied';throw e;
      }
      return {forEach(fn){ids.forEach(id=>{const s=find(id);if(s&&s.exists())fn(s);});}};
    }
  });
  vm.runInContext(readSource,context,{filename:'fbReadChunkSeries.js'});
  return {context,history,read:()=>vm.runInContext("fbReadChunkSeries('"+prefix+"','"+version+"',"+count+")",context)};
}

const normal=await run();
const ordered=await normal.read();
assert.deepEqual(Array.from(ordered,r=>r.i),Array.from({length:25},(_,i)=>i),'Leitura deve preservar a ordem');
assert.equal(normal.history.batched,2,'20 chunks faltantes devem ser agrupados em 2 consultas');
assert.equal(normal.history.individual,0,'Consulta agrupada bem-sucedida não precisa de getDoc individual');
assert.deepEqual(normal.history.progress.at(-1),['v4_abast',25,25]);

const fallback=await run({count:14,cache:2,denyBatch:true});
assert.equal((await fallback.read()).length,14,'Fallback deve carregar todos os chunks');
assert.equal(fallback.history.batched,1,'Não repetir consulta em lote após permission-denied');
assert.equal(fallback.history.individual,12,'Leitura individual substitui a consulta negada');

const fromCache=await run({count:9,cache:9});
assert.equal((await fromCache.read()).length,9);
assert.equal(fromCache.history.batched,0,'Cache completo não deve consultar a rede');
assert.equal(fromCache.history.individual,0);

const corrupted=await run({count:9,cache:0,invalid:4});
await assert.rejects(corrupted.read(),/pertence a outra versão/,'Versões trocadas devem ser recusadas');

const absent=await run({count:9,cache:0,missing:4});
await assert.rejects(absent.read(),/chunk 5\/9 não encontrado/,'Chunks ausentes devem ser recusados');

console.log('IGNIS: sintaxe, agrupamento, fallback, cache, integridade e bloqueios validados.');
