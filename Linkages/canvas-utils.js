import {
	
} from "./linkage-utils.js"

import {
	Vec2,
	rgb, rgba, Colors,
	EPS, log, clamp, circleIntersections, circleInversion,
} from "./low-level-utils.js"

// =========================
// Canvas setup
// =========================
 
const smallToLargeGrid = 4;
const startGridSize = 100;
const minGridSize = startGridSize / smallToLargeGrid**2;
const maxGridSize = startGridSize * smallToLargeGrid;


export function createState() {
	return {
		gridSize : startGridSize,
		smallToLargeGrid : smallToLargeGrid,
		gridSizeMin : 25,
		gridSizeMax : 400,
		wrapper : null,
		canvas : null,
		rect : null,
		ctx : null,
		center : null,
		dragging : null,
		linkages : null,
		activeLinkage : null,
		lastPos : null,
		active : false,
		joints : [],
		activeJoint : null,
	};
};

export function isCanvasActive(state){
	return state.active;
}

export function activateCanvas(state){
	state.canvas.classList.add("active");
	state.wrapper.classList.add("active");
	state.active = true;
}

export function deactivateCanvas(state){
	state.canvas.classList.remove("active");
	state.wrapper.classList.remove("active");
	state.active = false;
}

export function activateAndDeactivateCanvas(state){
	document.addEventListener("mousedown", (e) => {
		if(!state.wrapper.contains(e.target) && isCanvasActive(state)) {
			deactivateCanvas(state);
		}
	});

	document.addEventListener("wheel", (e) => {
		if(!state.wrapper.contains(e.target) && isCanvasActive(state)) {
			deactivateCanvas(state);
		}
	});

	document.addEventListener("keydown", (e) => {
		if (e.key == "Escape" && isCanvasActive(state)) {
			deactivateCanvas(state);
		}
	});

	state.wrapper.addEventListener("click", () => {
		if(!isCanvasActive(state)){
			activateCanvas(state);
		}
	});
}

export function handleMouseOnCanvas(state, onMouseDown, onMouseUp, onMouseMove){
	state.canvas.addEventListener("mousedown", (e) => {
		if (!isCanvasActive(state)) { return; }
		const client = screenToGrid(state, getCanvasCoords(state, { x: e.clientX, y: e.clientY }));
		onMouseDown(state, client);
	});

	document.addEventListener("mousemove", (e) => {
		if (!isCanvasActive(state)) { return; }
		const client = screenToGrid(state, getCanvasCoords(state, { x: e.clientX, y: e.clientY }));
		onMouseMove(state, client);
	});

	document.addEventListener("mouseup", () => {
		if (!isCanvasActive(state)) { return; }
		onMouseUp(state);
	});
}

export function handleWheelOnCanvas(state, onWheel=zoomCanvas){
	state.canvas.addEventListener("wheel", (e) => {
		if (!isCanvasActive(state)) { return; }
		e.preventDefault();
		zoomCanvas(state, e);
	});
}

export function handleMouseOnParentDefault(event, state){
	if (event.data.type == "deactivate") {
		deactivateCanvas(state);
	}
}

// ========================
// Default initialization
// ========================

/**
 * @typedef {Object} init_options
 * @property {onMouseDown} A function of (state, client) to handle mouse down behaviour.
 * @property {onMouseUp} A function of (state) to handle mouse up behaviour.
 * @property {onMouseMove} A function of (state, client) to handle mouse movement behaviour.
 * @property {handleMouseOnParent} A function of (event, state) that handles mouse interactions with the parent element of the document. "event" is a message sent down from the parent element.
 * @property {calculateCenter} A function of (state) that calculates where to place the center of the image on the canvas in relation to the canvas.
 * @property {resize} A function of (state, calculateCenter) to handle window resizing.
 * @property {loop} A function of (state) to handle the event loop each frame.
 */

/**
 * The default canvas initializer function
 *
 * param {String} classToSelect - The name of the class that a canvas should belong to in order to display the desired linkages.
 *
 * @param {function} initializeLinkages - A function that returns a new array of the linkages to be displayed.
 *
 * @param {array} sharedLinkages - An array of linkages to be displayed that will be shared between all selected canvases that are also of the class "shared".
 *
 * @param {init_options} init_options - The optional initialization parameters.
 */

export function initDefault(classToSelect, initializeLinkages, sharedLinkages, init_options = {}) {
  const canvases = document.querySelectorAll(`.${classToSelect}`);
	canvases.forEach(canvas => {
		initCanvasDefault(canvas, init_options, initializeLinkages, sharedLinkages);
	});
}

export function initCanvasDefault(canvas, options, initializeLinkages, sharedLinkages) {
	const state = createState();

	const wrapper = canvas.parentElement;

	state.wrapper = wrapper;
	state.canvas = canvas;
	state.rect = canvas.getBoundingClientRect();
	state.ctx = canvas.getContext("2d");
	state.dragging = "";
	state.linkages = sharedLinkages;

	canvas.width = state.rect.width;
	canvas.height = state.rect.height;
	state.center = (options.calculateCenter ?? calculateCenterDefault)(state);

	activateAndDeactivateCanvas(state);
	handleMouseOnCanvas(state, options.onMouseDown ?? onMouseDownDefault, options.onMouseUp ?? onMouseUpDefault, options.onMouseMove ?? onMouseMoveDefault);
	handleWheelOnCanvas(state);
	window.addEventListener("resize", () => { (options.resize ?? resizeDefault)(state, options.calculateCenter ?? calculateCenterDefault) });
	window.addEventListener("message", (event) => { (options.handleMouseOnParent ?? handleMouseOnParentDefault) (event, state) });

	if(!canvas.classList.contains("shared")) {
		state.linkages = initializeLinkages();
	}

	for (const linkage of state.linkages) {
		for (const joint of linkage.getJoints()) {
			state.joints.push(joint);
		}
	}

	updateDefault(state);
	(options.loop ?? loopDefault)(state);
}

// =========================
// Default interaction
// =========================

function updateDefault(state) {
	for (const linkage of state.linkages){
		linkage.update();
	}
}

function calculateCenterDefault(state) {
	return {x: state.canvas.width/2, y: state.canvas.height/2};
}

function resizeDefault(state, calculateCenter) {
	state.canvas.width = state.rect.width;
	state.canvas.height = state.rect.height;
	state.rect = state.canvas.getBoundingClientRect();
	state.center = calculateCenter(state);
}

function onMouseDownDefault(state, client) {
	const hitbox = Math.max(10/state.gridSize, 1/10);
	/*
	state.activeJoint = null;
	
	for (const joint of state.joints) {
		if (Vec2.dist(joint.getPt(), client) < hitbox && joint.draggable) {
			joint.movement_source = "client";
			console.log(joint);
			state.activeJoint = joint;
			break;
		}
	}

	if (!state.activeJoint) {
		state.dragging = "screen";
		state.lastPos = gridToScreen(state, client);
	}
	*/

	state.activeLinkage = null;

	for (const linkage of state.linkages) {
		linkage.onMouseDown(client, hitbox);
		if (linkage.dragging == null) { continue; }

		state.activeLinkage = linkage;
		state.dragging = "linkage";
		break;
	}

	if (!state.activeLinkage) {
		state.dragging = "screen";
		state.lastPos = gridToScreen(state, client);
	}
}

function onMouseMoveDefault(state, client) {
	/*
	if (state.activeJoint) {
		state.activeJoint.setPt(client);

		for (const linkage of state.linkages) {
			linkage.update();
		}
	}
	*/
	if (state.dragging == "") { return; }
 
	if (state.activeLinkage) {								// It is necessary to handle them all in case some of them are connected.
		for (const linkage of state.linkages) {
			linkage.onDrag(client);
			linkage.update();
		}
	}
	if (state.dragging === "screen") {
		const d = Vec2.sub(gridToScreen(state, client), state.lastPos);
		state.lastPos = gridToScreen(state, client);
		state.center = Vec2.add(state.center, d);
	}
}

function onMouseUpDefault(state) {
	state.dragging = "";
	/*
	state.activeJoint.movement_source = "";
	state.activeJoint = null;
	*/
	for (const linkage of state.linkages) {
		linkage.stopDragging();
		linkage.update();
	}
}

// =========================
// Render loop
// =========================
function drawDefault(state) {
	drawDefaultBackground(state);

	for (let i=0; i<state.linkages.length; i++){
		state.linkages[i].render(state);
	}
}

function loopDefault(state) {
  drawDefault(state);
  requestAnimationFrame(() => loopDefault(state));
}

// =========================
// Coordinate transforms
// =========================

export function getCanvasCoords(state, client) {
	state.rect = state.canvas.getBoundingClientRect();
  return { x: client.x - state.rect.left, y: client.y - state.rect.top };
}

export function gridToScreen(state, p) {
	const P = {x: p.x, y: -p.y};
  return Vec2.add( Vec2.scale(P, state.gridSize), state.center);
}

export function screenToGrid(state, p) {
  const P = Vec2.div( Vec2.sub(p, state.center), state.gridSize);
	return {x: P.x, y: -P.y};
}

export function zoomCanvas(state, evnt) {
	const screenClient = getCanvasCoords(state, { x: evnt.clientX, y: evnt.clientY });
	const posBefore = screenToGrid(state, screenClient);
	
	const zoom = Math.exp(-evnt.deltaY * 0.002);
  state.gridSize *= zoom;
	state.gridSize = clamp(state.gridSize, minGridSize, maxGridSize);
	
	const posAfter = screenToGrid(state, screenClient);
	const offset = Vec2.sub(posAfter, posBefore);
	state.center = Vec2.add(state.center, Vec2.scale({x: offset.x, y: -offset.y}, state.gridSize));
}

// =========================
// Drawing
// =========================

export function drawLine(state, p1, p2, width, col) {
	const P1 = gridToScreen(state, p1);
	const P2 = gridToScreen(state, p2);
  state.ctx.beginPath();
  state.ctx.moveTo(P1.x, P1.y);
  state.ctx.lineTo(P2.x, P2.y);
  state.ctx.lineWidth = width;
  state.ctx.strokeStyle = col;
  state.ctx.stroke();
}

export function drawFullScreenLine(state, n, p, width, col) {
  const Pscreen = gridToScreen(state, p);
  const scale = Vec2.dist(Pscreen, furthestCorner(state, Pscreen));
  const dir = Vec2.norm({x: n.x, y: -n.y});
	const dynamicWidth = width;
 
  const start = screenToGrid(state, Vec2.sub(Pscreen, Vec2.scale(dir, scale)));
  const end   = screenToGrid(state, Vec2.add(Pscreen, Vec2.scale(dir, scale)));
 
	drawLine(state, start, end, dynamicWidth, col);
}

export function drawGrid(state, size, col, p) {
	const spaceBottom = Math.floor((state.canvas.height - gridToScreen(state, p).y) / size);
	const spaceLeft = Math.floor((gridToScreen(state, p).x) / size);
	const lineWidth = Math.min(size/100, 2);
 
	for (let i = 0; i < state.canvas.height/size; i++) {
		drawFullScreenLine(state, { x: 1, y: 0}, { x: 0, y: size/state.gridSize * (i - spaceBottom) }, lineWidth, col);
	}
	for (let i = 0; i < state.canvas.width/size; i++) {
		drawFullScreenLine(state, { x: 0, y: 1}, { x: size/state.gridSize * (i - spaceLeft), y: 0 }, lineWidth, col);
	}
}

export function drawDefaultBackground(state) {
	state.ctx.fillStyle = rgba(Colors.azuma);
  state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

	for (let i = Math.ceil(log(state.smallToLargeGrid, state.gridSize/state.gridSizeMax)); i < Math.floor(log(state.smallToLargeGrid, state.gridSize/state.gridSizeMin))+1; i++) {
		drawGrid(state, state.gridSize/Math.pow(state.smallToLargeGrid, i), rgba(Colors.kazuki), screenToGrid(state, state.center));
	}
}

export function drawLink(state, link) {
	const P = Vec2.sub(link.end, link.start);
	const n = Vec2.norm(Vec2.perp(P));
	const sun = Vec2.norm(Vec2.make(0, 1));

	const maxOpac = 0.5;
	const minOpac = 0.1;
	const opac1 = minOpac + (maxOpac - minOpac) * (Vec2.dot(n, sun) + 1)/2;
	const opac2 = maxOpac + minOpac - opac1;

	const mainWidth = Math.max(state.gridSize/10, 5);
	const shadowWidth = mainWidth/4;

	drawLine(state, link.start, link.end, mainWidth, link.col());
 
	const N = Vec2.scale(n, (shadowWidth - mainWidth)/(2*state.gridSize));
	// First shadow
	drawLine(state, Vec2.add(link.start, N), Vec2.add(link.end, N), shadowWidth, rgba(Colors.black, opac1));
 
	// Second shadow
	drawLine(state, Vec2.sub(link.start, N), Vec2.sub(link.end, N), shadowWidth, rgba(Colors.black, opac2));
}

export function drawJoint(state, p) {
	if(p.is_anchor == true) { drawAnchor(state, p); }
	else if(p.is_anchor == false) { drawNonAnchor(state, p); }
	else { console.log("Don't know which joint type to draw for ", p) }
}

export function drawNonAnchor(state, p) {
	// In case the function is explicitly called
	if(p.is_anchor == true) {
		console.log("Drawing a regular joint at an anchor");
	}

  const P = gridToScreen(state, p);
	const radius = Math.max(state.gridSize/10, 5);
	state.ctx.beginPath();
 
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
 
    const point = Vec2.add(P, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    });
 
    if (i == 0) { state.ctx.moveTo(point.x, point.y); }
    else { state.ctx.lineTo(point.x, point.y); }
  }

  state.ctx.closePath();
  state.ctx.fillStyle = p.col();
  state.ctx.fill();
	state.ctx.lineWidth = state.gridSize/50;
	state.ctx.strokeStyle = rgba(Colors.grey);
	state.ctx.stroke();
}


export function drawAnchor(state, p) {
	// In case the function is explicitly called
	if(p.is_anchor == false) {
		console.log("Drawing an anchor at a regular joint");
	}

  const P = gridToScreen(state, p);
	const radius = 1.2 * Math.max(state.gridSize/10, 5);
	state.ctx.beginPath();

  for (let i = 0; i < 4; i++) {
    const angle = (0.5 + i) * Math.PI / 2;
 
    const point = Vec2.add(P, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    });
 
    if (i == 0) { state.ctx.moveTo(point.x, point.y); }
    else { state.ctx.lineTo(point.x, point.y); }
  }

  state.ctx.closePath();
  state.ctx.fillStyle = p.col();
  state.ctx.fill();
	state.ctx.lineWidth = state.gridSize/50;
	state.ctx.strokeStyle = rgba(Colors.grey);
	state.ctx.stroke();
}

export function drawVelocity(state, joint, widthMultiplier = 1) {
	const col = joint.velocity.col;
	const start = joint.velocity.start;
	const dir = joint.velocity.direction;
	
	const tip = Vec2.add(start, dir);
	
	const perp = Vec2.perp(dir);
	const end1 = Vec2.add( Vec2.lerp(start, tip, 0.8), Vec2.scale(perp, 0.2) );
	const end2 = Vec2.sub( Vec2.lerp(start, tip, 0.8), Vec2.scale(perp, 0.2) );

	drawLine(state, start, tip, 2 * widthMultiplier, col);
	drawLine(state, tip, end1, 2 * widthMultiplier, col);
	drawLine(state, tip, end2, 2 * widthMultiplier, col);
}

// =========================
// Other canvas help
// =========================

export function gridToCustomCoords(p, origin, X, Y) {
	const v = Vec2.sub(p, origin);
	const det = X.x * Y.y - X.y * Y.x;
	if (Math.abs(det) < EPS) {
		return Vec2.make(0, 0);
	}
	const x = (v.x * Y.y - v.y * Y.x) / det;
	const y = (X.x * v.y - X.y * v.x) / det;
	return Vec2.make(x, y);
}

export function customCoordsToGrid(p, oldOrigin, oldX, oldY) {
	const Px = Vec2.scale(oldX, p.x);
	const Py = Vec2.scale(oldY, p.y);
	const P = Vec2.add(Vec2.add(Px, Py), oldOrigin);
	return P;
}

/** 
 * This takes in a screenspace point!!
 */
export function furthestCorner(state, p) {
	const clampX = clamp(Math.round(p.x/state.canvas.width), 0, 1);
	const clampY = clamp(Math.round(p.y/state.canvas.height), 0, 1);
	const P = {x: clampX, y: clampY};
	return {x: state.canvas.width - P.x * state.canvas.width, y: state.canvas.height - P.y * state.canvas.height};
}
