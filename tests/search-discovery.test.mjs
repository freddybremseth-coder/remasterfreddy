import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const script=readFileSync(resolve(root,'public/search-discovery.js'),'utf8');
function visit({referrer='https://www.google.com/search?q=secret&session=123',pathname='/',hostname='remaster.freddybremseth.com',status=204,stored=new Map()}={}) {
 const calls=[];
 const window={location:{protocol:'https:',hostname,pathname},sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)}};
 vm.runInNewContext(script,{window,document:{referrer},URL,JSON,fetch:(url,options)=>{calls.push({url,options});return Promise.resolve({status})}});
 return {calls,stored};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Re-Master public home records verified source hostname, not full search or conversation links',async()=>{
 const {calls,stored}=visit();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://realtyflow.chatgenius.pro/api/public/search-discovery');
 assert.deepEqual(JSON.parse(calls[0].options.body),{path:'/',referrer:'https://www.google.com/'});
 assert.ok(!calls[0].options.body.includes('secret'));
 await tick();
 assert.equal(stored.size,1);
 assert.equal(visit({stored}).calls.length,0);
 const ai=visit({referrer:'https://gemini.google.com/app/private'});
 assert.deepEqual(JSON.parse(ai.calls[0].options.body),{path:'/',referrer:'https://gemini.google.com/'});
});
test('Re-Master failed database acknowledgement remains retryable, no private app paths counted',async()=>{
 const stored=new Map();
 visit({status:503,stored});await tick();
 assert.equal(stored.size,0);
 assert.equal(visit({stored}).calls.length,1);
 for(const pathname of ['/api/private','/app','/checkout','/account','/library','/youtube/abc'])
  assert.equal(visit({pathname}).calls.length,0);
 for(const referrer of ['https://google.com.evil.invalid/','http://www.google.com/','https://fakechatgpt.com/'])
  assert.equal(visit({referrer}).calls.length,0);
 assert.equal(visit({hostname:'www.remaster.freddybremseth.com'}).calls.length,0);
});
test('Vite public homepage includes the source-only tracker exactly once',()=>{
 const html=readFileSync(resolve(root,'index.html'),'utf8');
 assert.equal(html.split('src="/search-discovery.js"').length-1,1);
});
