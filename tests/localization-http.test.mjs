import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
test('API does not render localized HTML or invitation metadata',async()=>{
 const app=createApp({databasePath:':memory:',rateLimits:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try {
  const base=`http://127.0.0.1:${app.server.address().port}`;
  for(const path of ['/','/i/example?lang=ar','/rankings','/my-links','/art/test.mp4']) {
   const response=await fetch(base+path,{headers:{'Accept-Language':'ja'}});
   assert.equal(response.status,404);assert.match(response.headers.get('Content-Type'),/application\/json/);assert.equal(response.headers.get('Content-Language'),null);
  }
 }finally{await new Promise(r=>app.server.close(r));app.close();}
});
