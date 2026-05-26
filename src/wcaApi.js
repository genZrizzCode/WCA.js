const BASE = "https://www.worldcubeassociation.org/api/v0";

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};
  const parts = linkHeader.split(",").map((p) => p.trim());
  const out = {};
  for (const part of parts) {
    const match = part.match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (!match) continue;
    const [, url, rel] = match;
    out[rel] = url;
  }
  return out;
}

async function fetchJson(url) {
  const headers = {
    accept: "application/json",
    "user-agent": "wcajs-cli/0.1",
  };

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers });
    if (res.ok) {
      // eslint-disable-next-line no-await-in-loop
      const data = await res.json();
      const linkHeader = res.headers.get("link");
      return { data, links: parseLinkHeader(linkHeader) };
    }

    const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`WCA API request failed: ${res.status} ${res.statusText} (${url})`);
    }

    const retryAfter = res.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number.parseFloat(retryAfter) * 1000 : null;
    const backoffMs = 500 * 2 ** (attempt - 1);
    const waitMs = Number.isFinite(retryAfterMs) ? retryAfterMs : backoffMs;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error(`WCA API request failed: exhausted retries (${url})`);
}

export async function fetchCompetitionsOngoingAndUpcoming({ maxPages = 20 } = {}) {
  const all = [];
  for await (const page of iterateCompetitionsOngoingAndUpcoming({ maxPages })) {
    all.push(...page);
  }
  return all;
}

export async function* iterateCompetitionsOngoingAndUpcoming({ maxPages = 20 } = {}) {
  let url = `${BASE}/competitions?ongoing_and_upcoming=true&page=1`;
  for (let page = 1; page <= maxPages && url; page++) {
    if (page === 1) {
      // eslint-disable-next-line no-console
      console.error(`Fetching WCA competitions (up to ${maxPages} pages)...`);
    }
    // eslint-disable-next-line no-await-in-loop
    const { data, links } = await fetchJson(url);
    if (!Array.isArray(data) || data.length === 0) return;
    yield data;
    url = links.next ?? null;
  }
}
