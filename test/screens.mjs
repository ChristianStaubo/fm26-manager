// Replay recorded screens offline: `fm friction fixture <id> <name>` saves a screen from a
// friction report to test/screens/<name>.json; tests load it as a Screen and check that
// handlers, overlays and selectors recognise it, with no game running.
import {readFileSync} from 'node:fs';
import {Screen} from '../ui/screen.mjs';

export const loadScreen = name => new Screen(JSON.parse(readFileSync(new URL(`screens/${name}.json`, import.meta.url), 'utf8')));
