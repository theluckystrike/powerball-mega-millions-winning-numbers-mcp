// Pure core for powerball-mega-millions-winning-numbers-mcp. The only I/O is keyless reads of the New York State open data
// lottery datasets (Socrata SODA API on data.ny.gov), done through an injected fetchText.
//
// Sources (public, no key):
//   Powerball winning numbers, beginning 2010:      https://data.ny.gov/resource/d6yy-54nr.json
//     fields draw_date, winning_numbers ("09 44 49 51 68 04", the 6th is the Powerball), multiplier (Power Play),
//     double_play_winning_numbers (from 2026-06-03 in this feed)
//   Mega Millions winning numbers, beginning 2002:  https://data.ny.gov/resource/5xaw-6ayf.json
//     fields draw_date, winning_numbers (5 white balls), mega_ball, multiplier (the old Megaplier, before 2025-04-08)
//
// Prize tables are the official fixed amounts, checked on powerball.com and megamillions.com on 2026-11-16.
import type { FetchText } from './types.js';

export const REPO = 'powerball-mega-millions-winning-numbers-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const more = () => `${SITE}/servers/?${UTM}`;
export const BASE = 'https://data.ny.gov/resource';
export const SOURCE = 'New York State Gaming Commission winning numbers via data.ny.gov (open data). Official results are on powerball.com and megamillions.com; always confirm a winning ticket with the lottery.';

export class InputError extends Error {}
export class UpstreamError extends Error {}

export type GameId = 'powerball' | 'mega_millions';
export interface Tier { whites: number; special: boolean; base: number | 'jackpot'; odds: number }
export interface Game {
  id: GameId; name: string; dataset: string; white: number; special: number; specialName: string;
  /** First draw of the current number matrix and prize table. */
  matrixSince: string; drawDays: number[]; drawHourET: number; drawMinuteET: number; drawTimeText: string; price: string;
  tiers: Tier[]; multiplierText: string; officialUrl: string;
}

export const GAMES: Record<GameId, Game> = {
  powerball: {
    id: 'powerball', name: 'Powerball', dataset: 'd6yy-54nr', white: 69, special: 26, specialName: 'Powerball',
    matrixSince: '2015-10-07', drawDays: [1, 3, 6], drawHourET: 22, drawMinuteET: 59, drawTimeText: 'Monday, Wednesday and Saturday at 10:59 pm ET', price: '$2 a play, Power Play $1 more',
    tiers: [
      { whites: 5, special: true, base: 'jackpot', odds: 292201338 },
      { whites: 5, special: false, base: 1000000, odds: 11688053.52 },
      { whites: 4, special: true, base: 50000, odds: 913129.18 },
      { whites: 4, special: false, base: 100, odds: 36525.17 },
      { whites: 3, special: true, base: 100, odds: 14494.11 },
      { whites: 3, special: false, base: 7, odds: 579.76 },
      { whites: 2, special: true, base: 7, odds: 701.33 },
      { whites: 1, special: true, base: 4, odds: 91.98 },
      { whites: 0, special: true, base: 4, odds: 38.32 },
    ],
    multiplierText: 'Power Play multiplies every non-jackpot prize by the drawn multiplier (2x, 3x, 4x, 5x, or 10x when the advertised jackpot is $150 million or less); Match 5 with Power Play is always $2,000,000.',
    officialUrl: 'https://www.powerball.com/',
  },
  mega_millions: {
    id: 'mega_millions', name: 'Mega Millions', dataset: '5xaw-6ayf', white: 70, special: 24, specialName: 'Mega Ball',
    matrixSince: '2025-04-08', drawDays: [2, 5], drawHourET: 23, drawMinuteET: 0, drawTimeText: 'Tuesday and Friday at 11:00 pm ET', price: '$5 a play with a multiplier built in',
    tiers: [
      { whites: 5, special: true, base: 'jackpot', odds: 290472336 },
      { whites: 5, special: false, base: 1000000, odds: 12629232 },
      { whites: 4, special: true, base: 10000, odds: 893761 },
      { whites: 4, special: false, base: 500, odds: 38859 },
      { whites: 3, special: true, base: 200, odds: 13965 },
      { whites: 3, special: false, base: 10, odds: 607 },
      { whites: 2, special: true, base: 10, odds: 665 },
      { whites: 1, special: true, base: 7, odds: 86 },
      { whites: 0, special: true, base: 5, odds: 35 },
    ],
    multiplierText: 'Every $5 Mega Millions ticket carries its own random multiplier (2x, 3x, 4x, 5x or 10x, printed on the ticket) that multiplies every non-jackpot prize. It is not part of the drawing.',
    officialUrl: 'https://www.megamillions.com/',
  },
};

export interface Draw { game: GameId; date: string; white: number[]; special: number; multiplier: number | null; double_play: { white: number[]; special: number } | null }

export function gameOf(g: unknown): Game {
  const s = String(g ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'powerball' || s === 'pb') return GAMES.powerball;
  if (s === 'mega_millions' || s === 'megamillions' || s === 'mega' || s === 'mm') return GAMES.mega_millions;
  throw new InputError(`unknown game "${g}". Use powerball or mega_millions.`);
}

export function parseDraw(game: Game, row: Record<string, string>): Draw | null {
  const date = String(row.draw_date ?? '').slice(0, 10);
  const nums = String(row.winning_numbers ?? '').trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let white: number[], special: number;
  if (game.id === 'powerball') { if (nums.length < 6) return null; white = nums.slice(0, 5); special = nums[5]; }
  else { if (nums.length < 5 || !row.mega_ball) return null; white = nums.slice(0, 5); special = Number(row.mega_ball); }
  const m = row.multiplier ? Number(row.multiplier) : NaN;
  let double_play: Draw['double_play'] = null;
  if (row.double_play_winning_numbers) {
    const d = row.double_play_winning_numbers.trim().split(/\s+/).map(Number);
    if (d.length >= 6) double_play = { white: d.slice(0, 5).sort((a, b) => a - b), special: d[5] };
  }
  return { game: game.id, date, white: white.sort((a, b) => a - b), special, multiplier: Number.isFinite(m) && m > 0 ? m : null, double_play };
}

export function soda(game: Game, params: Record<string, string>): string {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${BASE}/${game.dataset}.json?${q}`;
}

async function query(f: FetchText, game: Game, params: Record<string, string>, cacheTtl: number): Promise<Draw[]> {
  const body = await f(soda(game, params), { cacheTtl, timeoutMs: 20000 });
  let rows: unknown;
  try { rows = JSON.parse(body); } catch { throw new UpstreamError('data.ny.gov returned something that is not JSON'); }
  if (!Array.isArray(rows)) throw new UpstreamError(`data.ny.gov answered with an error: ${String((rows as any)?.message ?? body).slice(0, 200)}`);
  return rows.map((r) => parseDraw(game, r as Record<string, string>)).filter((d): d is Draw => d !== null).sort((a, b) => b.date.localeCompare(a.date));
}

export const latest = (f: FetchText, game: Game, n: number) =>
  query(f, game, { $order: 'draw_date DESC', $limit: String(n) }, 600);

export const between = (f: FetchText, game: Game, start: string, end: string, limit = 1000) =>
  query(f, game, { $where: `draw_date between '${start}T00:00:00' and '${end}T00:00:00'`, $order: 'draw_date DESC', $limit: String(limit) }, 1800);

export const since = (f: FetchText, game: Game, start: string, n: number) =>
  query(f, game, { $where: `draw_date >= '${start}T00:00:00'`, $order: 'draw_date DESC', $limit: String(n) }, 1800);

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDraw = (d: Draw) => `${d.white.map(pad).join(' ')} ${GAMES[d.game].specialName} ${pad(d.special)}${d.multiplier ? (d.game === 'powerball' ? `, Power Play ${d.multiplier}x` : `, Megaplier ${d.multiplier}x`) : ''}`;
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

/** Date, weekday and minutes since midnight in New York for an instant. */
export function etParts(now: Date): { date: string; dow: number; minutes: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, dow, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export function nextDraw(game: Game, now: Date): string {
  const et = etParts(now);
  for (let i = 0; i < 8; i++) {
    const dow = (et.dow + i) % 7;
    if (!game.drawDays.includes(dow)) continue;
    if (i === 0 && et.minutes >= game.drawHourET * 60 + game.drawMinuteET) continue;
    return addDays(et.date, i);
  }
  throw new Error('no draw day found');
}

function checkDate(s: string | undefined, name: string, now: Date): string | undefined {
  if (s === undefined || s === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new InputError(`${name} must be a real date as YYYY-MM-DD, got "${s}"`);
  if (s < '2002-05-17') throw new InputError(`${name} ${s} is before the first draw in the data (2002-05-17)`);
  if (s > addDays(etParts(now).date, 1)) throw new InputError(`${name} ${s} is in the future`);
  return s;
}

const games = (g: unknown): Game[] => (g === undefined || g === '' || String(g).toLowerCase() === 'both' ? [GAMES.powerball, GAMES.mega_millions] : [gameOf(g)]);

export async function latestNumbers(f: FetchText, a: { game?: string; draws?: number }, now = new Date()) {
  const n = Math.max(1, Math.min(10, Math.floor(a.draws ?? 1)));
  const out = [];
  for (const g of games(a.game)) {
    const draws = await latest(f, g, n);
    if (!draws.length) throw new UpstreamError(`no ${g.name} draws came back from data.ny.gov`);
    out.push({ game: g.name, latest_draw: draws[0].date, draws, next_draw: nextDraw(g, now), draw_schedule: g.drawTimeText, price: g.price });
  }
  const summary = out.map((o) => `${o.game} ${weekday(o.latest_draw)} ${o.latest_draw}: ${fmtDraw(o.draws[0])}. Next draw ${weekday(o.next_draw)} ${o.next_draw} (${GAMES[o.draws[0].game].drawTimeText.split(' at ')[1]}).` +
    (o.draws.length > 1 ? ` Earlier: ${o.draws.slice(1).map((d) => `${d.date} ${fmtDraw(d)}`).join('; ')}.` : '')).join('\n');
  return { summary, games: out, as_of: now.toISOString(), source: SOURCE, note: 'Results usually appear in the open data feed the morning after the draw. Jackpot amounts are not in this feed; see the official game site.', more: more() };
}

export async function numbersByDate(f: FetchText, a: { game: string; date?: string; start?: string; end?: string }, now = new Date()) {
  const g = gameOf(a.game);
  const date = checkDate(a.date, 'date', now), start = checkDate(a.start, 'start', now), end = checkDate(a.end, 'end', now);
  if (date) {
    const draws = await between(f, g, addDays(date, -7), addDays(date, 7));
    const exact = draws.find((d) => d.date === date);
    if (exact) return { summary: `${g.name} ${weekday(date)} ${date}: ${fmtDraw(exact)}.`, game: g.name, date, draw: exact, exact_date: true, as_of: now.toISOString(), source: SOURCE, more: more() };
    const before = draws.find((d) => d.date < date), after = [...draws].reverse().find((d) => d.date > date);
    const parts = [`There was no ${g.name} draw on ${weekday(date)} ${date} (draws are ${g.drawTimeText}).`];
    if (before) parts.push(`Draw before: ${before.date} ${fmtDraw(before)}.`);
    if (after) parts.push(`Draw after: ${after.date} ${fmtDraw(after)}.`);
    return { summary: parts.join(' '), game: g.name, date, exact_date: false, draw_before: before ?? null, draw_after: after ?? null, as_of: now.toISOString(), source: SOURCE, more: more() };
  }
  const e = end ?? etParts(now).date, s = start ?? addDays(e, -30);
  if (s > e) throw new InputError(`start ${s} is after end ${e}`);
  if ((Date.parse(e) - Date.parse(s)) / 86400000 > 400) throw new InputError('a range can cover at most 400 days per call');
  const draws = await between(f, g, s, e);
  const summary = `${g.name} ${s} to ${e}: ${draws.length} draws.` + (draws.length ? `\n${draws.slice(0, 40).map((d) => `${d.date} ${fmtDraw(d)}`).join('\n')}${draws.length > 40 ? `\n(${draws.length - 40} more in draws)` : ''}` : '');
  return { summary, game: g.name, start: s, end: e, count: draws.length, draws, as_of: now.toISOString(), source: SOURCE, more: more() };
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function prizeFor(g: Game, drawDate: string, whites: number, special: boolean, multiplier: number | null) {
  if (drawDate < g.matrixSince) return { tier: `${whites}${special ? ` + ${g.specialName}` : ''}`, prize: null as string | null, prize_usd: null as number | null, note: `The prize table before ${g.matrixSince} was different; this checker only prices draws on the current game.` };
  const t = g.tiers.find((x) => x.whites === whites && x.special === special);
  const tier = `${whites} white ball${whites === 1 ? '' : 's'}${special ? ` + ${g.specialName}` : ''}`;
  if (!t) return { tier, prize: 'no prize', prize_usd: 0, note: null };
  if (t.base === 'jackpot') return { tier, prize: 'JACKPOT (grand prize, shared among jackpot winners; amount on the official site)', prize_usd: null, odds: `1 in ${t.odds.toLocaleString('en-US')}`, note: null };
  if (g.id === 'powerball') {
    const amt = multiplier ? (t.whites === 5 ? 2000000 : t.base * multiplier) : t.base;
    return { tier, prize: money(amt) + (multiplier ? ` with Power Play ${multiplier}x` : ''), prize_usd: amt, base_prize_usd: t.base, odds: `1 in ${t.odds.toLocaleString('en-US')}`, note: null };
  }
  if (multiplier) return { tier, prize: `${money(t.base * multiplier)} with the ticket's ${multiplier}x multiplier`, prize_usd: t.base * multiplier, base_prize_usd: t.base, odds: `1 in ${t.odds.toLocaleString('en-US')}`, note: null };
  return { tier, prize: `${money(t.base * 2)} to ${money(t.base * 10)} depending on the multiplier printed on the ticket (2x ${money(t.base * 2)}, 3x ${money(t.base * 3)}, 4x ${money(t.base * 4)}, 5x ${money(t.base * 5)}, 10x ${money(t.base * 10)})`, prize_usd: null, base_prize_usd: t.base, odds: `1 in ${t.odds.toLocaleString('en-US')}`, note: 'Pass multiplier (2, 3, 4, 5 or 10, printed on the ticket) for the exact amount.' };
}

export async function checkTicket(f: FetchText, a: { game: string; numbers: number[]; special: number; date?: string; power_play?: boolean; multiplier?: number; double_play?: boolean }, now = new Date()) {
  const g = gameOf(a.game);
  const date = checkDate(a.date, 'date', now);
  // Draws before the current matrix used other ranges (Mega Millions 1-75 / 1-25 or 1-15, Powerball 1-59 / 1-35), so only check loosely there.
  const old = date !== undefined && date < g.matrixSince;
  const maxW = old ? 75 : g.white, maxS = old ? 46 : g.special;
  const nums = (a.numbers ?? []).map(Number);
  if (nums.length !== 5 || new Set(nums).size !== 5 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > maxW)) throw new InputError(`numbers must be 5 different whole numbers from 1 to ${maxW} for ${g.name}`);
  if (!Number.isInteger(a.special) || a.special < 1 || a.special > maxS) throw new InputError(`special (the ${g.specialName}) must be a whole number from 1 to ${maxS}`);
  if (a.multiplier !== undefined && ![2, 3, 4, 5, 10].includes(a.multiplier)) throw new InputError('multiplier must be 2, 3, 4, 5 or 10');
  let draw: Draw | undefined;
  if (date) {
    draw = (await between(f, g, date, date)).find((d) => d.date === date);
    if (!draw) throw new InputError(`there was no ${g.name} draw on ${date} in the data (draws are ${g.drawTimeText}). Use lottery_numbers_by_date to find the nearest draw.`);
  } else {
    draw = (await latest(f, g, 1))[0];
    if (!draw) throw new UpstreamError(`no ${g.name} draws came back from data.ny.gov`);
  }
  const ticket = [...nums].sort((x, y) => x - y);
  const matched = ticket.filter((n) => draw!.white.includes(n));
  const specialHit = a.special === draw.special;
  const mult = g.id === 'powerball' ? (a.power_play ? draw.multiplier : null) : (a.multiplier ?? null);
  const prize = prizeFor(g, draw.date, matched.length, specialHit, mult);
  let dp = null;
  if (a.double_play && g.id === 'powerball') {
    if (!draw.double_play) dp = { note: 'This draw has no Double Play numbers in the feed (Double Play is sold in some states only).' };
    else {
      const m = ticket.filter((n) => draw!.double_play!.white.includes(n));
      dp = { numbers: draw.double_play, matched_white: m, matched_powerball: a.special === draw.double_play.special, note: 'Double Play has its own prize table on powerball.com; this checker reports the matches.' };
    }
  }
  const won = prize.prize_usd === null ? prize.prize !== null : prize.prize_usd > 0;
  const summary = `${g.name} ${draw.date} draw: ${fmtDraw(draw)}. Your ticket ${ticket.map(pad).join(' ')} ${g.specialName} ${pad(a.special)} matched ${matched.length} white ball${matched.length === 1 ? '' : 's'}` +
    `${matched.length ? ` (${matched.map(pad).join(' ')})` : ''} and ${specialHit ? `the ${g.specialName}` : `not the ${g.specialName}`}: ${won ? `WINNER, ${prize.prize}` : (prize.prize ?? 'see note')}.` +
    (dp && 'matched_white' in dp ? ` Double Play: ${dp.matched_white.length} white${dp.matched_powerball ? ' + Powerball' : ''}.` : '') +
    ' Confirm any win with the official lottery before discarding the ticket.';
  return { summary, game: g.name, draw, ticket: { numbers: ticket, special: a.special }, matched_white: matched, matched_special: specialHit, ...prize, winner: won, double_play: dp,
    multiplier_rules: g.multiplierText, california: 'California pays non-jackpot prizes pari-mutuel, so amounts there differ.', as_of: now.toISOString(), source: SOURCE, more: more() };
}

export async function numberFrequency(f: FetchText, a: { game: string; draws?: number }, now = new Date()) {
  const g = gameOf(a.game);
  const n = Math.max(10, Math.min(1000, Math.floor(a.draws ?? 100)));
  const draws = await since(f, g, g.matrixSince, n);
  if (!draws.length) throw new UpstreamError(`no ${g.name} draws came back from data.ny.gov`);
  const white = new Map<number, { count: number; last: string | null; ago: number | null }>();
  const special = new Map<number, { count: number; last: string | null; ago: number | null }>();
  for (let i = 1; i <= g.white; i++) white.set(i, { count: 0, last: null, ago: null });
  for (let i = 1; i <= g.special; i++) special.set(i, { count: 0, last: null, ago: null });
  draws.forEach((d, idx) => {
    for (const w of d.white) { const e = white.get(w); if (e) { e.count++; if (e.last === null) { e.last = d.date; e.ago = idx; } } }
    const e = special.get(d.special); if (e) { e.count++; if (e.last === null) { e.last = d.date; e.ago = idx; } }
  });
  const rank = (m: typeof white) => [...m.entries()].map(([number, v]) => ({ number, ...v }));
  const hot = (m: typeof white) => rank(m).sort((x, y) => y.count - x.count || x.number - y.number);
  const cold = (m: typeof white) => rank(m).sort((x, y) => x.count - y.count || x.number - y.number);
  const overdue = (m: typeof white) => rank(m).sort((x, y) => (y.ago ?? Infinity) - (x.ago ?? Infinity) || x.number - y.number);
  const hw = hot(white).slice(0, 10), cw = cold(white).slice(0, 10), ow = overdue(white).slice(0, 10), hs = hot(special).slice(0, 5), cs = cold(special).slice(0, 5);
  const fmt = (xs: { number: number; count: number }[]) => xs.map((x) => `${pad(x.number)} (${x.count})`).join(', ');
  const summary = `${g.name}, last ${draws.length} draws (${draws[draws.length - 1].date} to ${draws[0].date}, current ${g.white}/${g.special} game only). ` +
    `Most drawn white balls: ${fmt(hw)}. Least drawn: ${fmt(cw)}. Most drawn ${g.specialName}: ${fmt(hs)}. ` +
    `Longest unseen white balls: ${ow.map((x) => `${pad(x.number)} (${x.ago === null ? 'not drawn in window' : `${x.ago} draws ago`})`).join(', ')}. ` +
    'Every draw is independent and random: past frequency does not change any number\'s odds.';
  return { summary, game: g.name, draws_counted: draws.length, from: draws[draws.length - 1].date, to: draws[0].date, expected_white_count: Math.round((draws.length * 5 / g.white) * 10) / 10,
    hot_white: hw, cold_white: cw, overdue_white: ow, hot_special: hs, cold_special: cs, all_white: rank(white), all_special: rank(special), as_of: now.toISOString(), source: SOURCE, more: more() };
}
