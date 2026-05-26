# wcajs

## Install (dev)

```bash
npm i
```

## Usage

```bash
wca help
wca nearby
wca nearby --place "Los Angeles, CA" --radius-km 80
wca nearby --place "Los Angeles, CA" --radius-km 80 --from 2026-06-01 --to 2026-12-31
wca nearby --place "US"
wca nearby --place "Europe"
wca nearby --place "Beijing" --radius-km 1000 --limit 200 --max-pages 50
wca nearby --place "Beijing" --radius-km 1000 --limit 200 --max-pages 50 --all-at-once
wca nearby --place "Beijing" --radius-km 1000 --limit 200 --live 60
wca nearby --place "Beijing" --radius-km 1000 --limit 200 --live
wca live --place "Beijing" --radius-km 1000 --minutes 60
```

Notes:
- For city/county lookups, this uses Open-Meteo geocoding first, then falls back to Nominatim.
- If Nominatim blocks requests, set `WCAJS_USER_AGENT` to a real UA string with contact info.
- For large queries (`--limit >= 200` or `--max-pages >= 50`), it prints `Press ⌃C to exit.` and streams results line-by-line.
- `--live` polls for new matching competitions and always prints `Press ⌃C to exit.` at the bottom of each poll cycle.
- `--live` with no duration runs indefinitely only if the CLI can enable OS sleep inhibition (macOS: `caffeinate`, Linux: `systemd-inhibit`, Windows: PowerShell). If not available, it prints instructions and exits.
