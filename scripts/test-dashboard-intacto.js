'use strict';
import fs from 'node:fs';
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
const planningScript='<script src="ignis-multiselect.js?v=20261118b"></script>\n<script src="planejamento2027.js?v=20261118b"></script>';
assert.ok(html.includes(planningScript),'Carregamento dos filtros do Acompanhamento ausente');
const oldHtml=html.replace(planningScript,
  '<script src="planejamento2027.js?v=20261116a"></script>')
  .replace('planejamento2027.css?v=20261118b','planejamento2027.css?v=20261116a');
assert.equal(gitSha(oldHtml),'4df6faea1a38a1adfb4c7084b28426eb22fdbb11',
  'Dashboard/HTML divergiu da versão anterior! Não altere os arquivos do Dashboard.');
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
