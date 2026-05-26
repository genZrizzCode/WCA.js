function toNumber(val) {
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

async function geocodeOpenMeteo(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "wcajs-cli/0.1",
    },
  });
  if (!res.ok) throw new Error(`Open-Meteo geocoding failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  if (!first) throw new Error(`No geocoding results for: ${query}`);

  const lat = toNumber(first.latitude);
  const lon = toNumber(first.longitude);
  if (lat == null || lon == null) throw new Error(`Invalid geocoding coordinates for: ${query}`);

  const nameParts = [
    first.name,
    first.admin1,
    first.country,
  ].filter(Boolean);
  return { kind: "point", name: nameParts.join(", ") || query, lat, lon };
}

async function geocodeNominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      // Nominatim often blocks generic/invalid UA strings; allow a real contact via env var.
      "user-agent": process.env.WCAJS_USER_AGENT || "wcajs-cli/0.1 (contact: set WCAJS_USER_AGENT)",
    },
  });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) throw new Error(`No geocoding results for: ${query}`);

  const lat = toNumber(first.lat);
  const lon = toNumber(first.lon);
  if (lat == null || lon == null) throw new Error(`Invalid geocoding coordinates for: ${query}`);
  return { kind: "point", name: first.display_name ?? query, lat, lon };
}

export async function geocodePlace(query) {
  try {
    return await geocodeOpenMeteo(query);
  } catch {
    return geocodeNominatim(query);
  }
}

// Backwards-compatible name (used by place.js)
export { geocodePlace as geocodeNominatim };
