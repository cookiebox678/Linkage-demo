import {
	Vec2,
	rgb, rgba, Colors,
	EPS, log, clamp, circleIntersections, circleInversion,
	dragCircle, slider, dragLine,
	cloneClassEntries,
} from "./low-level-utils.js"

import {
	drawJoint, drawLink, drawLine, drawVelocity,
} from "./canvas-utils.js"


// =========================
// Joint class
// =========================

/**
 * @typedef {Object} joint_options
 * @property {boolean} [is_anchor = false] - Whether the joint is an anchor. true when it is, false when it is not.
 * @property {boolean} [draggable = true] - Whether the joint should be interactively draggable or not.
 * @property {boolean} [hidden = false] - Whether the joint should be hidden or drawn.
 * @property {boolean} [showVelocity = false] - Whether the joint velocity should be drawn or not.
 */

/**
 * @param {point} [point] - the position of the joint.
 * @param {bool} 
 */
export class Joint {
	constructor(point, options = {}) {
		this.x = point.x;
		this.y = point.y;
		this.is_anchor = options.is_anchor ?? false;
		this.draggable = options.draggable ?? true;
		this.movement_source = options.movement_source ?? "";
		this.dragging = options.dragging ?? false; // DEPRECATED
		this.velocity = options.velocity ?? new VelocityVector(point, Vec2.make(0,0));
		this.showVelocity = options.showVelocity ?? false;
		this.hidden = options.hidden ?? false;
	}

	col() {
		if (this.draggable) { return rgba(Colors.green); }
		if (this.is_anchor) { return rgba(Colors.red); }
		return rgba(Colors.grey);
	}

	setPt(p) {
		this.x = p.x;
		this.y = p.y;
	}

	getPt() {
		return {x : this.x, y : this.y};
	}

	clone() {
		const cloned_options = cloneClassEntries(this);
		return new Joint(this.getPt(), cloned_options);
	}
}



// =========================
// Linkage joint classes
// =========================


// =========================
// Link class
// =========================

/**
 * @param {Joint} [start] - The start of the link.
 * @param {Joint} [end] - The end of the link.
 * @param {rgba} [colour = rgba(Colours.grey)] - Which base colour the link should have.
 * @param {float} [stress = 0] - The level of mechanical stress the link is experiencing.
 * @param {boolean} [hidden = false] - Whether the link should be hidden or drawn.
 */
export class Link {
	constructor(start, end, options = {}) {
		this.start = start;
		this.end = end;
		this.stress = options.stress ?? 0;
		this.hidden = options.hidden ?? false;
		this.default_col = options.default_col ?? rgba(Colors.grey);
		this.showStress = options.showStress ?? false;
	}

	col() {
		if (this.showStress) {
		return rgba(rgb(255 * (1 + 7 * this.stress) / 2, 255/2, 255 * (1 - 7 * this.stress)/2));
		}
		return this.default_col;
	}

	getLength() {
		return Vec2.dist(this.start, this.end);
	}

	clone() {
		const cloned_options = cloneClassEntries(this);
		return new Link(this.start, this.end, cloned_options);
	}
}

export class VelocityVector {
	constructor(start, direction, options = {}) {
		this.start = start;
		this.direction = direction;
		this.colour = options.colour ?? rgba(Colors.black);
	}

	setEndpoint(p) {
		this.direction = Vec2.sub(p, this.start);
	}

	clone() {
		// This copy operation only goes as deep as the chain of built-in copy() methods in each property.
		// If there is a property like this.path = new Path() and this.path.copy() does not exist, then the path is copied by reference.
		let options = {};
		for (const [key, value] of Object.entries(this)) {
			const copied_value = (typeof value?.copy === "function") ? value.copy() : value;
			options[key] = copied_value;
		}

		return new VelocityVector(this.start, this.direction, options);
	}
}


// =========================
// Linkage link classes
// =========================

// =========================
// General helper functions
// =========================

function offsetLinkageJoints(linkage) {
	for (const joint of linkage.getJoints()) {
		if (joint == linkage.A1) {continue;}
		const newPoint = Vec2.add(joint, Vec2.sub(linkage.offset, linkage.A1));
		joint.setPt( newPoint );
	}
	linkage.A1.setPt( linkage.offset );
}

function updateJointVelocityOrigins(jointArray) {
	for (const joint of jointArray) {
		joint.velocity.start = joint.getPt();
	}
}

function drawLinkageOutputLine(state, linkage) {
	const limPos = linkage.findLimitPositions("output");
	for (let i = 0; i < limPos.length; i += 2) {
		drawLine(state, limPos[i], limPos[i+1], 3, "red");
	}
}

function drawLinkageLinks(state, linkage) {
	for (const link of linkage.getLinks()) {
		if (link.hidden) { continue; }
		drawLink(state, link);
	}
}

function drawLinkageJoints(state, linkage) {
	for (const joint of linkage.getJoints()) {
		if (joint.hidden) { continue; }
		drawJoint(state, joint);

		if (joint.showVelocity || linkage.showAllVelocities) { 
			drawVelocity(state, joint);
		}
	}
}

function handleDragging(linkage, client, hitbox) {
	//this.dragging encodes which joint of the linkage is being manually dragged, while
	//joint.dragging encodes whether a joint is being dragged. In particular, it is set 
	//if the joint is dragged along by the rest of the linkage, even if not by the user.

	linkage.dragging = null;
	for (const joint of linkage.getJoints()) {
		if(Vec2.dist(client, joint) < hitbox && joint.draggable) {
			joint.dragging = true;
			linkage.dragging = joint;
			break;
		}
	}

	if(linkage.dragging == null) { return; }
	for (const joint of linkage.getJoints()) {
		joint.dragging = true;
	}
}

function dragCrankDefault(linkage, client) {
	const desiredCrankPosition = linkage.dragging == null ? linkage.crank : client;
	linkage.crank.setPt( dragCircle(desiredCrankPosition, Vec2.dist(linkage.A1, linkage.A2), linkage.A2) );
}

// =========================
// PL class
// =========================
 
/**
 * @typedef {Object} PL_options
 * @property {Joint} [A1 = new Joint({x:0,y:0}, true)] Anchor point 1.
 * @property {Joint} [A2 = new Joint({x:0,y:1}, true)] Anchor point 2.
 * @property {Joint} [crank = new Joint({x:0,y:2}, false)] Crank point.
 * @property {Joint} [output = new Joint({x:0,y:3}, false)] Output point.
 *
 * @property {point} [offset = {x:0,y:0}] Offset the whole linkage. The point A1 lands on the offset point.
 *
 * @property {number} [Lrhombus] Length of both rhombus sides (used if Lrhombus1/Lrhombus2 not provided).
 * @property {number} [Lrhombus1 = 2] Length of first rhombus side.
 * @property {number} [Lrhombus2 = 2] Length of second rhombus side.
 *
 * @property {boolean} [symmetric = true] Whether the linkage is and should stay symmetric (gets overwritten if it isn't initialized symmetrically).
 *
 * @property {boolean} [dragA1 = true] Allow dragging the first anchor point to move the whole linkage.
 * @property {boolean} [dragA2 = true] Allow dragging the second anchor point.
 * @property {boolean} [dragCrank = true] Allow dragging the crank point.
 * @property {boolean} [dragRocker = true] Allow dragging the rocker points.
 * @property {boolean} [dragOutput = true] Allow dragging the output point.
 * @property {boolean} [drawOutputLine = true] Allow drawing the range of possible output positions.
 *
 * @property {number} [side1Folded = 0] Folding state of side 1.
 * @property {number} [side2Folded = 1] Folding state of side 2.
 *
 * @property {rgba} [rockerCol] Color of the rocker links.
 * @property {rgba} [rhombusCol] Color of the rhombus.
 * @property {rgba} [crankCol] Color of the crank.
 */

/**
 * Creates a new Peaucellier-Lipkin linkage object.
 * When the crank and the output positions are incompatible, the crank stays in place and the output adjusts.
 *
 * @param {PL_options} [options={}] Configuration options.
 */

export class PL {
	constructor(options = {}) {

    this.A1 = options.A1 ?? new Joint({ x: 0, y: 0 }, {is_anchor: true});
    this.A2 = options.A2 ?? new Joint({ x: 0, y: 1 }, {is_anchor: true});
		this.offset = options.offset ?? this.A1.getPt();

    this.crank = options.crank ?? new Joint({ x: 0, y: 2 });
    this.output = options.output ?? new Joint({ x: 0, y: 3 });

		this.symmetric = true;
		
		if ((options.Lrhombus1 != options.Lrhombus2) || options.symmetric === false) {
			this.symmetric = false;
		}

		this.Lrhombus1 = 2;
		this.Lrhombus2 = 2;
		this.Lrhombus1 = options.Lrhombus1 ?? ( options.Lrhombus ?? this.Lrhombus1 );
		this.Lrhombus2 = options.Lrhombus2 ?? ( options.Lrhombus ?? this.Lrhombus2 );

		this.Lrocker1 = Math.sqrt( this.Lrhombus1**2 - Vec2.dist(this.crank, this.output)**2/4 + Vec2.dist(this.A1, Vec2.midpoint(this.crank, this.output))**2 );
		this.Lrocker2 = Math.sqrt( this.Lrhombus2**2 - Vec2.dist(this.crank, this.output)**2/4 + Vec2.dist(this.A1, Vec2.midpoint(this.crank, this.output))**2 );

		this.side1Folded = options.side1Folded ?? 0;
		this.side2Folded = options.side2Folded ?? 1;

    this.rocker1 = new Joint({ x:  Math.sqrt( this.Lrhombus1 ** 2 - (Vec2.dist(this.output, this.crank)/2)**2 ), y: 2.5 });
    this.rocker2 = new Joint({ x: -Math.sqrt( this.Lrhombus2 ** 2 - (Vec2.dist(this.output, this.crank)/2)**2 ), y: 2.5 });

		this.A1.draggable = options.dragA1 ?? true;
		this.A2.draggable = options.dragA2 ?? true;
		this.crank.draggable = options.dragCrank ?? true;
		this.output.draggable = options.dragOutput ?? true;
		const rockerDraggable = options.dragRocker ?? true;
		this.rocker1.draggable = rockerDraggable;
		this.rocker2.draggable = rockerDraggable;
		this.drawOutputLine = options.drawOutputLine ?? true;


		this.crankCol = options.crankCol ?? rgba(Colors.arglin);
		this.rockerCol = options.rockerCol ?? rgba(Colors.tran);
		this.rhombusCol = options.rhombusCol ?? rgba(Colors.citrus);

		this.LinkA1A2 = new Link(this.A1, this.A2, {default_col: this.crankCol});
		this.LinkA2Crank = new Link(this.A2, this.crank, {default_col: this.crankCol});

		this.LinkA1R1 = new Link(this.A1, this.rocker1, {default_col: this.rockerCol});
		this.LinkA1R2 = new Link(this.A1, this.rocker2, {default_col: this.rockerCol});

		this.LinkCrankR1  = new Link(this.crank, this.rocker1, {default_col: this.rhombusCol});
		this.LinkCrankR2 = new Link(this.crank, this.rocker2, {default_col: this.rhombusCol});
		this.LinkR1Output = new Link(this.rocker1, this.output, {default_col: this.rhombusCol});
		this.LinkR2Output = new Link(this.rocker2, this.output, {default_col: this.rhombusCol});

		this.forceMode = options.forceMode ?? false; //TODO: EXPERIMENTAL AND UNDOCUMENTED
		this.showAllVelocities = this.forceMode || (options.showAllVelocities ?? false); //TODO: EXPERIMENTAL AND UNDOCUMENTED
		this.showAllStresses = this.forceMode || (options.showAllStresses ?? false); //TODO: EXPERIMENTAL AND UNDOCUMENTED

		this.resolveStressView();

		this.offsetLinkage();

		this.dragging = null;
  }

	createNewJoints() {
		return new PLJoints();
	}

	createNewLinks(PLJoints) {
		return new PLLinks(PLJoints);
	}

	getJoints() {
		return [this.A1, this.A2, this.crank, this.rocker1, this.rocker2, this.output];
	}

	getLinks() {
		return [this.LinkA1A2, this.LinkA1R1, this.LinkA1R2, this.LinkA2Crank, this.LinkCrankR1, this.LinkCrankR2, this.LinkR1Output, this.LinkR2Output];
	}

	offsetLinkage() {
		offsetLinkageJoints(this);
	}

	resolveStressView() {
		if (!this.showAllStresses) { return; }

		for (const link of this.getLinks()) {
			link.showStress = true;
		}
	}

	findLimitPositions(crankOrOutput = "crank") {
		const d = Vec2.dist(this.A1, this.A2);
		const direction = Vec2.norm(Vec2.sub(this.A2, this.A1));
		const LrockerMin = Math.min(this.Lrocker1, this.Lrocker2);
		const LrhombusMin = Math.min(this.Lrhombus1, this.Lrhombus2);

		if (crankOrOutput == "crank") {
			const alpha = Math.atan2((this.A2.y-this.A1.y),(this.A2.x-this.A1.x));
			
			const beta = Math.acos( (2 * d**2 - (LrockerMin - LrhombusMin)**2) / (2 * d**2));
			let dir1 = Vec2.scale(Vec2.make(Math.cos(alpha + beta), Math.sin(alpha + beta)), -d);
			let dir2 = Vec2.scale(Vec2.make(Math.cos(alpha - beta), Math.sin(alpha - beta)), -d);
			const limitPos1 = Vec2.add(this.A2, dir1);
			const limitPos2 = Vec2.add(this.A2, dir2);
			let limits = [limitPos1, limitPos2];
			
			const beta2 = Math.acos( (2 * d**2 - (LrockerMin + LrhombusMin)**2) / (2 * d**2));
 
			if (isNaN(beta2)) { return limits; }
 
			dir1 = Vec2.scale(Vec2.make(Math.cos(alpha + beta2), Math.sin(alpha + beta2)), -d);
			dir2 = Vec2.scale(Vec2.make(Math.cos(alpha - beta2), Math.sin(alpha - beta2)), -d);
			const limitPos3 = Vec2.add(this.A2, dir1);
			const limitPos4 = Vec2.add(this.A2, dir2);
			limits.push(limitPos3, limitPos4);
			
			return limits;
		}

		if (crankOrOutput == "output") {
			let deltaX = Math.sqrt((LrhombusMin+LrockerMin)**2 - (slider(this.output, direction, this.A1))**2);
			let deltaY = dragLine(this.output, direction, this.A1);
			let moveX = Vec2.scale(Vec2.perp(direction), deltaX) ;
			let moveY = Vec2.sub(deltaY, this.A1);
			const p0 = Vec2.add(Vec2.add(moveX, moveY), this.A1);
			const p1 = Vec2.add(Vec2.add(Vec2.scale(moveX, -1), moveY), this.A1);
 
			if(LrockerMin + LrhombusMin >= 2*d) { return [p0,p1]; }
 
			deltaX = Math.sqrt((LrhombusMin - LrockerMin)**2 - (slider(this.output, direction, this.A1))**2);
			deltaY = dragLine(this.output, direction, this.A1);
			moveX = Vec2.scale(Vec2.perp(direction), deltaX) ;
			moveY = Vec2.sub(deltaY, this.A1);
			const p2 = Vec2.add(Vec2.add(moveX, moveY), this.A1);
			const p3 = Vec2.add(Vec2.add(Vec2.scale(moveX, -1), moveY), this.A1);
			
			return [p0, p2, p3, p1];
			
		}
	}

	onMouseDown(client, hitbox) {
		handleDragging(this, client, hitbox);
	}

	onDrag(client) {
		if (this.dragging == null && this.getJoints().every(joint => joint.dragging == null)) { return; }

		if (this.forceMode && this.dragging != null) {
			this.dragging.velocity.setEndpoint(client);
			return;
		}

		if (this.dragging == this.crank || (this.dragging == null && this.crank.dragging)) {
			dragCrankDefault(this, client);
		}

		if	(this.dragging == this.rocker1 || (this.dragging == null && this.rocker1.dragging)
			|| this.dragging == this.rocker2 || (this.dragging == null && this.rocker2.dragging)) {
			const i = this.rocker1.dragging ? 1 : 2;
			const j = 3-i;
			const desiredRockerPosition = this.dragging == null ? ( this.rocker1.dragging ? this.rocker1 : this.rocker2 ) : client;

			const midpoint = Vec2.midpoint(this.crank, this.output);
			const n = Vec2.perp(Vec2.sub(this.output, this.A1));

			let l = slider(desiredRockerPosition, n, midpoint);
			const newRhombusLength = Math.sqrt( l * l + Vec2.dist(this.output, midpoint) ** 2 );

			// Update rhombus lengths
			this[`Lrhombus${i}`] = newRhombusLength;
			if (this.symmetric) {
				this[`Lrhombus${j}`] = newRhombusLength;
			}

			// Update folding state
			const folded = l > 0 ? 0 : 1;
			this[`side${i}Folded`] = folded;
			if (this.symmetric) {
				this[`side${j}Folded`] = 1 - folded;
			}

			// Recompute rocker lengths
			l = Vec2.dist(this.A1, this.A2) * slider(this.output, Vec2.sub(this.A2, this.A1), this.A1);
 
			this[`Lrocker${i}`] = Math.sqrt(2 * l + this[`Lrhombus${i}`] ** 2);
			if (this.symmetric) {
				this[`Lrocker${j}`] = this[`Lrocker${i}`];
			}
		}

		if ((this.dragging == this.output) || (this.dragging == null && this.output.dragging)) {
			const desiredOutputPosition = this.dragging == null ? this.output : client;
			const n = Vec2.dir(this.A1, this.A2);
			const d = Vec2.dist(this.A1, this.A2);
			const r = d*slider(desiredOutputPosition, n, this.A1);

			const LrhombusMin = Math.min(this.Lrhombus1, this.Lrhombus2);
			const LrhombusMax = Math.max(this.Lrhombus1, this.Lrhombus2);

			const LminShort = Math.max(LrhombusMin - 2*d, 0);
			const LmaxShort = 2*Vec2.dist(this.A1, this.A2) + LrhombusMin;
			const LminLong = Math.sqrt( LrhombusMax**2 - LrhombusMin**2 );
			const LmaxLong = Math.sqrt( LminLong**2 + LmaxShort**2 );

			const LintendedShort = clamp( Math.sqrt(2*r + LrhombusMin**2), LminShort, LmaxShort );
			const LintendedLong = clamp( Math.sqrt(2*r + LrhombusMax**2), LminLong, LmaxLong );

			if (LintendedShort) {
				this.Lrocker1 = this.Lrhombus1 <= this.Lrhombus2 ? LintendedShort : LintendedLong;
				this.Lrocker2 = this.Lrhombus1 <= this.Lrhombus2 ? LintendedLong : LintendedShort;
			} else {
				this.Lrocker1 = this.Lrhombus1 <= this.Lrhombus2 ? LminShort : LminLong;
				this.Lrocker2 = this.Lrhombus1 <= this.Lrhombus2 ? LminLong : LminShort;
			}

			const Pvec = Vec2.sub(desiredOutputPosition, this.A1);
			const l = Vec2.len(Pvec) || 1;
 
			this.crank.setPt( Vec2.add( this.A1, Vec2.scale(Pvec, (2*r)/(l*l)) ) );
		}

		if (this.dragging == this.A1 || (this.dragging == null && this.A1.dragging)) {
			//const desiredA1Position = this.dragging == null ? this.A1 : client;
			const temp = this.offset;
			this.offset = this.dragging == null ? this.A1.getPt() : client;
			this.A1.setPt( this.dragging == null ? temp : this.A1.getPt() );
			this.offsetLinkage();
		}

		if (this.dragging == this.A2 || (this.dragging == null && this.A2.dragging)) {
			const desiredA2Position = this.dragging == null ? this.A2 : client;
			const LrhombusMin = Math.min(this.Lrhombus1, this.Lrhombus2);
			const LrockerMin = Math.min(this.Lrocker1, this.Lrocker2);

			const crankDir = Vec2.norm(Vec2.sub(this.crank, this.A2));
			const newCrankLength = Math.max(Vec2.dist(desiredA2Position, this.A1), Math.abs(LrhombusMin - LrockerMin)/2 + EPS);
			this.A2.setPt( Vec2.add(Vec2.scale(Vec2.dir(this.A1, desiredA2Position), newCrankLength), this.A1) );
			this.crank.setPt( Vec2.add(Vec2.scale(crankDir, newCrankLength), this.A2) );
		}

		// Clamp crank position to not break the linkage
		const LrockerMin = Math.min(this.Lrocker1, this.Lrocker2);
		const LrhombusMin = Math.min(this.Lrhombus1, this.Lrhombus2);
		const cond1 = Vec2.dist(this.crank, this.A1) - Math.abs(LrockerMin - LrhombusMin);
		const cond2 = LrockerMin + LrhombusMin - Vec2.dist(this.crank, this.A1);

		if (cond1 < 0 || cond2 < 0) {
			const n = this.findLimitPositions();
			let minDist = Infinity;
			let best = this.crank.getPt();
			for (let i = 0; i < n.length; i++) {
				if (minDist > Vec2.dist(this.crank, n[i])) { 
					minDist = Vec2.dist(this.crank, n[i]);
					best = n[i];
				}
			}
			this.crank.setPt( best );
		}

	}

	stopDragging(){
		this.dragging = null;
		for (const joint of this.getJoints()) {
			joint.dragging = false;
		}
	}

	update() {
		if (this.dragging == this.output) {
			this.rockerCol = "red";
			this.LinkA1R1.default_col = this.rockerCol;
			this.LinkA1R2.default_col = this.rockerCol;
		}
		if (this.dragging != this.output) {
			this.rockerCol = rgba(Colors.tran);
			this.LinkA1R1.default_col = this.rockerCol;
			this.LinkA1R2.default_col = this.rockerCol;
		}
 
		const rockerPos1 = circleIntersections(this.A1, this.Lrocker1, this.crank, this.Lrhombus1);
		const rockerPos2 = circleIntersections(this.A1, this.Lrocker2, this.crank, this.Lrhombus2);

		const inversePL = this.Lrocker1 <= this.Lrhombus1 ? 1 : 0;
 
		if (Vec2.dist(this.A1, this.crank) > EPS){
			this.rocker1.setPt( rockerPos1[(inversePL == 0 ? this.side1Folded : 1-this.side1Folded)] );
			this.rocker2.setPt( rockerPos2[(inversePL == 0 ? this.side2Folded : 1-this.side2Folded)] );
		}
		this.crankCol = rgba(Colors.arglin);

		if (!rockerPos1 || !rockerPos2) {
			this.offsetLinkage();
			return;
		}
		const n = Vec2.sub(this.A1, this.crank);
		const midpoint = dragLine(this.rocker1, n, this.A1);
		this.output.setPt( Vec2.reflect(this.crank, midpoint) );

		updateJointVelocityOrigins(this.getJoints());
	}

	render(state) {
		if (this.drawOutputLine) {
			drawLinkageOutputLine(state, this);
		}

		drawLinkageLinks(state, this);
		drawLinkageJoints(state, this);
	}
}


// =========================
// Hart class
// =========================
 
/**
 * @typedef {Object} Hart_options
 * @property {Point} [A1={x:0,y:0}] Anchor point 1.
 * @property {Point} [A2={x:0,y:1}] Anchor point 2.
 * @property {Point} [crank={x:0,y:2}] Crank point.
 * @property {Point} [output={x:0,y:3}] Output point.
 *
 * @property {Point} [offset={x:0,y:0}] Offset the whole linkage. The point A1 lands on the offset point.
 *
 * @property {number} [Lgrounded] Length of the grounded links.
 *
 * @property {boolean} [dragA1=true] Allow dragging the first anchor point to move the whole linkage.
 * @property {boolean} [dragA2=true] Allow dragging the second anchor point to move the whole linkage.
 * @property {boolean} [dragCrank=true] Allow dragging the crank point.
 * @property {boolean} [dragRocker=true] Allow dragging the rocker points.
 * @property {boolean} [dragOutput=true] Allow dragging the output point.
 * @property {boolean} [drawOutputLine=true] Allow drawing the range of possible output positions.
 *
 * @property {boolean} [flipped] Whether to flip the entire linkage.
 *
 * @property {rgba} [groundedCol] Color of the grounded links.
 * @property {rgba} [floatingCol] Color of the non-grounded links.
 * @property {rgba} [crankCol] Color of the crank.
 */

/**
 * Creates a new Hart linkage object.
 *
 * @param {Hart_options} [options={}] Configuration options.
 */

export class Hart {
	constructor(options = {}) {
    this.A1 = options.A1 ?? new Joint({ x: 0, y: 0 }, {is_anchor: true});
    this.A2 = options.A2 ?? new Joint({ x: 0, y: 1 }, {is_anchor: true});
		this.offset = options.offset ?? this.A1.getPt();

    this.crank = options.crank ?? new Joint({ x: 0, y: 2 });
		this.crank.setPt( Vec2.add( Vec2.scale(Vec2.dir(this.A2, this.crank), Vec2.dist(this.A1, this.A2)), this.A2 ) );
    this.output = options.output ?? new Joint({ x: 0, y: 3 });

		this.flipped = options.flipped ?? false;
		
		this.Lgrounded = 2;
		this.Lgrounded = options.Lgrounded ?? this.Lgrounded;

		const LfloatingIntended = Math.sqrt(2*Vec2.dot(Vec2.sub(this.A2, this.A1), Vec2.sub(this.output, this.A1)) + this.Lgrounded**2);
		this.Lfloating = LfloatingIntended > 0 ? LfloatingIntended : 0;

		this.rocker1 = new Joint( circleIntersections(this.A1, this.Lgrounded, this.crank, this.Lfloating)[0] );
		this.rocker2 = new Joint( Vec2.sub(Vec2.scale(this.A1,2), this.rocker1) );
		this.rocker3 = new Joint( Vec2.sub(Vec2.scale(this.crank,2), this.rocker1) );
		const midpoint = Vec2.midpoint(this.rocker2, this.rocker3);
		const midpoint2 = dragLine(midpoint, Vec2.dir(this.rocker3, this.rocker2), this.rocker1);
		this.rocker4 = new Joint( Vec2.sub(Vec2.scale(midpoint2, 2), this.rocker1) );

		this.A1.draggable = options.dragA1 ?? true;
		this.A2.draggable = options.dragA2 ?? true;
		this.crank.draggable = options.dragCrank ?? true;
		this.output.draggable = options.dragOutput ?? true;
		const draggableRockers = options.dragRocker ?? true;
		this.rocker1.draggable = draggableRockers;
		this.rocker2.draggable = draggableRockers;
		this.rocker3.draggable = draggableRockers;
		this.rocker4.draggable = draggableRockers;
		this.drawOutputLine = options.drawOutputLine ?? true;


		this.groundedCol = options.groundedCol ?? rgba(Colors.tran);
		this.floatingCol = options.floatingCol ?? rgba(Colors.citrus);
		this.crankCol = options.crankCol ?? rgba(Colors.arglin);


		this.LinkA1A2 = new Link(this.A1, this.A2, this.crankCol);
		this.LinkA2Crank = new Link(this.A2, this.crank, this.crankCol);

		this.LinkR1R2= new Link(this.rocker1, this.rocker2, this.groundedCol);
		this.LinkR3R4 = new Link(this.rocker3, this.rocker4, this.groundedCol);
		this.LinkR1R3 = new Link(this.rocker1, this.rocker3, this.floatingCol);
		this.LinkR2R4 = new Link(this.rocker2, this.rocker4, this.floatingCol);

		this.offsetLinkage();

		this.dragging = null;
  }

	getJoints() {
		return [this.A1, this.A2, this.crank, this.rocker1, this.rocker2, this.rocker3, this.rocker4, this.output];
	}

	getLinks() {
		return [this.LinkA1A2, this.LinkA2Crank, this.LinkR1R2, this.LinkR3R4, this.LinkR1R3, this.LinkR2R4];
	}

	offsetLinkage() {
		offsetLinkageJoints(this);
	}

	findLimitPositions(crankOrOutput = "crank") {
		const d = Vec2.dist(this.A1, this.A2);
		const direction = Vec2.norm(Vec2.sub(this.A2, this.A1));

		if (crankOrOutput == "crank") {
			const alpha = Math.atan2((this.A2.y-this.A1.y),(this.A2.x-this.A1.x));
			
			const beta = Math.acos( (2 * d**2 - (this.Lgrounded - this.Lfloating)**2) / (2 * d**2));
			let dir1 = Vec2.scale(Vec2.make(Math.cos(alpha + beta), Math.sin(alpha + beta)), -d);
			let dir2 = Vec2.scale(Vec2.make(Math.cos(alpha - beta), Math.sin(alpha - beta)), -d);
			const limitPos1 = Vec2.add(this.A2, dir1);
			const limitPos2 = Vec2.add(this.A2, dir2);
			let limits = [limitPos1, limitPos2];
			
			const beta2 = Math.acos( (2 * d**2 - (this.Lgrounded + this.Lfloating)**2) / (2 * d**2));
 
			if (isNaN(beta2)) { return limits; }
 
			dir1 = Vec2.scale(Vec2.make(Math.cos(alpha + beta2), Math.sin(alpha + beta2)), -d);
			dir2 = Vec2.scale(Vec2.make(Math.cos(alpha - beta2), Math.sin(alpha - beta2)), -d);
			const limitPos3 = Vec2.add(this.A2, dir1);
			const limitPos4 = Vec2.add(this.A2, dir2);
			limits.push(limitPos3, limitPos4);
			
			return limits;
		}

		if (crankOrOutput == "output") {
			const Py = dragLine(this.output, direction, this.A1);
			const h = Vec2.dist(Py, this.A1);
			const dLong = Math.sqrt((this.Lgrounded + this.Lfloating)**2 - h**2);
			const Px1 = Vec2.scale(Vec2.perp(direction), dLong);
			const limitPos1 = Vec2.add(Py, Px1);
			const limitPos2 = Vec2.sub(Py, Px1);

			if (h > this.Lgrounded - this.Lfloating) { return [limitPos1, limitPos2]; }
			
			const dShort = Math.sqrt((this.Lgrounded - this.Lfloating)**2 - h**2);
			const Px2 = Vec2.scale(Vec2.perp(direction), dShort);
			const limitPos3 = Vec2.add(Py, Px2);
			const limitPos4 = Vec2.sub(Py, Px2);

			return [limitPos1, limitPos3, limitPos2, limitPos4];
		}
	}

	onMouseDown(client, hitbox) {
		handleDragging(this, client, hitbox);
		/*
		if (Vec2.dist(client, this.crank) < hitbox && this.crank.draggable) {
			this.dragging = "crank";
		}
		else if (Vec2.dist(client, this.rocker1) < hitbox && this.rocker1.draggable) {
			this.dragging = "rocker1";
		}
		else if (Vec2.dist(client, this.rocker2) < hitbox && this.rocker2.draggable) {
			this.dragging = "rocker2";
		}
		else if (Vec2.dist(client, this.rocker3) < hitbox && this.rocker3.draggable) {
			this.dragging = "rocker3";
		}
		else if (Vec2.dist(client, this.rocker4) < hitbox && this.rocker4.draggable) {
			this.dragging = "rocker4";
		}
		else if (Vec2.dist(client, this.output) < hitbox && this.output.draggable) {
			this.dragging = "output";
		}
		else if (Vec2.dist(client, this.A1) < hitbox && this.A1.draggable) {
			this.dragging = "A1";
		}
		else if (Vec2.dist(client, this.A2) < hitbox && this.A2.draggable) {
			this.dragging = "A2";
		}
		*/
	}

	onDrag(client) {
		if (this.dragging == null && this.getJoints().every(joint => joint.dragging == null)) { return; }

		

		if (isBeingDragged([this.crank])) {//this.dragging == this.crank || (this.dragging == null && this.crank.dragging)) {
			dragCrankDefault(this, client);
		}


		//TODO: BROKEN! FIX IN ACCORDANCE WITH NEW DRAGGING BEHAVIOUR!
		if (this.dragging === "rocker1" || this.dragging === "rocker2" || this.dragging === "rocker3" || this.dragging === "rocker4") {
			const n = Vec2.sub(this.crank, this.A1);
			const nPerp = Vec2.perp(n);

			const lClientPerp = slider(client, nPerp, this.A1);
			const lRockerPerp = slider(this[this.dragging], nPerp, this.A1);
			const l = slider(this.rocker1, n, this.A1);
			const lInv = Vec2.dist(this.A1, this.crank) - l;
			
			this.Lgrounded = Math.sqrt(l**2 + lClientPerp**2);
			this.Lfloating = Math.sqrt(lInv**2 + lClientPerp**2);
			

			if (Math.sign(lClientPerp) != Math.sign(lRockerPerp)){
				this.flipped = 1 - this.flipped;
			}
		}

		//TODO: BROKEN! FIX IN ACCORDANCE WITH NEW DRAGGING BEHAVIOUR!
		if (this.dragging === "output") {
			const v1 = Vec2.sub(this.A2, this.A1);
			const v2 = Vec2.sub(client, this.A1);
			const d2 = Vec2.dist(client, this.A1);
			const LfloatingMax = 2 * Vec2.dist(this.A1, this.A2) + this.Lgrounded;
			const LfloatingIntended = Math.sqrt(2*Vec2.dot(v1, v2) + this.Lgrounded**2);
			this.Lfloating = LfloatingIntended > 0 ? clamp(LfloatingIntended, 0, LfloatingMax) : 0;

			this.crank.setPt( Vec2.add(this.A1, Vec2.scale(v2, (this.Lfloating**2 - this.Lgrounded**2)/d2**2)) );
		}

		//TODO: BROKEN! FIX IN ACCORDANCE WITH NEW DRAGGING BEHAVIOUR!
		if (this.dragging == "A1") {
			this.offset = client;
			this.offsetLinkage();
		}

		//TODO: BROKEN! FIX IN ACCORDANCE WITH NEW DRAGGING BEHAVIOUR!
		if (this.dragging == "A2") {
			const crankDir = Vec2.norm(Vec2.sub(this.crank, this.A2));
			const newCrankLength = Math.max(Vec2.dist(client, this.A1), Math.abs(this.Lfloating - this.Lgrounded)/2 + EPS);
			this.A2.setPt( Vec2.add(Vec2.scale(Vec2.dir(this.A1, client), newCrankLength), this.A1) );
			this.crank.setPt( Vec2.add(Vec2.scale(crankDir, newCrankLength), this.A2) );
		}

		// Clamp crank position to not break the linkage
		const cond1 = Vec2.dist(this.crank, this.A1) - Math.abs(this.Lgrounded - this.Lfloating);
		const cond2 = this.Lgrounded + this.Lfloating - Vec2.dist(this.crank, this.A1);
		
		if (cond1 < 0 || cond2 < 0) {
			const n = this.findLimitPositions();
			let minDist = Infinity;
			let best = this.crank.getPt();
			for (let i = 0; i < n.length; i++) {
				if (minDist > Vec2.dist(this.crank, n[i])) { 
					minDist = Vec2.dist(this.crank, n[i]);
					best = n[i];
				}
			}
			this.crank.setPt( best );
		}
	}

	stopDragging() {
		this.dragging = null;
	}

	update() {
		//TODO: BROKEN! FIX IN ACCORDANCE WITH NEW DRAGGING BEHAVIOUR!
		if (this.dragging === "output") {
			this.floatingCol = "red";
			this.LinkR1R3.default_col = this.floatingCol;
			this.LinkR2R4.default_col = this.floatingCol;
		}
		if (this.dragging === "") {
			this.floatingCol = rgba(Colors.citrus);
			this.LinkR1R3.default_col = this.floatingCol;
			this.LinkR2R4.default_col = this.floatingCol;
		}
 
		let flip = this.Lfloating >= this.Lgrounded ? 0 : 1;
		if (this.flipped) { flip = 1-flip; }

		if (Vec2.dist(this.A1, this.crank) > EPS){
			this.rocker1.setPt( circleIntersections(this.A1, this.Lgrounded, this.crank, this.Lfloating)[flip] );
		}
		this.rocker2.setPt( Vec2.sub(Vec2.scale(this.A1,2), this.rocker1) );
		this.rocker3.setPt( Vec2.sub(Vec2.scale(this.crank,2), this.rocker1) );
		const midpoint = Vec2.midpoint(this.rocker2, this.rocker3);
		const midpoint2 = dragLine(midpoint, Vec2.dir(this.rocker3, this.rocker2), this.rocker1);
		this.rocker4.setPt( Vec2.sub(Vec2.scale(midpoint2, 2), this.rocker1) );
 
		this.output.setPt( Vec2.midpoint(this.rocker2, this.rocker4) );
		this.crankCol = rgba(Colors.arglin);

		this.offsetLinkage();
	}

	render(state) {
		if (this.drawOutputLine) {
			drawLinkageOutputLine(state, this);
		}

		drawLinkageLinks(state, this);
		drawLinkageJoints(state, this);
	}
}
