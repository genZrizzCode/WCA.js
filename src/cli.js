import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { iterateCompetitionsOngoingAndUpcoming } from "./wcaApi.js";
import { resolvePlace } from "./place.js";
import { formatCompetition, withinRadiusKm } from "./util.js";
import { startSleepInhibitor } from "./sleepInhibit.js";

function parseIsoDate(value, label) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${label} must be YYYY-MM-DD`);
  return s;
}

function overlapsDateRange(competition, from, to) {
  const start = competition.start_date ?? null;
  const end = competition.end_date ?? start;
  if (!start) return false;
  const aStart = start;
  const aEnd = end ?? start;
  const bStart = from ?? "0000-01-01";
  const bEnd = to ?? "9999-12-31";
  return aStart <= bEnd && aEnd >= bStart;
}

function createPrompt() {
  const rl = createInterface({ input, output });
  return {
    async ask(question) {
      const answer = await rl.question(question);
      return answer.trim();
    },
    close() {
      rl.close();
    },
  };
}

function parseLiveMinutes(value) {
  if (value == null || value === false) return null;
  if (value === true) return { forever: true };
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) throw new Error("--live minutes must be a positive number");
  return { forever: false, minutes: n };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createCompetitionMatcher({ resolved, radiusKm, from, to, today }) {
  const allowCountries = resolved.kind === "continent" ? new Set(resolved.iso2List) : null;
  const isUpcoming = (c) => (c.end_date ?? c.start_date ?? "9999-12-31") >= today;

  return (competition) => {
    if (!isUpcoming(competition)) return false;
    if (!overlapsDateRange(competition, from, to)) return false;

    if (resolved.kind === "point") {
      return withinRadiusKm(resolved, competition, radiusKm);
    }
    if (resolved.kind === "country") {
      return (competition.country_iso2 ?? "").toUpperCase() === resolved.iso2;
    }
    if (resolved.kind === "continent") {
      return allowCountries?.has((competition.country_iso2 ?? "").toUpperCase()) ?? false;
    }
    return false;
  };
}

async function handleNearby(options) {
  const prompt = createPrompt();
  try {
    const bigQueryRequested =
      (options.limit != null && options.limit >= 200) || (options.maxPages != null && options.maxPages >= 50);
    const shouldPrintCtrlC = bigQueryRequested && process.stdin.isTTY;
    if (shouldPrintCtrlC) console.log("Press ⌃C to exit.");

    const placeRaw = options.place ?? (await prompt.ask("City/county, country, or continent: "));
    if (!placeRaw) throw new Error("Place is required.");

    const resolved = await resolvePlace(placeRaw, { assume: options.assume });

    let radiusKm = options.radiusKm;
    if (resolved.kind === "point") {
      if (radiusKm == null) {
        const r = await prompt.ask("Radius (km): ");
        radiusKm = Number.parseFloat(r);
      }
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
        throw new Error("Radius must be a positive number (km).");
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const limit = options.limit ?? 50;
    const matches = createCompetitionMatcher({
      resolved,
      radiusKm,
      from: options.from,
      to: options.to,
      today,
    });

    const liveCfg = parseLiveMinutes(options.live);

    // In live mode, always stream (all-at-once is ignored).
    const liveMode = Boolean(liveCfg);
    const collected = !liveMode && options.allAtOnce ? [] : null;
    let printed = 0;
    let matchedAny = false;

    let inhibitor = null;
    const seenIds = liveMode ? new Set() : null;
    const endAtMs = liveCfg && !liveCfg.forever ? Date.now() + liveCfg.minutes * 60_000 : null;
    const pollMinutes = options.pollMinutes ?? 2;
    if (!Number.isFinite(pollMinutes) || pollMinutes <= 0) throw new Error("--poll-minutes must be a positive number");
    const pollIntervalMs = pollMinutes * 60_000;

    try {
      const scanOnce = async () => {
        for await (const page of iterateCompetitionsOngoingAndUpcoming({ maxPages: options.maxPages })) {
          for (const competition of page) {
            if (!matches(competition)) continue;
            if (seenIds) {
              if (seenIds.has(competition.id)) continue;
              seenIds.add(competition.id);
            }
            matchedAny = true;
            if (collected) {
              collected.push(competition);
            } else {
              console.log(formatCompetition(competition, { origin: resolved.kind === "point" ? resolved : null }));
              printed += 1;
              if (printed >= limit) return false;
            }
          }
        }
        return true;
      };

      // Initial scan.
      const canContinue = await scanOnce();
      if (!canContinue) return;

      if (liveMode) {
        if (liveCfg.forever) {
          const started = await startSleepInhibitor();
          if (!started.ok) {
            console.error("Live mode without a duration needs OS sleep inhibition to keep running while the computer would sleep.");
            console.error(`Sleep inhibition is not available automatically here (${started.reason}).`);
            console.error("Re-run with `--live <minutes>` or keep your machine awake via OS settings/tools.");
            process.exitCode = 1;
            return;
          }
          inhibitor = started;
        }

        // Always print at the bottom in live mode.
        console.log("Press ⌃C to exit.");

        // Poll for new competitions until duration elapses.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (endAtMs != null && Date.now() >= endAtMs) return;
          // eslint-disable-next-line no-await-in-loop
          await sleep(pollIntervalMs);
          // eslint-disable-next-line no-await-in-loop
          const ok = await scanOnce();
          if (!ok) return;
          console.log("Press ⌃C to exit.");
        }
      }
    } catch (err) {
      console.error(err?.message ?? String(err));
      console.error("Try again, or reduce --max-pages.");
      process.exitCode = 1;
      return;
    } finally {
      inhibitor?.stop?.();
    }

    if (collected) {
      let comps = collected;
      if (resolved.kind === "point") {
        comps = comps.sort((a, b) => withinRadiusKm.distanceKm(resolved, a) - withinRadiusKm.distanceKm(resolved, b));
      } else {
        comps = comps.sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
      }
      comps = comps.slice(0, limit);
      for (const competition of comps) {
        console.log(formatCompetition(competition, { origin: resolved.kind === "point" ? resolved : null }));
      }
    }

    if (!matchedAny) console.log("No matching competitions found.");
  } finally {
    prompt.close();
  }
}

export function runCli(argv) {
  const program = new Command();

  program
    .name("wca")
    .description("WCA command-line tools")
    .version("0.1.0");
  program.showHelpAfterError();
  program.showSuggestionAfterError();

  program
    .command("help")
    .description("Show help for a command")
    .argument("[command]", "Command name")
    .action((cmdName) => {
      if (!cmdName) {
        program.outputHelp();
        return;
      }
      const cmd = program.commands.find((c) => c.name() === cmdName);
      if (!cmd) {
        console.error(`Unknown command: ${cmdName}`);
        process.exitCode = 1;
        return;
      }
      cmd.outputHelp();
    });

  program
    .command("nearby")
    .description("List upcoming WCA competitions near a place")
    .option("-p, --place <place>", "City/county (requires radius), or country/continent")
    .option("--from <YYYY-MM-DD>", "Start of date range (inclusive)")
    .option("--to <YYYY-MM-DD>", "End of date range (inclusive)")
    .option("--radius-km <km>", "Radius in kilometers (for city/county)", (v) => Number.parseFloat(v))
    .option("--all-at-once", "Collect and print all matches at the end (instead of streaming)")
    .option("--live [minutes]", "Keep polling for new competitions that match the filters (optional duration in minutes)")
    .option("--poll-minutes <minutes>", "Polling interval in minutes (default 2)", (v) => Number.parseFloat(v))
    .option("--limit <n>", "Max competitions to print (default 50)", (v) => Number.parseInt(v, 10))
    .option("--max-pages <n>", "Max API pages to fetch (default 20)", (v) => Number.parseInt(v, 10))
    .option(
      "--assume <kind>",
      "Disambiguation override: point|country|continent (default auto)",
      /^(point|country|continent)$/i,
    )
    .action(async (opts) => {
      const options = {
        place: opts.place,
        from: parseIsoDate(opts.from, "--from"),
        to: parseIsoDate(opts.to, "--to"),
        radiusKm: opts.radiusKm,
        allAtOnce: Boolean(opts.allAtOnce),
        live: opts.live,
        pollMinutes: opts.pollMinutes,
        limit: opts.limit,
        maxPages: opts.maxPages ?? 20,
        assume: opts.assume ? String(opts.assume).toLowerCase() : undefined,
      };
      await handleNearby(options);
    });

  program
    .command("live")
    .description("Like `nearby`, but keeps polling for new matching competitions")
    .option("-p, --place <place>", "City/county (requires radius), or country/continent")
    .option("--from <YYYY-MM-DD>", "Start of date range (inclusive)")
    .option("--to <YYYY-MM-DD>", "End of date range (inclusive)")
    .option("--radius-km <km>", "Radius in kilometers (for city/county)", (v) => Number.parseFloat(v))
    .option("--minutes <minutes>", "How many minutes to run (required)", (v) => Number.parseFloat(v))
    .option("--poll-minutes <minutes>", "Polling interval in minutes (default 2)", (v) => Number.parseFloat(v))
    .option("--limit <n>", "Max competitions to print (default 50)", (v) => Number.parseInt(v, 10))
    .option("--max-pages <n>", "Max API pages to fetch (default 20)", (v) => Number.parseInt(v, 10))
    .option(
      "--assume <kind>",
      "Disambiguation override: point|country|continent (default auto)",
      /^(point|country|continent)$/i,
    )
    .action(async (opts) => {
      if (opts.minutes == null) {
        console.error("`wca live` requires `--minutes <n>` (indefinite mode is not supported).");
        process.exitCode = 1;
        return;
      }
      const options = {
        place: opts.place,
        from: parseIsoDate(opts.from, "--from"),
        to: parseIsoDate(opts.to, "--to"),
        radiusKm: opts.radiusKm,
        allAtOnce: false,
        live: String(opts.minutes),
        pollMinutes: opts.pollMinutes,
        limit: opts.limit,
        maxPages: opts.maxPages ?? 20,
        assume: opts.assume ? String(opts.assume).toLowerCase() : undefined,
      };
      await handleNearby(options);
    });

  program.parse(argv);
}
