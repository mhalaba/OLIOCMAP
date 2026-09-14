/**
 * Wycinek mapy: Polska.
 * Bbox bazuje na presecie kafelków `polska` w sync/tiles.mjs (14.07,49.00,24.29,54.84)
 * plus niewielki margines, żeby gminy przy granicy nie były ucięte.
 */
export const POLAND_MAX_BOUNDS: [[number, number], [number, number]] = [
  [13.92, 48.86],
  [24.35, 55.12],
];

export const POLAND_SOURCE_BOUNDS: [number, number, number, number] = [
  POLAND_MAX_BOUNDS[0][0],
  POLAND_MAX_BOUNDS[0][1],
  POLAND_MAX_BOUNDS[1][0],
  POLAND_MAX_BOUNDS[1][1],
];

export const POLAND_MIN_ZOOM = 5;
export const POLAND_MAX_ZOOM = 16;

/** Uproszczony obrys (CCW), lekko na zewnątrz lądu — dziura maski nie przycina Polski. */
const POLAND_RING: [number, number][] = [
  [14.12, 53.96],
  [14.55, 53.45],
  [14.38, 52.75],
  [14.55, 52.2],
  [14.72, 51.75],
  [14.85, 51.1],
  [15.05, 50.85],
  [15.75, 50.55],
  [16.55, 50.2],
  [16.95, 50.0],
  [17.85, 49.95],
  [18.55, 49.45],
  [19.35, 49.28],
  [20.05, 49.1],
  [20.85, 49.2],
  [21.95, 49.25],
  [22.65, 49.05],
  [23.05, 49.35],
  [23.55, 50.05],
  [24.2, 50.55],
  [24.15, 51.3],
  [23.85, 51.9],
  [23.65, 52.35],
  [23.9, 52.75],
  [23.55, 53.35],
  [23.5, 54.05],
  [22.9, 54.45],
  [21.6, 54.45],
  [20.2, 54.5],
  [19.2, 54.5],
  [18.55, 54.9],
  [17.6, 54.85],
  [16.4, 54.55],
  [15.2, 54.25],
  [14.12, 53.96],
];

function paddedBoundsRing(): [number, number][] {
  const [[west, south], [east, north]] = POLAND_MAX_BOUNDS;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

function worldMinusPoland(): GeoJSON.Feature {
  const hole = POLAND_RING.slice().reverse() as [number, number][];
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [paddedBoundsRing(), hole],
    },
  };
}

export const POLAND_MASK_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [worldMinusPoland()],
};

export function inPolandBounds(lng: number, lat: number): boolean {
  const [[west, south], [east, north]] = POLAND_MAX_BOUNDS;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}
