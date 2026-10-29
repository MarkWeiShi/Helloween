import test from 'node:test';
import assert from 'node:assert/strict';
import { personalScareScore } from '../shared/reactions.mjs';
test('personal fear game score increases with both pitch and volume, and does not invent silence scores', () => {
 assert.equal(personalScareScore(null, null), null);
 assert.equal(personalScareScore(300, 0), null);
 assert.ok(personalScareScore(600, .1) > personalScareScore(200, .1));
 assert.ok(personalScareScore(300, .4) > personalScareScore(300, .04));
 assert.equal(personalScareScore(1500, 2), 100);
});
