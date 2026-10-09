// Replay recorded screens offline: `fm friction fixture <id> <name>` saves a screen from a
// friction report to test/screens/<name>.json.gz; tests load it as a Screen and check that
// handlers, overlays and selectors recognise it, with no game running.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Screen} from '../game/ui/screen.mjs';

export const loadScreen = name => new Screen(JSON.parse(gunzipSync(readFileSync(new URL(`screens/${name}.json.gz`, import.meta.url)))));
