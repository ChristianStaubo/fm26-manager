import test from 'node:test';
import assert from 'node:assert/strict';
import {arrivalAction, onArrivals} from './arrival.mjs';

test('a wonderkid approval → loan list on arrival; squad buys and others stay', () => {
  assert.equal(arrivalAction({note: 'wonderkid'}), 'loan-list');
  assert.equal(arrivalAction({note: 'wonderkid, joins the squad'}), null);
  assert.equal(arrivalAction({note: 'GK backup'}), null);
  assert.equal(arrivalAction(null), null);
});

test('onArrivals lists only the wonderkids and reports a failure without throwing', async () => {
  const notes = {Awudu: 'wonderkid', Hellstern: 'GK backup', Pepper: 'wonderkid'};
  const listed = [];
  const list = async (name) => { if (name === 'Pepper') throw new Error('no Loan Status'); listed.push(name); return {action: 'loan-list', name, listed: true}; };
  const r = await onArrivals(['Awudu', 'Hellstern', 'Pepper'], 'Brentford', {find: (k, p) => ({note: notes[p]}), list});
  assert.deepEqual(listed, ['Awudu']);
  assert.equal(r.find(x => x.name === 'Pepper').error, 'no Loan Status');
});
