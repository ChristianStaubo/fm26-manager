// Tests that decide by the loan list must not read the live one (local/runs/loan-list.json): the agent
// loan-listed P. Đukić on 2036-06-09 and a "not listed" test began to fail. Import this first.
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
const dir = mkdtempSync(`${tmpdir()}/fm-state-`);
writeFileSync(`${dir}/loan-list.json`, JSON.stringify({players: []}));
process.env.FM_LOAN_LIST = `${dir}/loan-list.json`;
