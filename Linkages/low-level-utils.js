// =========================
// Vec2 utilities
// =========================
export const Vec2 = {
  make: (x = 0, y = 0) => ({ x, y }),
	copy: (p) => ({x: p.x, y: p.y}),
 
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
 
  scale: (p, s) => ({ x: p.x * s, y: p.y * s }),
  div: (p, s) => ({ x: p.x / s, y: p.y / s }),
 
  dot: (a, b) => a.x * b.x + a.y * b.y,
	
	cross: (p1, p2) => p1.x*p2.y - p1.y*p2.x,
 
  len: (p) => Math.hypot(p.x, p.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
 
  norm: (p) => {
    const l = Math.hypot(p.x, p.y) || 1;
    return { x: p.x / l, y: p.y / l };
  },
 
  dir: (a, b) => Vec2.norm(Vec2.sub(b, a)),
 
  midpoint: (a, b) => Vec2.scale(Vec2.add(a, b), 0.5),
 
  perp: (p) => ({ x: -p.y, y: p.x }),
 
  lerp: (a, b, t) => Vec2.add(a, Vec2.scale(Vec2.sub(b, a), t)),
 
  reflect: (p, center) => Vec2.add(center, Vec2.sub(center, p)),
};


// =========================
// Geometry helpers
// =========================
export const EPS = 1e-12;

export function log(b, x) {
	return Math.log(x)/Math.log(b);
}

export function clamp(v, min, max) {
	return Math.min(Math.max(v, min), max);
}

export function circleIntersections(c0, r0, c1, r1) {
  const d = Vec2.dist(c0, c1);
 
  if (d > r0 + r1 + EPS) {console.log("Circle intersection failure 1. Values were: ", c0, r0, c1, r1); return null;}
  if (d < Math.abs(r0 - r1) - EPS) {console.log("Circle intersection failure 2. Values were: ", c0, r0, c1, r1); return null;}
  if (d < EPS && Math.abs(r0 - r1) < EPS) {console.log("Circle intersection failure 3. Values were: ", c0, r0, c1, r1); return null;}
 
  const a = (r0*r0 - r1*r1 + d*d) / (2*d);
  const h = Math.sqrt(Math.max(0, r0*r0 - a*a));
 
  const dir = Vec2.dir(c0, c1);
  const mid = Vec2.add(c0, Vec2.scale(dir, a));
  const offset = Vec2.scale(Vec2.perp(dir), h);
 
  return [
    Vec2.add(mid, offset),
    Vec2.sub(mid, offset)
  ];
}

export function circleInversion(p, c, r) {
  const v = Vec2.sub(p, c);
  const l2 = Vec2.dot(v, v) || 1;
  return Vec2.add(c, Vec2.scale(v, (r*r)/l2));
}



// =========================
// Drawing helpers
// =========================
export function rgb(r, g, b) {
	return ({r, g, b});
}
export function rgba(c, a = 1) {
	return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

// Color palette
export const Colors = {
  white: rgb(255, 255, 255),
  grey: rgb(127, 127, 127),
	black: rgb(0,0,0),
 
  cookie: rgb(189, 52, 58),
  hero: rgb(233, 102, 46),
  kuno: rgb(109, 81, 72),
  tran: rgb(255, 193, 82),
  citrus: rgb(124, 191, 114),
  arglin: rgb(26, 187, 178),
  azuma: rgb(164, 195, 239),
  kazuki: rgb(54, 57, 218),
  uru: rgb(103, 104, 180),
  avorrion: rgb(142, 108, 159),
  luna: rgb(167, 31, 255),
  nion: rgb(255, 0, 140),
  palfly: rgb(247, 181, 236),
 
	red: rgb(255,0,0),
	green: rgb(0,255,0),
	blue: rgb(0,0,255),
};


// =========================
// Dragging helpers
// =========================

export function dragCircle(dragger, r, c) {
  return Vec2.add(c, Vec2.scale(Vec2.dir(c, dragger), r));
}

export function slider(dragger, n, p) {
	const N = Vec2.norm(n);
  return Vec2.dot(Vec2.sub(dragger, p), N);
}

export function dragLine(dragger, n, p) {
	const N = Vec2.norm(n);
  const l = slider(dragger, N, p);
  return Vec2.add(p, Vec2.scale(N, l));
}

/**
 * I am aware that this copy operation has some flaws, but I do not understand them enough to deal with them elegantly at time of writing.
 * If things that should be independent copies suddenly point to the same reference, this might well be the source of the issue.
 *
 * @param {Any} [value] - The value to clone.
 */
function recursiveClone(value) {
	if (typeof value?.clone === "function") {
		return value.clone();
	}

	if (Array.isArray(value)) {
		return value.map(recursiveClone);
	}

	/*
	if (value instanceof Map) {
		return new Map([...value].map([k,v] => [recursiveClone(k), recursiveClone(v)]));
	}
	*/

	if (value instanceof Set) {
		return new Set([...value].map(recursiveClone));
	}

	return value;
}

/**
 * Clones the entries of a class and returns them as a set.
 *
 * @param {class} [class_to_clone] - The class whose entries should be cloned.
 */
export function cloneClassEntries(class_to_clone) {
	let options = {};
	for (const [key, value] of Object.entries(class_to_clone)) {
		options[key] = recursiveClone(value);
	}

	return options;
}
