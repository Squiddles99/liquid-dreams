/**
 * The outer shelf's depth contours (lineup truth spec §3a.1), traced by hand-and-script from Andrew's Seamap
 * screenshot `reference/place/new-sattelite-and-bathymetry-references/8-contours-gracetown-to-ellensbrook.webp`
 * (1 m contours, zoom 14, 1:31 691; its 500 m scale bar reads 90.5 px, so 5.5 m per pixel). The image is registered to
 * the game frame by fitting its coastline to the game's own SRTM waterline (public/terrain/womb-land.bin): the Womb's
 * peak is image row 838 and game x = 5.5 · px − 4 749.75 (median misfit 27 m over 1 150 rows). Method, checks and
 * pixel rows: docs/superpowers/evidence/lineup-truth/t0-tracing.md.
 *
 * Game metres: +x east, +z south, origin the Womb's peak. Each contour is sampled every 250 m of z from −2 100 to
 * +1 400 (image 8 rows 456 to 1 093), each point the median of the traced line over ±8 rows. The survey stops
 * 300–500 m short of the beach (its innermost "1 m" line is the survey's edge), so only the 10 m line and deeper are
 * kept. Image 7's zoom was not used: its Womb marker sits on the survey's edge, not on the reef.
 */
export interface CoastContour {
  depthM: number;
  /** [x, z] in game metres, z increasing. */
  points: readonly (readonly [number, number])[];
}

export const COAST_CONTOURS: readonly CoastContour[] = [
  { depthM: 10, points: [[-1019, -2100], [-970, -1850], [-897, -1600], [-790, -1350], [-674, -1100], [-560, -850], [-500, -600], [-467, -350], [-466, -100], [-480, 150], [-496, 400], [-511, 650], [-527, 900], [-550, 1150], [-609, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 11, points: [[-1063, -2100], [-1010, -1850], [-940, -1600], [-830, -1350], [-712, -1100], [-593, -850], [-525, -600], [-499, -350], [-499, -100], [-517, 150], [-535, 400], [-557, 650], [-575, 900], [-615, 1150], [-678, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 12, points: [[-1101, -2100], [-1053, -1850], [-985, -1600], [-871, -1350], [-747, -1100], [-629, -850], [-552, -600], [-529, -350], [-533, -100], [-557, 150], [-581, 400], [-606, 650], [-630, 900], [-676, 1150], [-744, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 13, points: [[-1152, -2100], [-1104, -1850], [-1027, -1600], [-912, -1350], [-784, -1100], [-663, -850], [-583, -600], [-560, -350], [-566, -100], [-594, 150], [-625, 400], [-656, 650], [-684, 900], [-737, 1150], [-805, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 14, points: [[-1191, -2100], [-1146, -1850], [-1070, -1600], [-952, -1350], [-822, -1100], [-697, -850], [-616, -600], [-592, -350], [-601, -100], [-633, 150], [-669, 400], [-705, 650], [-740, 900], [-798, 1150], [-875, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 15, points: [[-1226, -2100], [-1192, -1850], [-1117, -1600], [-993, -1350], [-858, -1100], [-732, -850], [-649, -600], [-617, -350], [-634, -100], [-668, 150], [-711, 400], [-752, 650], [-798, 900], [-861, 1150], [-950, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 16, points: [[-1269, -2100], [-1234, -1850], [-1161, -1600], [-1036, -1350], [-892, -1100], [-764, -850], [-681, -600], [-657, -350], [-676, -100], [-708, 150], [-756, 400], [-806, 650], [-860, 900], [-927, 1150], [-1012, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 17, points: [[-1318, -2100], [-1268, -1850], [-1208, -1600], [-1084, -1350], [-942, -1100], [-800, -850], [-715, -600], [-692, -350], [-716, -100], [-751, 150], [-805, 400], [-861, 650], [-926, 900], [-1005, 1150], [-1091, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 18, points: [[-1373, -2100], [-1324, -1850], [-1253, -1600], [-1128, -1350], [-985, -1100], [-839, -850], [-750, -600], [-729, -350], [-756, -100], [-795, 150], [-855, 400], [-917, 650], [-985, 900], [-1066, 1150], [-1144, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 19, points: [[-1419, -2100], [-1374, -1850], [-1292, -1600], [-1172, -1350], [-1020, -1100], [-879, -850], [-783, -600], [-764, -350], [-793, -100], [-839, 150], [-905, 400], [-970, 650], [-1053, 900], [-1136, 1150], [-1232, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 20, points: [[-1529, -2100], [-1440, -1850], [-1353, -1600], [-1226, -1350], [-1067, -1100], [-922, -850], [-821, -600], [-799, -350], [-832, -100], [-881, 150], [-957, 400], [-1030, 650], [-1116, 900], [-1211, 1150], [-1318, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 21, points: [[-1580, -2100], [-1484, -1850], [-1413, -1600], [-1281, -1350], [-1111, -1100], [-962, -850], [-856, -600], [-834, -350], [-871, -100], [-927, 150], [-1000, 400], [-1094, 650], [-1192, 900], [-1285, 1150], [-1390, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 22, points: [[-1637, -2100], [-1532, -1850], [-1470, -1600], [-1334, -1350], [-1163, -1100], [-1002, -850], [-891, -600], [-852, -350], [-911, -100], [-971, 150], [-1063, 400], [-1162, 650], [-1266, 900], [-1363, 1150], [-1482, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 23, points: [[-1711, -2100], [-1589, -1850], [-1531, -1600], [-1392, -1350], [-1217, -1100], [-1042, -850], [-972, -600], [-930, -350], [-950, -100], [-1029, 150], [-1134, 400], [-1238, 650], [-1345, 900], [-1450, 1150], [-1583, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 24, points: [[-1780, -2100], [-1665, -1850], [-1590, -1600], [-1460, -1350], [-1269, -1100], [-1071, -850], [-989, -600], [-956, -350], [-1006, -100], [-1093, 150], [-1203, 400], [-1316, 650], [-1430, 900], [-1540, 1150], [-1681, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 25, points: [[-1848, -2100], [-1738, -1850], [-1670, -1600], [-1543, -1350], [-1342, -1100], [-1111, -850], [-1024, -600], [-1007, -350], [-1067, -100], [-1158, 150], [-1274, 400], [-1391, 650], [-1512, 900], [-1630, 1150], [-1808, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 26, points: [[-1943, -2100], [-1818, -1850], [-1753, -1600], [-1620, -1350], [-1418, -1100], [-1195, -850], [-1080, -600], [-1072, -350], [-1126, -100], [-1221, 150], [-1356, 400], [-1490, 650], [-1607, 900], [-1732, 1150], [-1963, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 27, points: [[-2048, -2100], [-1900, -1850], [-1836, -1600], [-1702, -1350], [-1505, -1100], [-1290, -850], [-1136, -600], [-1120, -350], [-1183, -100], [-1292, 150], [-1450, 400], [-1587, 650], [-1714, 900], [-1870, 1150], [-2215, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 28, points: [[-2154, -2100], [-2008, -1850], [-1928, -1600], [-1810, -1350], [-1615, -1100], [-1370, -850], [-1195, -600], [-1177, -350], [-1249, -100], [-1390, 150], [-1549, 400], [-1688, 650], [-1828, 900], [-2001, 1150], [-2370, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 29, points: [[-2314, -2100], [-2125, -1850], [-2059, -1600], [-1912, -1350], [-1715, -1100], [-1473, -850], [-1294, -600], [-1244, -350], [-1352, -100], [-1502, 150], [-1668, 400], [-1810, 650], [-1950, 900], [-2208, 1150], [-2525, 1400]] }, // image 8 rows 456 to 1093
  { depthM: 30, points: [[-2496, -2100], [-2273, -1850], [-2193, -1600], [-2056, -1350], [-1865, -1100], [-1612, -850], [-1406, -600], [-1360, -350], [-1465, -100], [-1629, 150], [-1800, 400], [-1936, 650], [-2133, 900], [-2346, 1150], [-2972, 1400]] }, // image 8 rows 456 to 1093
];

/** A contour's x at z (linear between its points, held at its ends). */
export function contourXAt(c: CoastContour, z: number): number {
  const p = c.points;
  if (z <= p[0][1]) return p[0][0];
  if (z >= p[p.length - 1][1]) return p[p.length - 1][0];
  let i = 0;
  while (z > p[i + 1][1]) i++;
  const t = (z - p[i][1]) / (p[i + 1][1] - p[i][1]);
  return p[i][0] + (p[i + 1][0] - p[i][0]) * t;
}

/**
 * The traced depth at (x, z): linear in x between the two contours either side along the row (the contours run
 * nearly along the coast, so the row is close to the offshore direction). Null inshore of the shallowest contour or
 * beyond the deepest.
 */
export function contourDepthAt(x: number, z: number): number | null {
  let prevX = contourXAt(COAST_CONTOURS[0], z);
  if (x > prevX) return null;
  for (let i = 1; i < COAST_CONTOURS.length; i++) {
    const cx = contourXAt(COAST_CONTOURS[i], z);
    if (x >= cx) {
      const a = COAST_CONTOURS[i - 1].depthM, b = COAST_CONTOURS[i].depthM;
      return a + (b - a) * (prevX - x) / (prevX - cx);
    }
    prevX = cx;
  }
  return x === prevX ? COAST_CONTOURS[COAST_CONTOURS.length - 1].depthM : null;
}

/**
 * The game's waterline (LandHeight.waterlineAt: SHORE_X pinned within 600 m of the reef, easing to the smoothed SRTM
 * waterline by 1 000 m) every 25 m of z from −2 100 to +1 400, so the coast map's beach meets the land without the land
 * file. Derived from public/terrain/womb-land.bin; coastContours.test.ts checks it against LandHeight.
 */
export const COAST_WATERLINE = {
  z0: -2100,
  dz: 25,
  x: [-304.0, -295.2, -286.5, -277.6, -266.3, -253.0, -239.7, -227.7, -217.4, -207.5, -197.1, -183.6, -165.3, -147.0, -129.4, -115.3, -103.8, -93.3, -83.4, -74.4, -66.6, -60.1, -53.6, -46.3, -37.6, -29.0, -20.7, -12.7, -9.7, -6.8, -3.8, -0.8, 2.1, 5.2, 9.9, 14.6, 19.0, 20.6, 21.1, 21.1, 21.1, 21.1, 21.9, 23.6, 26.3, 30.7, 36.7, 44.2, 51.8, 60.1, 67.5, 74.4, 80.6, 85.9, 89.8, 92.4, 93.7, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.0, 94.9, 98.0, 103.7, 112.6, 125.2, 141.5, 160.5, 182.4, 206.4, 232.9, 259.3, 283.5, 306.6, 328.7, 347.2, 360.5, 369.8, 380.0, 389.9, 398.5, 401.4, 402.9, 403.5, 403.4, 403.6, 402.6, 400.7, 398.7, 398.9, 399.5, 399.9, 399.4, 398.2, 393.8, 388.3] as readonly number[],
};

/** The game's waterline x at z (linear between the table's samples, held beyond its ends). */
export function waterlineX(z: number): number {
  const { z0, dz, x } = COAST_WATERLINE;
  const f = Math.min(x.length - 1, Math.max(0, (z - z0) / dz));
  const i = Math.min(x.length - 2, Math.floor(f)), t = f - i;
  return x[i] + (x[i + 1] - x[i]) * t;
}
