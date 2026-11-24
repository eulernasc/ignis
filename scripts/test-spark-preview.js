import fs from 'node:fs';
import assert from 'node:assert/strict';
const old=fs.readFileSync('index.html','utf8'),preview=fs.readFileSync('secure-preview.html','utf8');
const css=s=>s.slice(s.indexOf('<style>'),s.indexOf('</style>')+8);
const dash=s=>{const a=s.indexOf('  <!-- DASHBOARD -->'),b=s.indexOf('\n  <!--',s.indexOf('  <div id="page-dashboard"')+1000);return s.slice(a,b);};
assert.equal(css(old),css(preview));assert.equal(dash(old),dash(preview));
assert.match(preview,/createIgnisAuth\(app,db\)/);assert.match(preview,/await auth\.login\(login,password,email\)/);
assert.doesNotMatch(preview,/cachedUser\.hash|await sha256\(pass\)|localStorage\.setItem\('ignis_users_cache'/);
console.log('Autenticação integrada sem mudar CSS e Dashboard.');
