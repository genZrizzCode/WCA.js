import { geocodeNominatim } from "./geocode.js";
import { continentToIso2List } from "./regions.js";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };

const CONTINENTS = new Set([
  "africa",
  "antarctica",
  "asia",
  "europe",
  "north america",
  "south america",
  "oceania",
]);

function normalize(str) {
  return String(str).trim().toLowerCase();
}

countries.registerLocale(enLocale);

function countryNameToIso2(name) {
  const iso2 = countries.getAlpha2Code(String(name), "en");
  return typeof iso2 === "string" ? iso2.toUpperCase() : null;
}

function detectKind(place) {
  const n = normalize(place);
  if (CONTINENTS.has(n)) return "continent";
  if (/^[A-Za-z]{2}$/.test(place.trim())) return "country";
  if (countryNameToIso2(place)) return "country";
  return "point";
}

export async function resolvePlace(placeRaw, { assume } = {}) {
  const kind = assume ?? detectKind(placeRaw);
  const n = normalize(placeRaw);

  if (kind === "continent") {
    const iso2List = await continentToIso2List(n);
    return { kind: "continent", name: placeRaw.trim(), iso2List };
  }

  if (kind === "country") {
    const trimmed = placeRaw.trim();
    let iso2 = null;
    if (/^[A-Za-z]{2}$/.test(trimmed)) iso2 = trimmed.toUpperCase();
    else iso2 = countryNameToIso2(placeRaw);
    if (!iso2) {
      throw new Error(`Could not resolve country: ${placeRaw}`);
    }
    return { kind: "country", iso2 };
  }

  const point = await geocodeNominatim(placeRaw);
  return point;
}
