'use strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function gitSha(source){
  const bytes=Buffer.from(source,'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([
    Buffer.from('blob '+bytes.length+'\0'),bytes
  ])).digest('hex');
}
const html=read('index.html');
const baseline=execFileSync('git',['show','27c212c0f3df967b015c7f83607cde346d9dc71e:index.html'],{encoding:'utf8',maxBuffer:10*1024*1024});
const css=s=>s.slice(s.indexOf('<style>'),s.indexOf('</style>')+8);
const dash=s=>{const a=s.indexOf('  <!-- DASHBOARD -->'),b=s.indexOf('  <div id="page-planejamento"',a);return s.slice(a,b);};
assert.equal(css(html),css(baseline),'CSS do Dashboard não pode mudar');
assert.equal(dash(html),dash(baseline),'Markup do Dashboard não pode mudar');
assert.match(html,/await auth\.login\(login,password,email\)/);
assert.doesNotMatch(html,/cachedUser\.hash|await sha256\(pass\)/);
assert.equal(gitSha(read('filtros-unificados.css')),'89339503d27ae7c2625472fddd14ffd620c3a33b',
  'CSS global do Dashboard divergiu da versão anterior.');
const planning=read('planejamento2027.js');
for(const filter of ['planOperation','planPlate','planGroup'])
  assert.ok(planning.includes('ignisMultiFilter.render("'+filter+'"'),'Filtro múltiplo ausente: '+filter);
const planCss=read('planejamento2027.css');
assert.match(planCss,/#page-planejamento \.ignis-shared-filter/);
assert.doesNotMatch(planCss,/#page-dashboard\s+\.ignis-shared-filter/,
  'Estilos de Acompanhamento não devem afetar o Dashboard.');
console.log('OK: Dashboard e CSS global originais; filtros múltiplos somente no Acompanhamento.');
