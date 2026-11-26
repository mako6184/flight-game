// Skyline Run — shared tuning constants for the world, the aircraft and the course.
// Everything the other modules need to agree on lives here: dimensions in metres,
// speeds in metres per second, angles in radians unless a name says otherwise.

export const WORLD = {
  // The course runs north along +z from the start line to the runway threshold.
  startZ: 150,
  courseEndZ: 5600,
  // Valley centre line wanders with z; terrain.js builds the heightfield around it.
  valleyHalfWidth: 700,
  ridgeHeight: 300,
  floorBase: 6,
  floorRise: 0.0035,
  waterDrop: 2.6,
  riverHalfWidth: 48,
  snowLine: 235,
};

export const RUNWAY = {
  // A flat strip on the valley floor at the end of the course.
  z0: 4980,
  z1: 5440,
  halfWidth: 24,
  heading: 0, // aligned with +z, like the valley
};

export const PLANE = {
  startSpeed: 62,
  minSpeed: 26,
  maxSpeed: 97,
  idleSpeed: 27,
  stallSpeed: 34,
  startFuel: 100,
  fuelBurnIdle: 0.14,
  fuelBurnFull: 0.62,
  pitchRate: 1.15,
  rollRate: 2.3,
  maxPitch: 0.55,
  minPitch: -0.52,
  maxRoll: 1.02,
  groundClearance: 2.2,
};

export const COURSE = {
  parSeconds: 150,
  ringRadius: 16,
  ringPoints: 100,
  ringCentreBonus: 100,
  landingTimeBonusPerSecond: 5,
  landingBasePoints: 300,
};

// Ring placements down the valley: z, offset from the valley centre line, height
// above the valley floor. terrain.js resolves them to absolute positions.
export const RING_LAYOUT = [
  { z: 620, dx: 0, aboveFloor: 46 },
  { z: 1060, dx: -55, aboveFloor: 58 },
  { z: 1500, dx: 65, aboveFloor: 42 },
  { z: 1980, dx: -15, aboveFloor: 74 },
  { z: 2450, dx: 95, aboveFloor: 52 },
  { z: 2900, dx: -85, aboveFloor: 66 },
  { z: 3380, dx: 30, aboveFloor: 44 },
  { z: 3850, dx: -40, aboveFloor: 80 },
  { z: 4300, dx: 80, aboveFloor: 55 },
  { z: 4720, dx: 0, aboveFloor: 40 },
];

export const SKY = {
  top: '#2e63a8',
  mid: '#7fb2e0',
  horizon: '#dceefb',
  fog: '#cfe4f6',
  sunDirection: { x: -0.45, y: 0.62, z: 0.64 },
};
