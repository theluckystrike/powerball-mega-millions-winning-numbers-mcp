# powerball-mega-millions-winning-numbers-mcp

**Latest Powerball and Mega Millions winning numbers, numbers by date, a ticket checker with prize amounts, and hot and cold numbers, as an MCP server.** Free and hosted: no API key, no sign-up.

Hosted MCP URL (Streamable HTTP):

```
https://powerball-mega-millions-winning-numbers-mcp.lipmichal.workers.dev/mcp
```

## Quick start

### Claude

Claude Desktop or claude.ai: Settings > Connectors > Add custom connector, then paste the URL above.

Claude Code:

```
claude mcp add --transport http lottery-numbers https://powerball-mega-millions-winning-numbers-mcp.lipmichal.workers.dev/mcp
```

Claude Desktop config file (`claude_desktop_config.json`), through the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "lottery-numbers": { "command": "npx", "args": ["-y", "mcp-remote", "https://powerball-mega-millions-winning-numbers-mcp.lipmichal.workers.dev/mcp"] }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "lottery-numbers": { "url": "https://powerball-mega-millions-winning-numbers-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

## About

Powerball and Mega Millions winning numbers for AI assistants. Ask for last night's Powerball numbers, check whether a ticket won and how much, look up a past draw, or see the most and least drawn numbers.

This is a Model Context Protocol (MCP) server. It reads the New York State Gaming Commission winning numbers published as open data on data.ny.gov at call time. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `lottery_latest_numbers` | The latest Powerball and Mega Millions winning numbers (or the last 2 to 10 draws) with the Power Play, Double Play numbers and the next draw date. |
| `lottery_numbers_by_date` | Winning numbers for one draw date, or the draws just before and after when no draw was held that day, or every draw in a range of up to 400 days. |
| `lottery_check_ticket` | Check a ticket against the latest draw or a draw date: matched numbers, prize tier, prize amount with Power Play or the Mega Millions multiplier, and the odds of that tier. |
| `lottery_number_frequency` | Hot, cold and longest-unseen white balls and Powerballs or Mega Balls over the last 10 to 1000 draws of the current game. |

Every result has structured JSON, a plain-text summary, `as_of`, `source` and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=powerball-mega-millions-winning-numbers-mcp)). Every tool is marked read-only.

## What it knows that your model does not

- Last night's numbers. Powerball draws Monday, Wednesday and Saturday at 10:59 pm ET; Mega Millions draws Tuesday and Friday at 11:00 pm ET.
- The current prize tables: Powerball with Power Play (Match 5 with Power Play is $2,000,000) and the $5 Mega Millions game with its built-in 2x to 10x multiplier since 2025-04-08.
- Frequency counts restricted to the current number matrix, so old 75-ball or 59-ball draws do not skew them.

## Other clients and local install

### Hosted (custom connector, ChatGPT developer mode, any remote MCP client)

Paste this URL. No token, no sign-up.

```
https://powerball-mega-millions-winning-numbers-mcp.lipmichal.workers.dev/mcp
```

### VS Code

Add to `.vscode/mcp.json`.

```json
{
  "servers": {
    "lottery-numbers": { "type": "http", "url": "https://powerball-mega-millions-winning-numbers-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio

The npm package is not published. Build it from this repository with Node 20 or newer, then point your MCP client at `node /path/to/powerball-mega-millions-winning-numbers-mcp/dist/stdio.js`.

```
git clone https://github.com/theluckystrike/powerball-mega-millions-winning-numbers-mcp && cd powerball-mega-millions-winning-numbers-mcp
npm install && npm run build
node dist/stdio.js
```

## Example prompts

- "What were last night's Powerball numbers?"
- "Did my Powerball ticket 7 19 33 41 62 Powerball 11 with Power Play win on Saturday?"
- "What were the Mega Millions numbers on November 13, 2026?"
- "When is the next Mega Millions drawing?"
- "What are the most common Powerball numbers over the last 100 draws?"

## Data sources

Full list in [DATA_SOURCES.md](DATA_SOURCES.md).

- [Lottery Powerball Winning Numbers: Beginning 2010](https://data.ny.gov/Government-Finance/Lottery-Powerball-Winning-Numbers-Beginning-2010/d6yy-54nr) (data.ny.gov, New York State Gaming Commission).
- [Lottery Mega Millions Winning Numbers: Beginning 2002](https://data.ny.gov/Government-Finance/Lottery-Mega-Millions-Winning-Numbers-Beginning-20/5xaw-6ayf) (data.ny.gov).
- Prize tables from [powerball.com](https://www.powerball.com/powerball-prize-chart) and [megamillions.com](https://www.megamillions.com/How-to-Play.aspx), checked 2026-11-16.

## Limitations

- Results usually reach the open data feed the morning after the draw, so the newest draw can be a few hours behind the live broadcast.
- Jackpot amounts and winner counts are not in the feed.
- California pays non-jackpot prizes pari-mutuel, so amounts there differ. Prize amounts are priced for the current games only (Powerball since 2015-10-07, Mega Millions since 2025-04-08).
- Always confirm a winning ticket with the official lottery. Past frequency does not change any number's odds.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=powerball-mega-millions-winning-numbers-mcp).

Part of the Zovo MCP collection at https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

CI (`.github/workflows/bundle.yml`) runs the tests, the type check and `wrangler deploy --dry-run --outdir out`, and uploads the Worker bundle as an artifact.

## License

MIT
