// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, checkTicket, latestNumbers, numberFrequency, numbersByDate } from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const META = {
  alias: 'lottery-numbers',
  metaDescription: 'MCP server for Powerball and Mega Millions winning numbers: latest draw results, numbers by date, a ticket checker with prize tier and amount, and hot and cold number frequency, from New York State open data.',
  intro: 'Powerball and Mega Millions winning numbers for AI assistants, read live from the New York State Gaming Commission results published on data.ny.gov.',
};

export const TOOL_INFO = [
  { name: 'lottery_latest_numbers', blurb: 'The latest Powerball and Mega Millions winning numbers (or the last few draws), with the Power Play and the next draw date.' },
  { name: 'lottery_numbers_by_date', blurb: 'Winning numbers for one draw date (or the nearest draws when no draw was held that day), or every draw in a date range.' },
  { name: 'lottery_check_ticket', blurb: 'Check a ticket against a draw: matched numbers, prize tier, prize amount with Power Play or the Mega Millions multiplier, and the odds of that tier.' },
  { name: 'lottery_number_frequency', blurb: 'Hot, cold and longest-unseen numbers over the last N draws of the current game.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream data.ny.gov error'}: ${msg}` }] };
}
const wrap = <A>(fn: (a: A) => unknown) => async (a: A) => { try { return ok((await fn(a)) as any); } catch (e) { return fail(e); } };
const game = z.enum(['powerball', 'mega_millions']).describe('powerball or mega_millions.');
const date = (d: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(d);

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'Powerball and Mega Millions winning numbers, read at call time from the New York State Gaming Commission results on data.ny.gov. ' +
      'A model cannot know last night\'s numbers. Use lottery_latest_numbers for "Powerball numbers" or "Mega Millions numbers", lottery_numbers_by_date for a past draw, ' +
      'lottery_check_ticket for "did my ticket win" and lottery_number_frequency for "most common Powerball numbers". Tell the user to confirm a win with the official lottery.',
  });

  server.registerTool('lottery_latest_numbers', {
    title: 'Latest Powerball and Mega Millions numbers',
    description:
      'The latest Powerball and Mega Millions winning numbers: five white balls, the Powerball or Mega Ball, the Power Play multiplier and Double Play numbers, ' +
      'plus the next draw date. Optionally the last 2 to 10 draws. Results usually reach the feed the morning after the draw.',
    inputSchema: {
      game: z.enum(['powerball', 'mega_millions', 'both']).optional().describe('powerball, mega_millions or both (default both).'),
      draws: z.number().int().min(1).max(10).optional().describe('How many recent draws per game, 1 to 10. Default 1.'),
    },
    annotations: { title: 'Latest lottery numbers', ...RO },
  }, wrap((a: any) => latestNumbers(fetchText, a)));

  server.registerTool('lottery_numbers_by_date', {
    title: 'Lottery numbers by date',
    description:
      'Powerball or Mega Millions winning numbers for a draw date, or every draw between two dates (up to 400 days). When no draw was held on the date, ' +
      'returns the draws just before and after. Powerball back to 2010, Mega Millions back to 2002.',
    inputSchema: {
      game,
      date: date('One draw date, YYYY-MM-DD.'),
      start: date('Range start, YYYY-MM-DD. Default 30 days before end.'),
      end: date('Range end, YYYY-MM-DD. Default today.'),
    },
    annotations: { title: 'Lottery numbers by date', ...RO },
  }, wrap((a: any) => numbersByDate(fetchText, a)));

  server.registerTool('lottery_check_ticket', {
    title: 'Check a lottery ticket',
    description:
      'Check a Powerball or Mega Millions ticket against the latest draw or a given draw date: which numbers matched, the prize tier, the prize amount ' +
      '(with Power Play, or with the multiplier printed on a Mega Millions ticket) and the odds of that tier. Optional Powerball Double Play matches.',
    inputSchema: {
      game,
      numbers: z.array(z.number().int()).length(5).describe('The 5 white-ball numbers on the ticket.'),
      special: z.number().int().describe('The Powerball (1-26) or Mega Ball (1-24) on the ticket.'),
      date: date('Draw date on the ticket, YYYY-MM-DD. Default the latest draw.'),
      power_play: z.boolean().optional().describe('Powerball: the ticket has Power Play.'),
      multiplier: z.number().int().optional().describe('Mega Millions: the multiplier printed on the ticket (2, 3, 4, 5 or 10).'),
      double_play: z.boolean().optional().describe('Powerball: also check the Double Play drawing.'),
    },
    annotations: { title: 'Check a lottery ticket', ...RO },
  }, wrap((a: any) => checkTicket(fetchText, a)));

  server.registerTool('lottery_number_frequency', {
    title: 'Hot and cold lottery numbers',
    description:
      'Most and least drawn Powerball or Mega Millions numbers over the last N draws (default 100, up to all draws of the current game: Powerball since ' +
      '2015-10-07, Mega Millions since 2025-04-08), with how many draws ago each number last appeared. Past frequency does not change the odds.',
    inputSchema: {
      game,
      draws: z.number().int().min(10).max(1000).optional().describe('How many recent draws to count, 10 to 1000. Default 100.'),
    },
    annotations: { title: 'Hot and cold lottery numbers', ...RO },
  }, wrap((a: any) => numberFrequency(fetchText, a)));

  return server;
}
