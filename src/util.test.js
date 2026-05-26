import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm } from "./util.js";

test("haversineKm returns ~0 for identical points", () => {
  assert.ok(haversineKm(0, 0, 0, 0) < 1e-9);
});

test("haversineKm sanity check (LA to SF ~559km)", () => {
  const la = { lat: 34.0522, lon: -118.2437 };
  const sf = { lat: 37.7749, lon: -122.4194 };
  const km = haversineKm(la.lat, la.lon, sf.lat, sf.lon);
  assert.ok(km > 500 && km < 650);
});

