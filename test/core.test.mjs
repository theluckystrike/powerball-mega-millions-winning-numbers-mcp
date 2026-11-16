// Fixtures in test/fixtures/ are the 200 most recent rows of the data.ny.gov Powerball (d6yy-54nr) and Mega Millions (5xaw-6ayf)
// datasets, downloaded 2026-11-16: Powerball 2025-08-06 to 2026-11-14, Mega Millions 2024-12-17 to 2026-11-13.
// Values read off those files: Powerball 2026-11-14 09 44 49 51 68 PB 04, Power Play 2, Double Play 15 25 30 32 67 PB 01;
// Powerball 2026-11-11 08 42 45 51 57 PB 17 Power Play 3; Mega Millions 2026-11-13 10 22 33 49 57 MB 18;
// Mega Millions 2025-04-04 (old game) 11 28 35 37 69 MB 25 Megaplier 2. Over the last 100 Powerball draws (from 2026-03-28)
// white ball 42 was drawn 13 times and Powerball 3 eight times; over the 168 Mega Millions draws since 2025-04-08, 49 was drawn 20 times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  parseDraw, gameOf, GAMES, nextDraw, prizeFor, latestNumbers, numbersByDate, checkTicket, numberFrequency, InputError, UpstreamError, UTM,
} from '../dist/core.js';

const ROWS = {
  'd6yy-54nr': JSON.parse(readFileSync(new URL('./fixtures/powerball-200.json', import.meta.url), 'utf8')),
  '5xaw-6ayf': JSON.parse(readFileSync(new URL('./fixtures/mega-millions-200.json', import.meta.url), 'utf8')),
};
const seen = [];
// A small Socrata emulator: $order=draw_date DESC, $limit, and $where "between" or ">=" on draw_date.
const f = async (u) => {
  seen.push(u);
  const m = /^https:\/\/data\.ny\.gov\/resource\/([a-z0-9-]+)\.json\?(.*)$/.exec(u);
  if (!m || !ROWS[m[1]]) throw new Error(`HTTP 404 (no fixture for ${u})`);
  const p = Object.fromEntries(m[2].split('&').map((kv) => kv.split('=').map(decodeURIComponent)));
  assert.equal(p.$order, 'draw_date DESC');
  let rows = ROWS[m[1]];
  const w = p.$where ?? '';
  let b;
  if ((b = /^draw_date between '([^']+)' and '([^']+)'$/.exec(w))) rows = rows.filter((r) => r.draw_date >= b[1] && r.draw_date <= b[2] + '.000');
  else if ((b = /^draw_date >= '([^']+)'$/.exec(w))) rows = rows.filter((r) => r.draw_date >= b[1]);
  else assert.equal(w, '');
  return JSON.stringify(rows.slice(0, Number(p.$limit)));
};
const NOW = new Date('2026-11-16T17:00:00Z'); // Monday 12:00 ET

test('row parsing: Powerball sixth number is the Powerball, Mega Ball field, multipliers and Double Play', () => {
  const pb = parseDraw(GAMES.powerball, ROWS['d6yy-54nr'][0]);
  assert.deepEqual(pb, { game: 'powerball', date: '2026-11-14', white: [9, 44, 49, 51, 68], special: 4, multiplier: 2, double_play: { white: [15, 25, 30, 32, 67], special: 1 } });
  const mm = parseDraw(GAMES.mega_millions, ROWS['5xaw-6ayf'][0]);
  assert.deepEqual(mm, { game: 'mega_millions', date: '2026-11-13', white: [10, 22, 33, 49, 57], special: 18, multiplier: null, double_play: null });
  assert.equal(parseDraw(GAMES.mega_millions, { draw_date: '2025-04-04T00:00:00.000', winning_numbers: '11 28 35 37 69', mega_ball: '25', multiplier: '02' }).multiplier, 2);
  assert.equal(parseDraw(GAMES.powerball, { draw_date: 'x', winning_numbers: '1 2 3 4 5 6' }), null);
  assert.equal(gameOf('Mega Millions').id, 'mega_millions'); assert.equal(gameOf('PB').id, 'powerball'); assert.throws(() => gameOf('lotto'), InputError);
});

test('next draw dates in New York time: Monday noon gives Powerball tonight and Mega Millions Tuesday; after 10:59 pm Monday gives Wednesday', () => {
  assert.equal(nextDraw(GAMES.powerball, NOW), '2026-11-16');
  assert.equal(nextDraw(GAMES.mega_millions, NOW), '2026-11-17');
  assert.equal(nextDraw(GAMES.powerball, new Date('2026-11-17T04:30:00Z')), '2026-11-18'); // 23:30 ET Monday
  assert.equal(nextDraw(GAMES.mega_millions, new Date('2026-11-14T15:00:00Z')), '2026-11-17'); // Saturday
});

test('prize tables: Powerball 4+PB $50,000, x2 Power Play $100,000, Match 5 with Power Play $2,000,000; Mega Millions 3+MB $200 base', () => {
  assert.equal(prizeFor(GAMES.powerball, '2026-11-14', 4, true, null).prize_usd, 50000);
  assert.equal(prizeFor(GAMES.powerball, '2026-11-14', 4, true, 2).prize_usd, 100000);
  assert.equal(prizeFor(GAMES.powerball, '2026-11-14', 5, false, 3).prize_usd, 2000000);
  assert.equal(prizeFor(GAMES.powerball, '2026-11-14', 0, true, 10).prize_usd, 40);
  assert.equal(prizeFor(GAMES.powerball, '2026-11-14', 2, false, null).prize_usd, 0);
  assert.match(prizeFor(GAMES.powerball, '2026-11-14', 5, true, null).prize, /JACKPOT/);
  assert.equal(prizeFor(GAMES.mega_millions, '2026-11-13', 3, true, 3).prize_usd, 600);
  assert.equal(prizeFor(GAMES.mega_millions, '2026-11-13', 5, false, 10).prize_usd, 10000000);
  assert.match(prizeFor(GAMES.mega_millions, '2026-11-13', 0, true, null).prize, /^\$10 to \$50/);
  assert.equal(prizeFor(GAMES.mega_millions, '2025-04-04', 3, true, null).prize, null);
});

test('latest numbers for both games, with next draws and three recent Powerball draws', async () => {
  const r = await latestNumbers(f, {}, NOW);
  assert.equal(r.games.length, 2);
  assert.equal(r.games[0].latest_draw, '2026-11-14'); assert.equal(r.games[0].next_draw, '2026-11-16');
  assert.equal(r.games[1].latest_draw, '2026-11-13'); assert.equal(r.games[1].next_draw, '2026-11-17');
  assert.match(r.summary, /^Powerball Saturday 2026-11-14: 09 44 49 51 68 Powerball 04, Power Play 2x\. Next draw Monday 2026-11-16/);
  assert.match(r.summary, /Mega Millions Friday 2026-11-13: 10 22 33 49 57 Mega Ball 18\./);
  const three = await latestNumbers(f, { game: 'powerball', draws: 3 }, NOW);
  assert.deepEqual(three.games[0].draws.map((d) => d.date), ['2026-11-14', '2026-11-11', '2026-11-09']);
  assert.ok(r.more.includes(UTM));
});

test('numbers by date: an exact draw, a Sunday with no draw, and a month range', async () => {
  const a = await numbersByDate(f, { game: 'powerball', date: '2026-11-11' }, NOW);
  assert.equal(a.exact_date, true); assert.deepEqual(a.draw.white, [8, 42, 45, 51, 57]); assert.equal(a.draw.special, 17); assert.equal(a.draw.multiplier, 3);
  const b = await numbersByDate(f, { game: 'powerball', date: '2026-11-15' }, NOW);
  assert.equal(b.exact_date, false); assert.equal(b.draw_before.date, '2026-11-14'); assert.equal(b.draw_after, null);
  assert.match(b.summary, /no Powerball draw on Sunday 2026-11-15/);
  const c = await numbersByDate(f, { game: 'powerball', start: '2026-10-01', end: '2026-10-31' }, NOW);
  assert.equal(c.count, 13); assert.equal(c.draws[0].date, '2026-10-31'); assert.deepEqual(c.draws[0].white, [2, 4, 18, 50, 56]);
});

test('ticket checker: Powerball 4 + Powerball with Power Play 2x is $100,000; Mega Millions 3 + Mega Ball with 3x is $600; a losing ticket', async () => {
  const a = await checkTicket(f, { game: 'powerball', numbers: [51, 9, 44, 49, 1], special: 4, power_play: true, double_play: true }, NOW);
  assert.deepEqual(a.matched_white, [9, 44, 49, 51]); assert.equal(a.matched_special, true); assert.equal(a.prize_usd, 100000); assert.equal(a.winner, true);
  assert.deepEqual(a.double_play.matched_white, []); assert.equal(a.double_play.matched_powerball, false);
  assert.match(a.summary, /WINNER, \$100,000 with Power Play 2x/);
  const b = await checkTicket(f, { game: 'mega_millions', numbers: [10, 22, 33, 1, 2], special: 18, multiplier: 3 }, NOW);
  assert.equal(b.prize_usd, 600); assert.equal(b.tier, '3 white balls + Mega Ball');
  const c = await checkTicket(f, { game: 'powerball', numbers: [1, 2, 3, 5, 6], special: 7, date: '2026-11-11' }, NOW);
  assert.equal(c.winner, false); assert.equal(c.prize, 'no prize'); assert.equal(c.draw.date, '2026-11-11');
  const d = await checkTicket(f, { game: 'mega_millions', numbers: [11, 28, 35, 37, 69], special: 25, date: '2025-04-04' }, NOW);
  assert.equal(d.matched_white.length, 5); assert.equal(d.prize, null); assert.match(d.note, /2025-04-08/);
});

test('number frequency: last 100 Powerball draws, 42 most drawn (13) and Powerball 3 (8); Mega Millions counts only the current game', async () => {
  const r = await numberFrequency(f, { game: 'powerball', draws: 100 }, NOW);
  assert.equal(r.draws_counted, 100); assert.equal(r.from, '2026-03-28');
  assert.deepEqual(r.hot_white[0], { number: 42, count: 13, last: r.hot_white[0].last, ago: r.hot_white[0].ago });
  assert.equal(r.hot_special[0].number, 3); assert.equal(r.hot_special[0].count, 8);
  assert.equal(r.all_white.length, 69); assert.equal(r.all_special.length, 26);
  const m = await numberFrequency(f, { game: 'mega_millions', draws: 1000 }, NOW);
  assert.equal(m.draws_counted, 168); assert.equal(m.from, '2025-04-08'); assert.equal(m.hot_white[0].number, 49); assert.equal(m.hot_white[0].count, 20);
  assert.equal(m.all_special.length, 24);
});

test('input errors and upstream errors', async () => {
  await assert.rejects(checkTicket(f, { game: 'powerball', numbers: [1, 1, 2, 3, 4], special: 4 }, NOW), InputError);
  await assert.rejects(checkTicket(f, { game: 'powerball', numbers: [1, 2, 3, 4, 70], special: 4 }, NOW), InputError);
  await assert.rejects(checkTicket(f, { game: 'mega_millions', numbers: [1, 2, 3, 4, 5], special: 25 }, NOW), InputError);
  await assert.rejects(checkTicket(f, { game: 'mega_millions', numbers: [1, 2, 3, 4, 5], special: 5, multiplier: 6 }, NOW), InputError);
  await assert.rejects(checkTicket(f, { game: 'powerball', numbers: [1, 2, 3, 4, 5], special: 5, date: '2026-11-15' }, NOW), InputError);
  await assert.rejects(numbersByDate(f, { game: 'powerball', date: '2026-02-30' }, NOW), InputError);
  await assert.rejects(numbersByDate(f, { game: 'powerball', date: '2027-01-01' }, NOW), InputError);
  await assert.rejects(numbersByDate(f, { game: 'powerball', start: '2024-01-01', end: '2026-01-01' }, NOW), InputError);
  await assert.rejects(latestNumbers(async () => '{"message":"bad query"}', { game: 'powerball' }, NOW), UpstreamError);
  await assert.rejects(latestNumbers(async () => '[]', { game: 'powerball' }, NOW), UpstreamError);
});

test('stdio: initialize, tools/list with annotations and a tools/call error over JSON-RPC (offline)', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal((await got(1)).result.serverInfo.name, 'powerball-mega-millions-winning-numbers-mcp');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  const tools = (await got(2)).result.tools;
  assert.deepEqual(tools.map((t) => t.name), ['lottery_latest_numbers', 'lottery_numbers_by_date', 'lottery_check_ticket', 'lottery_number_frequency']);
  for (const t of tools) { assert.ok(t.title); assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.destructiveHint, false); assert.equal(t.annotations.openWorldHint, true); }
  send({ id: 3, method: 'tools/call', params: { name: 'lottery_check_ticket', arguments: { game: 'powerball', numbers: [1, 1, 2, 3, 4], special: 4 } } });
  const r3 = await got(3);
  child.kill();
  assert.equal(r3.result?.isError ?? Boolean(r3.error), true);
});
