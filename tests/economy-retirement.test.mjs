import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';

test('retirement clears legacy balances once while retaining identities, links and recordings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ghost-retirement-')),file=join(dir,'db.sqlite'),catalog=loadCatalog();
 let store=new BooStore(file,catalog);
 try {
  const owner=store.createGuest(),friend=store.createGuest();
  store.onboard(owner.player.id,{name:'Owner',country:'JP',spiritId:'kappa'});
  const invite=store.createInvite(owner.player.id,{spiritId:'kappa',channel:'line'});
  store.recordAudio(friend.player.id,invite.id,{consent:true,mime:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),durationMs:2000,score:null,meanHz:null,peakHz:null,frames:0});
  store.db.exec('PRAGMA user_version=1; ALTER TABLE players ADD COLUMN wallet INTEGER DEFAULT 0; ALTER TABLE players ADD COLUMN candies INTEGER DEFAULT 0; CREATE TABLE ledger(id TEXT,player_id TEXT,reason TEXT,delta INTEGER,created_at INTEGER)');
  store.db.prepare('UPDATE players SET wallet=30,candies=90 WHERE id=?').run(owner.player.id);
  store.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?)').run('old',owner.player.id,'welcome',30,Date.now());
  store.close();store=new BooStore(file,catalog);
  assert.equal(store.rawPlayer(owner.player.id).wallet,undefined);assert.equal(store.rawPlayer(owner.player.id).candies,undefined);
  assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE name='ledger'").get(),undefined);
  assert.equal(store.state(owner.player.id).wallet,undefined);assert.equal(store.state(owner.player.id).candies,undefined);
  assert.equal(store.authenticate(owner.token),owner.player.id);
  assert.equal(store.invite(invite.id).spiritId,'kappa');
  assert.ok(store.reactionAudio(owner.player.id,invite.id,friend.player.id).audio.length);
  for(const method of ['gift','startMatch','finishMatch','leaderboard'])assert.throws(()=>store[method](),{status:410});
  store.onboard(friend.player.id,{name:'Friend',country:'JP',spiritId:'kappa'});
  const first=store.respond(friend.player.id,invite.id),again=store.respond(friend.player.id,invite.id);
  assert.deepEqual(again,first);assert.equal(first.receiverReward,undefined);
  assert.throws(()=>store.respond(owner.player.id,invite.id),{status:409});
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
