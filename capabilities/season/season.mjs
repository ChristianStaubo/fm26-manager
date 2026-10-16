// Season calendar: transfer windows and the next holiday return date (season.json).
import {readFileSync} from 'node:fs';
export const loadSeason = (path = new URL('./season.json', import.meta.url)) => JSON.parse(readFileSync(path, 'utf8'));

/** Is `date` inside a transfer window? windows: [{opens:'MM-DD', closes:'MM-DD'}] */
export function inWindow(date, windows = loadSeason().windows) {
  const md = date.toISOString().slice(5, 10);
  return windows.some(w => w.opens <= w.closes ? md >= w.opens && md <= w.closes : md >= w.opens || md <= w.closes);
}
/** Close date of the window `date` is in, else of the next window. Deals agreed before a
 *  window opens (they complete on its first day) belong to that window: `fm run` keeps going. */
export function windowEnd(date, windows = loadSeason().windows) {
  const y = date.getUTCFullYear(), day = d => new Date(`${d}T00:00:00Z`);
  return windows.flatMap(w => [y - 1, y, y + 1].map(yy => {
    const opens = day(`${yy}-${w.opens}`), closes = day(`${w.opens <= w.closes ? yy : yy + 1}-${w.closes}`);
    return {opens, closes};
  })).filter(w => w.closes >= date).sort((a, b) => a.closes - b.closes)[0].closes;
}
/** Next window opening strictly after `date`. */
export function nextWindowOpen(date, windows = loadSeason().windows) {
  const y = date.getUTCFullYear();
  return windows.flatMap(w => [y, y + 1].map(yy => new Date(`${yy}-${w.opens}T00:00:00Z`))).filter(d => d > date).sort((a, b) => a - b)[0];
}
/** Next occurrence of an MM-DD date strictly after `date` (e.g. the end-of-season return). */
export function nextDate(date, mmdd) {
  const y = date.getUTCFullYear(), d = new Date(`${y}-${mmdd}T00:00:00Z`);
  return d > date ? d : new Date(`${y + 1}-${mmdd}T00:00:00Z`);
}
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);
/** 'YYYY-MM-DD' plus n days, as 'YYYY-MM-DD'. */
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
