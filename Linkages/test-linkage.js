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

import {
	Joint, Link,
} from "./linkage-utils.js";


export class PLJoints {
	constructor(options = {}) {
		this.anchor_1 = options.anchor_1 ?? new Joint({ x: 0, y: 0 }, { is_anchor: true })
		this.anchor_2 = options.anchor_2 ?? new Joint({ x: 0, y: 1 }, { is_anchor: true })
		this.crank = options.crank ?? new Joint({ x: 0, y: 2 });
		this.rocker_1 = options.rocker_1 ?? new Joint({ x:	 Math.sqrt(1.75), y: 2.5 });
		this.rocker_2 = options.rocker_2 ?? new Joint({ x: -Math.sqrt(1.75), y: 2.5 });
		this.output = options.output ?? new Joint({ x: 0, y: 3 });
	}

	getJoints() {
		return [this.anchor_1, this.anchor_2, this.crank, this.rocker_1, this.rocker_2, this.output];
	}

	clone() {
		const cloned_options = cloneClassEntries(this);
		return new PLJoints(cloned_options);
	}
}


export class PLLinks {
	constructor(PLJoints) {
		this.joints = PLJoints;
		this.A1_A2 = new Link(this.joints.anchor_1, this.joints.anchor_2, this.joints.crankCol);
		this.A2_crank = new Link(this.joints.anchor_2, this.joints.crank, this.joints.crankCol);

		this.A1_R1 = new Link(this.joints.anchor_1, this.joints.rocker_1, this.joints.rockerCol);
		this.A1_R2 = new Link(this.joints.anchor_1, this.joints.rocker_2, this.joints.rockerCol);

		this.crank_R1 = new Link(this.joints.crank, this.joints.rocker_1, this.joints.rhombusCol);
		this.crank_R2 = new Link(this.joints.crank, this.joints.rocker_2, this.joints.rhombusCol);
		this.R1_output = new Link(this.joints.rocker_1, this.joints.output, this.joints.rhombusCol);
		this.R2_output = new Link(this.joints.rocker_2, this.joints.output, this.joints.rhombusCol);
	}

	getLinks() {
		return [this.A1_A2, this.A2_crank, this.A1_R1, this.A1_R2, this.crank_R1, this.crank_R2, this.R1_output, this.R2_output];
	}

	clone() {
		const cloned_joints = this.joints.clone();
		return new PLLinks(cloned_joints);
	}
}


// ================================================================================================================ PL CLASS ================================================================================================================
// TODO: PL_options specifications are missing!!
// changes: dragCrank, dragA1, etc. --> drag_crank, drag_A1, etc.

/**
 * 
 * Exposes the following properties:
 * - joints, links
 * - symmetric, inverted, side_1_folded, side_2_folded
 * - Lanchored, Lcrank, Lfloating1, Lfloating2, Lgrounded1, Lgrounded2
 */
export class testPL {
	constructor(options = {}) {
		this.memory_joints = this.createNewJoints();
		this.joints = this.createNewJoints();

		this.#overwriteJointsWhenManuallySpecified(options);
		this.links = this.createNewLinks(this.joints);

		this.#setInitialValuesAndComputeStartingPosition(options);

		this.#setDraggableJoints(options);

		// The joints that are driving the linkage are in an array, even though a PL has only one DOF, because I want every linkage to be as similar to the others as possible.
		// Perhaps this means that I should make a helper class that handles more general linkage things...
		// Later.
		this.drivers = [];

		this.#setRemainingFlagsAndValues(options);
	}	

	// ================================================================ PRIVATE METHODS ================================================================
	
	/**
	 * Overwrites the joints in this.joints that have been manually specified in the linkage options.
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#overwriteJointsWhenManuallySpecified(options = {}) {
		for (const joint_name of Object.keys(this.joints)) { // ".entries()" is a [key, value] pair, ".keys()" is just the name and ".values()" is just the contents.
			this.joints[joint_name] = options[joint_name] ?? this.joints[joint_name];
		}
	}

	/**
	 * Finds values for and sets the following variables:
	 * - symmetric
	 * - Lfloating1, Lfloating2
	 * - Lgrounded1, Lgrounded2
	 *
	 * Corrects the initial joint configuration to become valid.
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#setInitialValuesAndComputeStartingPosition(options = {}) {
		this.#setAnchoredAndCrankLength();

		this.#correctCrankAndOutputPositions(options);

		this.#setSymmetricFlag(options);
		this.#setInvertedFlag();
		this.#setFloatingLengthsOnInit(options);
		this.#setFoldedFlags(options);
		this.#setGroundedLengths();

		this.#correctRockerPositions();
	}

	/**
	 * Decides what to set the lengths of the anchor and crank links to.
	 *
	 * Uses the anchor-anchor distance in the provided joint configuration.
	 *
	 * No return value.
	 */
	#setAnchoredAndCrankLength() {
		const anchored_and_crank_length = this.links.A1_A2.getLength();
		this.Lanchored = anchored_and_crank_length;
		this.Lcrank = anchored_and_crank_length;
	}

	/**
	 * Changes the joint positions of the crank and the output to be in a valid position, assuming the following flags have already been set:
	 * - this.Lanchored (set by "#setAnchoredAndCrankLength()")
	 *
	 * If the output was specified manually, move the crank to the geometric inverse position.
	 * Otherwise, 
	 * - Scale the distance between A2 and crank until its length matches the anchored length.
	 * - Move output perpendicularly to the anchored link until it is at the geometric inverse of the crank.
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#correctCrankAndOutputPositions(options = {}) {
		const stays_static = options.output ? "output" : "crank";

		if (stays_static == "output") { this.#makeCrankMatchOutput(); }
		if (stays_static == "crank") { this.#makeOutputMatchCrank(); }
	}

	/**
	 * Moves the crank to the geometric inverse position of the output.
	 *
	 * No return value.
	 */
	#makeCrankMatchOutput() {
		const A1     = this.joints.anchor_1;
		const A2     = this.joints.anchor_2;
		const output = this.joints.output;
		const crank = this.joints.crank;

		const A1_A2_dir = Vec2.dir(A1, A2);
		const A1_output_perp_dist = this.Lanchored * slider(output, A1_A2_dir, A1);

		const A1_output_vec = Vec2.sub(output, A1);
		const A1_output_dist_safe = Vec2.dist(A1, output) || 1;

		const new_A1_crank_vec = Vec2.scale( A1_output_vec, 2*A1_output_perp_dist/(A1_output_dist_safe**2) );

		crank.setPt( Vec2.add(A1, new_A1_crank_vec) );
	}

	/**
	 * Sets the distance A2-crank equal to the distance A1-A2, then moves the output to the geometric inverse position of the crank.
	 *
	 * No return value.
	 */
	#makeOutputMatchCrank() {
		const A1     = this.joints.anchor_1;
		const A2     = this.joints.anchor_2;
		const output = this.joints.output;
		const crank = this.joints.crank;

		const A1_A2_dir = Vec2.dir(A1, A2);
		const A1_output_perp_dist = this.Lanchored * slider(output, A1_A2_dir, A1);

		const A1_crank_vec = Vec2.sub(crank, A1);
		const A1_crank_dist_safe = Vec2.dist(A1, crank) || 1;

		const new_A1_output_vec = Vec2.scale( A1_crank_vec, 2*A1_output_perp_dist/(A1_crank_dist_safe**2) );

		crank.setPt( Vec2.add(A1, new_A1_output_vec) );
	}

	/**
	 * Sets the "symmetric" flag.
	 *
	 * If nothing else is set, the linkage is defined symmetric if both crank-rocker distances are equal and not symmetric if not.
	 * Manually setting only one of Lfloating1, Lfloating2 or Lfloating overwrites this and turns the linkage symmetric.
	 * Manually setting both Lfloating1 and Lfloating2 overwites everything so far and makes the linkage not symmetric.
	 * Manually setting symmetric overwrites everything else.
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#setSymmetricFlag(options = {}) {
		const Lfloating1 = options.Lfloating1 ? true : false;
		const Lfloating2 = options.Lfloating2 ? true : false;
		const Lfloating  = options.Lfloating  ? true : false;

		const crank_R1_distance = this.links.crank_R1.getLength();
		const crank_R2_distance = this.links.crank_R2.getLength();

		const joint_symmetry = ( crank_R1_distance == crank_R2_distance );
		const exactly_one_length_set = ( ((Lfloating1 != Lfloating2) != Lfloating) && !((Lfloating1 && Lfloating2) && Lfloating) );
		const both_sidelengths_set = ( Lfloating1 && Lfloating2 );

		let symmetric = joint_symmetry;
		symmetric = exactly_one_length_set || symmetric;
		symmetric = !both_sidelengths_set && symmetric;
		symmetric = options.symmetric ?? symmetric;

		this.symmetric = symmetric;
	}

	/**
	 * Sets the "inverted" flag.
	 *
	 * The linkage is inverted if the output is below the anchor_1 position, with "below" being in the direction parallel to the A1A2 link.
	 *
	 * No return value.
	 */
	#setInvertedFlag() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;
		const output = this.joints.output;

		const A1_A2_dir = Vec2.dir(A1, A2);
		
		this.inverted = (slider(output, A1_A2_dir, A1) < 0);
	}

	/**
	 * Sets the lengths of the floating links, assuming the following relevant flags have already been set:
	 * - this.symmetric (set by "#setSymmetricFlag(options)").
	 *
	 * As a baseline, use the default floating length (that of the default linkage).
	 * If the crank-rocker distance already equals the rocker-output distance, use that distance as a length instead.
	 * The variable Lfloating overwrites all previous lengths.
	 * If Lfloating1 or Lfloating2 are set, they overwrite all previous lengths on their corresponding side.
	 * If the symmetric flag is set, it overwrites the second side to equal the first.
	 *
	 * If any set length is less than half the distance from crank to output, so that the linkage could not exist:
	 * - overwrite it and use half the distance from crank to output instead, so that the linkage is in a fully extended position.
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#setFloatingLengthsOnInit(options = {}) {
		const default_joints = this.createNewJoints();
		const default_floating_length = Vec2.dist(default_joints.crank, default_joints.rocker_1);

		const crank_R1_distance  = this.links.crank_R1.getLength();
		const crank_R2_distance  = this.links.crank_R2.getLength();
		const R1_output_distance = this.links.R1_output.getLength();
		const R2_output_distance = this.links.R2_output.getLength();

		const side1_is_valid = ( crank_R1_distance - R1_output_distance < EPS );
		const side2_is_valid = ( crank_R2_distance - R2_output_distance < EPS );
		const minimum_valid_length = Vec2.dist(this.joints.crank.getPt(), this.joints.output.getPt()) / 2;

		let Lfloating1 = default_floating_length;
		let Lfloating2 = default_floating_length;

		Lfloating1 = side1_is_valid ? crank_R1_distance : Lfloating1;
		Lfloating2 = side2_is_valid ? crank_R2_distance : Lfloating2;

		Lfloating1 = options.Lfloating ?? Lfloating1;
		Lfloating2 = options.Lfloating ?? Lfloating2;

		Lfloating1 = options.Lfloating1 ?? Lfloating1;
		Lfloating2 = options.Lfloating2 ?? Lfloating2;

		Lfloating1 = ( Lfloating1 < minimum_valid_length ) ? minimum_valid_length : Lfloating1;
		Lfloating2 = ( Lfloating2 < minimum_valid_length ) ? minimum_valid_length : Lfloating2;

		Lfloating2 = this.symmetric ? Lfloating1 : Lfloating2;
		
		this.Lfloating1 = Lfloating1;
		this.Lfloating2 = Lfloating2;
	}

	/**
	 * Sets the "side_1_folded" and "side_2_folded" flags.
	 *
	 * If nothing else is set, set them in accordance with the side that the rockers are already on.
	 * If a flag is manually set, it overwrites this.
	 * 
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#setFoldedFlags(options = {}) {
		const A1 = this.joints.anchor_1;
		const R1 = this.joints.rocker_1;
		const R2 = this.joints.rocker_2;
		const output = this.joints.output;

		const A1_output_vec = Vec2.sub(output, A1);
		const A1_R1_vec = Vec2.sub(R1, A1);
		const A1_R2_vec = Vec2.sub(R2, A1);

		let side_1_folded = (Vec2.cross(A1_output_vec, A1_R1_vec) > 0);
		let side_2_folded = (Vec2.cross(A1_output_vec, A1_R2_vec) < 0);

		side_1_folded = options.side_1_folded ?? side_1_folded;
		side_2_folded = options.side_2_folded ?? side_2_folded;

		this.side_1_folded = side_1_folded;
		this.side_2_folded = side_2_folded;
	}

	/**
	 * Computes and assigns the rockers their correct positions, assuming that the following relevant values are correct:
	 * - this.Lfloating1, this.Lfloating2 (set by "#setFloatingLengths(options)")
	 * - this.Lgrounded1, this.Lgrounded2 (set by "#setGroundedLengths()")
	 * - this.side_1_folded, this.side_2_folded (set by "#setFoldedFlags(options)")
	 * - this.inverted (set by "setInvertedFlag()")
	 * - this.joints.crank, this.joints.output (set by "#makeCrankMatchOutput" or "#makeOutputMatchCrank")
	 *
	 * No return value.
	 */
	#correctRockerPositions() {
		const A1    = this.joints.anchor_1;
		const crank = this.joints.crank;

		const swapFromInverted = this.inverted ? 1 : 0;
		
		const rocker_1_possibilities = circleIntersections(A1, this.Lgrounded1, crank, this.Lfloating1);
		const rocker_2_possibilities = circleIntersections(A1, this.Lgrounded2, crank, this.Lfloating2);

		const rocker_1 = this.side_1_folded ? rocker_1_possibilities[0 ^ swapFromInverted] : rocker_1_possibilities[1 ^ swapFromInverted];
		const rocker_2 = this.side_2_folded ? rocker_2_possibilities[1 ^ swapFromInverted] : rocker_2_possibilities[0 ^ swapFromInverted];

		this.joints.rocker_1.setPt(rocker_1);
		this.joints.rocker_2.setPt(rocker_2);
	}

	/**
	 * Finds the lengths of the grounded bars connecting anchors to rockers, assuming that the following values are already correct:
	 * - this.Lfloating1, this.Lfloating2 (set by "#setFloatingLengths(options)")
	 * - this.joints.crank, this.joints.output (set by "#makeCrankMatchOutput" or "#makeOutputMatchCrank")
	 *
	 * No return value.
	 */
	#setGroundedLengths() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;
		const output = this.joints.output;

		const n = Vec2.dir(A1, A2);
		const d = this.Lanchored;
		const r = d*slider(output, n, A1);

		const Lfloating_min = this.getMinFloatingLength();
		const Lfloating_max = this.getMaxFloatingLength();

		const Lmin_short = Math.max(Lfloating_min - 2*d, 0);
		const Lmax_short = 2*Vec2.dist(A1, A2) + Lfloating_min;
		const Lmin_long = Math.sqrt( Lfloating_max**2 - Lfloating_min**2 );
		const Lmax_long = Math.sqrt( Lmin_long**2 + Lmax_short**2 );

		const Lintended_short = clamp( Math.sqrt( Math.max(2*r + Lfloating_min**2, 0) ), Lmin_short, Lmax_short );
		const Lintended_long  = clamp( Math.sqrt( Math.max(2*r + Lfloating_max**2, 0) ), Lmin_long, Lmax_long );

		this.Lgrounded1 = (this.Lfloating1 <= this.Lfloating2) ? Lintended_short : Lintended_long;
		this.Lgrounded2 = (this.Lfloating1 >= this.Lfloating2) ? Lintended_short : Lintended_long;
	}

	/**
	 * Sets the .draggable vairable of all joints in the linkage.
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#setDraggableJoints(options = {}) {
		for (const joint_name of Object.keys(this.joints)) {
			this.joints[joint_name].draggable = options[`drag_${joint_name}`] ?? this.joints[joint_name].draggable;
		}
	}

	/**
	 * Finds out whether the points in this.memory_joints are in the same positions as those in this.joints.
	 *
	 * Returns an array with the names of the joints that differ.
	 */
	#findDifferenceBetweenMemoryJointsAndJoints(){
		let names_of_differing_joints = [];

		for (const joint_name of Object.keys(this.joints)) {
			const different = ( Vec2.dist(this.joints[joint_name].getPt(), this.memory_joints[joint_name].getPt()) > EPS );
			if (different) {
				names_of_differing_joints.push(joint_name);
			}
		}

		return names_of_differing_joints;
	}

	/**
	 * Finds out which joints in the linkage are currently being moved by something other than the linkage itself
	 *
	 * Returns an array with the names of the externally driven joints.
	 */
	#findExternallyDrivenJoints() {
		let names = [];

		for (const joint_name of Object.keys(this.joints)) {
			if (this.joints[joint_name].movement_source == this) {
				names.push(joint_name);
			}
			
		}

		return names;
	}

	/**
	 * Updates the movement_source property of the joints that are not already set to this linkage.
	 *
	 * No return value.
	 */
	#updateMovementSources() {
		for (const joint of this.getJoints()) {
			if (joint.movement_source != "") { continue; }
			joint.movement_source = this;
		}
	}

	/**
	 * Finds the crank positions in which the linkage is in a fully extended configuration.
	 *
	 * Returns an array of length 2 or 4 whose elements are points.
	 */
	#findLimitPositionsOfCrank() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;

		const d = this.Lanchored;
		const Lgrounded_min = this.getMinGroundedLength();
		const Lfloating_min = this.getMinFloatingLength();

		const alpha = Math.atan2((A2.y-A1.y),(A2.x-A1.x));
		
		const beta = Math.acos( (2 * d**2 - (Lgrounded_min - Lfloating_min)**2) / (2 * d**2));
		let dir_1 = Vec2.scale(Vec2.make(Math.cos(alpha + beta), Math.sin(alpha + beta)), -d);
		let dir_2 = Vec2.scale(Vec2.make(Math.cos(alpha - beta), Math.sin(alpha - beta)), -d);
		const limit_pos_1 = Vec2.add(A2, dir_1);
		const limit_pos_2 = Vec2.add(A2, dir_2);
		let limits = [limit_pos_1, limit_pos_2];
		
		const beta2 = Math.acos( (2 * d**2 - (Lgrounded_min + Lfloating_min)**2) / (2 * d**2));

		if (isNaN(beta2)) { return limits; }

		dir_3 = Vec2.scale(Vec2.make(Math.cos(alpha + beta2), Math.sin(alpha + beta2)), -d);
		dir_4 = Vec2.scale(Vec2.make(Math.cos(alpha - beta2), Math.sin(alpha - beta2)), -d);
		const limit_pos_3 = Vec2.add(A2, dir3);
		const limit_pos_4 = Vec2.add(A2, dir4);
		limits.push(limit_pos_3, limit_pos_4);
		
		return limits;
	}

	/**
	 * Finds the output positions in which the linkage is in a fully extended configuration.
	 *
	 * Returns an array of length 2 or 4 whose elements are points.
	 */
	#findLimitPositionsOfOutput() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;
		const output = this.joints.output;

		const d = this.Lanchored;
		const direction = Vec2.dir(A1, A2);
		const Lgrounded_min = this.getMinGroundedLength();
		const Lfloating_min = this.getMinFloatingLength();

		let delta_x = Math.sqrt((Lfloating_min+Lgrounded_min)**2 - (slider(output, direction, A1))**2);
		let delta_y = dragLine(output, direction, A1);
		let move_x = Vec2.scale(Vec2.perp(direction), delta_x);
		let move_y = Vec2.sub(delta_y, A1);
		const p0 = Vec2.add(Vec2.add(move_y, move_x), A1);
		const p1 = Vec2.add(Vec2.sub(move_y, move_x), A1);

		if(Lgrounded_min + Lfloating_min >= 2*d) { return [p0,p1]; }

		delta_x = Math.sqrt((Lfloating_min - Lgrounded_min)**2 - (slider(output, direction, A1))**2);
		delta_y = dragLine(output, direction, A1);
		move_x = Vec2.scale(Vec2.perp(direction), delta);
		move_y = Vec2.sub(delta_y, A1);
		const p2 = Vec2.add(Vec2.add(move_y, move_x), A1);
		const p3 = Vec2.add(Vec2.sub(move_y, move_x), A1);
		
		return [p0, p2, p3, p1];
	}

	/**
	 * Checks whether the crank is in a position that would break the linkage.
	 * If it is, it snaps the crank to the nearest limit position (as returned by #findLimitPositionsOfCrank()).
	 *
	 * No return value.
	 */
	#clampCrankToValidPosition() {
		const A1    = this.joints.anchor_1;
		const crank = this.joints.crank;

		const Lgrounded_min = this.getMinGroundedLength();
		const Lfloating_min = this.getMinFloatingLength();

		const cond1 = Vec2.dist(crank, A1) - Math.abs(Lgrounded_min - Lfloating_min);
		const cond2 = Lgrounded_min + Lfloating_min - Vec2.dist(output, A1);

		if (cond1 >= 0 && cond2 >= 0) { return; }

		const limits = this.#findLimitPositionsOfOutput();
		let min_dist = Infinity;
		let best = output;
		for (const limit_pos of limits) {
			if (min_dist <= Vec2.dist(output, limit_pos)) { continue; }

			min_dist = Vec2.dist(output, limit_pos);
			best = limit_pos;
		}

		this.output.setPt(best);
	}

	/**
	 * Adjusts the vertical position of the output to be in range of the linkage (vertical meaning parallel to the link A1A2).
	 * Assumes the following values are already correct:
	 * - Lfloating1, Lfloating2 (set by "#setFloatingLengths()")
	 * - this.Lanchored (set by "#setAnchoredAndCrankLength()")
	 *
	 * No return value;
	 */
	#clampOutputToValidVerticalPosition() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;
		const output = this.joints.output;

		const Lfloating_min = this.getMinFloatingLength();

		const dir = Vec2.dir(A1, A2);
		const length_perp = slider(output, dir, A1);

		const overshoot =  length_perp - (2*this.Lanchored + 2*Lfloating_min);
		const undershoot = 2*this.Lanchored - 2*Lfloating_min - length_perp;

		let new_output_pos = output.getPt();

		if (overshoot > 0) {
			new_output_pos = Vec2.sub(output, Vec2.scale(dir, overshoot));
		}

		if (undershoot > 0) {
			new_output_pos = Vec2.sub(output, Vec2.scale(dir, undershoot));
		}

		output.setPt(new_output_pos);
	}

	/**
	 * Adjusts the horizontal position of the output to be in range of the linkage (horizontal meaning perpendicular to the link A1A2).
	 * Assumes the following values are already correct:
	 * - Lfloating1, Lfloating2 (set by "#setFloatingLengths()")
	 * - this.Lgrounded1, this.Lgrounded2 (set by "#setGroundedLengths()")
	 * - this.Lanchored (set by "#setAnchoredAndCrankLength()")
	 *
	 * No return value.
	 */
	#clampOutputToValidHorizontalPosition() {
		const A1 = this.joints.anchor_1;
		const output = this.joints.output;
		const crank = this.joints.crank;

		const Lgrounded_min = this.getMinGroundedLength();
		const Lfloating_min = this.getMinFloatingLength();

		const cond1 = Vec2.dist(output, A1) - Math.abs(Lgrounded_min - Lfloating_min);
		const cond2 = Lgrounded_min + Lfloating_min - Vec2.dist(crank, A1);

		if (cond1 >= 0 && cond2 >= 0) { return; }

		const limits = this.#findLimitPositionsOfCrank();
		let min_dist = Infinity;
		let best = crank;
		for (const limit_pos of limits) {
			if (min_dist <= Vec2.dist(crank, limit_pos)) { continue; }

			min_dist = Vec2.dist(crank, limit_pos);
			best = limit_pos;
		}

		this.crank.setPt(best);
	}

	/**
	 * Sets values for Lfloating1 and Lfloating2, assuming the following values are already correct:
	 * - this.symmetric (set by "#setSymmetricFlag(options)").
	 * - this.Lanchored (set by "#setAnchoredAndCrankLength()")
	 * - this.joints.crank, this.joints.output (set by "#makeCrankMatchOutput" or "#makeOutputMatchCrank")
	 *
	 * @param {String} [moving_rocker_name] - The name of the moving rocker.
	 *
	 * No return value.
	 */
	#setFloatingLengthsFromRocker(moving_rocker_name) {
		const A1 = this.joints.anchor_1;
		const crank = this.joints.crank;
		const output = this.joints.output;
		const moving_rocker = this.joints[moving_rocker_name];

		const midpoint = Vec2.midpoint(crank, output);
		const n = Vec2.perp(Vec2.sub(output, A1));

		const projected_dist = slider(moving_rocker, n, midpoint);
		const new_floating_length = Math.sqrt( projected_dist**2 + Vec2.dist(output, midpoint) ** 2 );
		
		if (this.symmetric) {
			this.Lfloating1 = new_floating_length;
			this.Lfloating2 = new_floating_length;
		} else if (moving_rocker === this.joints.rocker_1) {
			this.Lfloating1 = new_floating_length;
		} else {
			this.Lfloating2 = new_floating_length;
		}
	}

	/**
	 * Shifts all joints in the linkage by the shift_vector, with possible exceptions.
	 *
	 * @param {Vec2} [shift_vector] - The vector to shift the linkage by.
	 * @param {Set} [exceptions] - A set of joint names that should not be shifted.
	 *
	 * No output value.
	 */
	#shiftLinkage(shift_vector = Vec2.make(0,0), exceptions = new Set()) {
		for (const joint in Object.values(this.joints)) {
			if (exceptions.has(joint)) { continue; }

			const shifted_joint_pos = Vec2.add(joint.getPt(), shift_vector);
			joint.setPt(shifted_joint_pos);
		}
	}

	/**
	 * Handles the following options:
	 * - draw_output_line
	 * - crank_col, floating_col, grounded_col
	 *
	 * @param {PL_options} [options] - The options with which to initialize the linkage.
	 *
	 * No return value.
	 */
	#setRemainingFlagsAndValues(options) {
		this.draw_output_line = options.draw_output_line ?? false;
		
		const new_crank_col = options.crank_col ?? this.links.A1_A2.default_col;
		const new_floating_col = options.floating_col ?? this.links.crank_R1.default_col;
		const new_grounded_col = options.grounded_col ?? this.links.A1_R1.default_col;
		
		for (const link_name of ["A1_A2", "A2_crank"]) {
			this.links[link_name].default_col = new_crank_col;
		}
		for (const link_name of ["crank_R1", "R1_output", "crank_R2", "R2_output"]) {
			this.links[link_name].default_col = new_floating_col;
		}
		for (const link_name of ["A1_R1", "A1_R2"]) {
			this.links[link_name].default_col = new_grounded_col;
		}
	}

	/**
	 * Changes the positions of the linkage joints in accordance with which joint is driving the linkage, assuming that:
	 * - this.memory_joints still differ from this.joints
	 *
	 * @param {String} [driver] - The name of the joint that is currently driving the linkage.
	 *
	 * No return value.
	 */
	#driveLinkage(driver) {
		if (driver === "anchor_1") { this.#driveLinkageFromAnchor1(); }
		if (driver === "anchor_2") { this.#driveLinkageFromAnchor2(); }
		if (driver === "crank") { this.#driveLinkageFromCrank(); }
		if (driver === "rocker_1" || driver === "rocker_2") { this.#driveLinkageFromRocker(driver); }
		if (driver === "output") { this.#driveLinkageFromOutput(); }
	}

	/**
	 * Shifts the linkage to its new base point.
	 *
	 * No return value.
	 */
	#driveLinkageFromAnchor1() {
		const old_A1 = this.memory_joints.A1;
		const new_A1 = this.joints.A1;

		const shift = Vec2.sub(new_A1, old_A1);
		const exceptions = new Set(new_A1);

		this.#shiftLinkage(shift, exceptions);
	}

	/**
	 * Moves the second anchor as close to the new position as possible while keeping the linkage valid.
	 * Keeps the crank pointed in the same direction if possible while rescaling its distance from anchor_2.
	 *
	 * No return value.
	 */
	#driveLinkageFromAnchor2() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;
		const crank = this.joints.crank;

		const Lfloating_min = this.getMinFloatingLength();
		const Lgrounded_min = this.getMinGroundedLength();

		const crank_direction = Vec2.dir(A2, crank);
		const new_crank_length = Math.max(Vec2.dist(A1, A2), Math.abs(Lfloating_ming - Lgrounded_min)/2 + EPS);
		const new_A1_A2_vec = Vec2.scale(Vec2.dir(A1, A2), new_crank_length);
		const new_A2_crank_vec = Vec2.scale(crank_dir, new_crank_length);

		this.A2.setPt( Vec2.add(new_A1_A2_vec , A1) );
		this.crank.setPt( Vec2.add(new_A2_crank_vec, A2) );
	}

	/**
	 * Updates the position of the linkage to keep the crank as close as possible to its current position.
	 * Does not change any link lengths.
	 *
	 * No return value.
	 */
	#driveLinkageFromCrank() {
		const A1 = this.joints.anchor_1;
		const A2 = this.joints.anchor_2;
		const crank = this.joints.crank;

		const crank_position_normalized = dragCircle(crank, this.Lanchored, A2, A2);
		
		this.crank.setPt(crank_position_normalized);
		console.log(this.crank, crank_position_normalized);
		this.#clampCrankToValidPosition();

		this.#makeOutputMatchCrank();
		this.#correctRockerPositions();
	}

	/**
	 * I have yet to implement a good algorithm for actually driving the linkage from its rockers, so this will always change the values of
	 * - Lgrounded1, Lgrounded2
	 * - Lfloating1, Lfloating2
	 * to match the position and symmetry requirements.
	 *
	 * @param {String} [driver] - The rocker driving the transformation.
	 *
	 * No return value.
	 */
	#driveLinkageFromRocker(driver) {
		this.#setFloatingLengthsFromRocker(driver);

		const midpoint = Vec2.midpoint(this.joints.anchor_1, this.joints.output);
		const non_driver = (driver === "rocker_1") ? this.joints.rocker_2 : this.joints.rocker_1;
		if (this.symmetric) {
			non_driver.setPt( Vec2.reflect(this.joints[driver], midpoint) );
		}

		this.#setFoldedFlags();
		this.#setGroundedLengths();
	}

	/**
	 * Updates the position of the linkage to keep the output as close as possible to its current position.
	 * Changes the following lengths if necessary:
	 * - Lgrounded1, Lgrounded2
	 *
	 * No return value.
	 */
	#driveLinkageFromOutput() {
		this.#clampOutputToValidVerticalPosition();
		this.#setGroundedLengths();
		this.#clampOutputToValidHorizontalPosition();

		this.#makeCrankMatchOutput();
		this.#correctRockerPositions();
	}

	// ================================================================ PUBLIC METHODS ================================================================

	/**
	 * Returns a new instance of the default joints in a PL linkage.
	 */
	createNewJoints() {
		return new PLJoints();
	}

	/**
	 * @param {PLJoints} [joints] - The joints in the linkage.
	 *
	 * Returns a new instance of the links between given joints.
	 */
	createNewLinks(joints) {
		return new PLLinks(joints);
	}

	/**
	 * Returns the current instance of the PLJoints in use.
	 */
	getJoints() {
		return this.joints.getJoints();
	}

	/**
	 * Returns the current instance of the PLLinks in use.
	 */
	getLinks() {
		return this.links.getLinks();
	}

	/**
	 * Returns the length of the shortest grounded joint.
	 */
	getMinGroundedLength() {
		return Math.min(this.Lgrounded1, this.Lgrounded2);
	}

	/**
	 * Returns the length of the longest grounded joint.
	 */
	getMaxGroundedLength() {
		return Math.max(this.Lgrounded1, this.Lgrounded2);
	}

	/**
	 * Returns the length of the shortest floating joint.
	 */
	getMinFloatingLength() {
		return Math.min(this.Lfloating1, this.Lfloating2);
	}

	/**
	 * Returns the length of the longest floating joint.
	 */
	getMaxFloatingLength() {
		return Math.max(this.Lfloating1, this.Lfloating2);
	}

	/**
	 * Checks whether the joints still match the memory joints and updates the memory joints if necessary.
	 * Calls the appropriate function to deal with the change.
	 *
	 * No return value.
	 */
	update() { //TODO: Bug! The linkage can be driven by (for example) A1, A2 and Crank, but the current setup can update them in the wrong order!
		//this.drivers = this.#findDifferenceBetweenMemoryJointsAndJoints();
		this.drivers = this.#findExternallyDrivenJoints();
		console.log(this.joints.crank, this.drivers);

		for (const driver of this.drivers) {
			this.#driveLinkage(driver);
		}

		//this.#updateMovementSources();

		this.memory_joints = this.joints.clone();
	}

	/**
	 * Finds where the output line should be drawn between and calls the drawer function.
	 *
	 * @param {Set} [state] - The state of the canvas that the linkage should be rendered on.
	 *
	 * No return value.
	 */
	drawOutputLine(state) {
		const lim_pos = this.#findLimitPositionsOfOutput();
		for (let i = 0; i < lim_pos.length; i += 2) {
			drawLine(state, lim_pos[i], lim_pos[i+1], 3, "red");
		}
	}

	/**
	 * Calls the drawer function for the links.
	 *
	 * @param {Set} [state] - The state of the canvas that the linkage should be rendered on.
	 *
	 * No return value.
	 */
	drawLinks(state) {
		for (const link of this.getLinks()) {
			if (link.hidden) { continue; }
			drawLink(state, link);
		}
	}

	/**
	 * Calls the drawer function for the joints.
	 *
	 * @param {Set} [state] - The state of the canvas that the linkage should be rendered on.
	 *
	 * No return value.
	 */
	drawJoints(state) {
		for (const joint of this.getJoints()) {
			if (joint.hidden) { continue; }
			drawJoint(state, joint);
		}
	}

	/**
	 * Calls the functions to draw each part of the linkage.
	 *
	 * @param {Set} [state] - The state of the canvas that the linkage should be rendered on.
	 * 
	 * No return value.
	 */
	render(state) {
		this.drawOutputLine(state);
		this.drawLinks(state);
		this.drawJoints(state);
	}
}

