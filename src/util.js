function toNum(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;

  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLon / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function withinRadiusKm(origin, competition, radiusKm) {
  const lat = toNum(competition.latitude_degrees);
  const lon = toNum(competition.longitude_degrees);
  if (lat == null || lon == null) return false;
  return haversineKm(origin.lat, origin.lon, lat, lon) <= radiusKm;
}

withinRadiusKm.distanceKm = (origin, competition) => {
  const lat = toNum(competition.latitude_degrees);
  const lon = toNum(competition.longitude_degrees);
  if (lat == null || lon == null) return Number.POSITIVE_INFINITY;
  return haversineKm(origin.lat, origin.lon, lat, lon);
};

function countryNameFromIso2(iso2) {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

export function formatCompetition(competition, { origin } = {}) {
  const parts = [];
  parts.push(`${competition.name}`);
  const where = [];
  if (competition.city) where.push(competition.city);
  if (competition.country_iso2) where.push(countryNameFromIso2(competition.country_iso2.toUpperCase()));
  if (where.length) parts.push(`(${where.join(", ")})`);
  if (competition.start_date) parts.push(`- ${competition.start_date}`);

  if (origin && origin.kind === "point") {
    const d = withinRadiusKm.distanceKm(origin, competition);
    if (Number.isFinite(d)) parts.push(`- ${d.toFixed(1)} km`);
  }
  if (competition.url) parts.push(`- ${competition.url}`);
  return parts.join(" ");
}

