async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function iso2FromRestCountry(country) {
  const cca2 = country?.cca2;
  if (typeof cca2 !== "string") return null;
  if (!/^[A-Z]{2}$/.test(cca2)) return null;
  return cca2;
}

export async function continentToIso2List(continentLower) {
  const continent = continentLower.replace(/\b\w/g, (c) => c.toUpperCase());
  // Rest Countries uses region names like "Europe", "Americas", "Oceania", "Africa", "Asia".
  // Map our names to their API.
  const restRegion =
    continentLower === "north america" || continentLower === "south america" ? "Americas" : continent;

  const url = `https://restcountries.com/v3.1/region/${encodeURIComponent(restRegion)}?fields=cca2`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Could not resolve continent: ${continentLower}`);
  }
  const iso2List = data.map(iso2FromRestCountry).filter(Boolean);
  return [...new Set(iso2List)];
}

