import {
	Vec2,
} from "./low-level-utils.js";

// Some black AI magic because apparently normal importing isn't supported on a browser (??)
import * as ml from "./node_modules/ml-matrix/matrix.umd.js";
const {
	Matrix, SingularValueDecomposition
} = mlMatrix;


/**
 * Returns a hashmap from an entries of the array to their indices.
 *
 * @param {array} array - The array whose elements to place in a hashmap.
 */
function populateHashArrayToIndex(array) {
	let entry_to_index = new Map();
	for (const [i,v] of array.entries()) {
		entry_to_index.set(v, i);
	}

	return entry_to_index;
}

/**
 * Given two arrays, returns a hashmap from the elements of the first array to the elements of the second array in lockstep order.
 * If a hashmap is given at [options.knownHash : null], the hashed values will be placed and the rest of the first array will be mapped to the second array as though the hashed values had never existed.
 *
 * @param {array} [array] - The array of keys.
 * @param {array} [values] - A column vector of Vec2 points.
 * @param {set} [options = {knownHash : null}] - The optional argument knownHash picks assigns known elements their value in this hash map. The remaining elements are then assigned in order as if the known elements had never existed.
 */
function populateHashArrayToArray(keys, values, options = {knownHash : null}) {
	let index = 0;
	let hash_element_to_element = new Map();

	for (const element of keys) {
		if (options.knownHash != null && options.knownHash.has(element)) {
			hash_element_to_element.set(element, options.knownHash.get(element));
			continue;
		}
		if (index >= values.length) {
			console.log("Aborted populateHashVertsToPoints early");
			return hash_element_to_element;
		}
		hash_element_to_element.set(element,values[index]);
		index += 1;
	}

	return hash_element_to_element;
}

/**
 * Returns a hashmap from the keys of the given hashmap to Vec2 zero points.
 *
 * @param {hash} [hash] - The hashmap whose values should be replaced by zero points.
 */
function replaceHashValuesWithZeroPoints(hash) {
	let hash_key_to_zeroPoint = new Map();
	for (const [key, value] of hash) {
		hash_key_to_zeroPoint.set(key, Vec2.make(0,0));
	}

	return hash_key_to_zeroPoint;
}

/**
 * Fills the vertex-edge matrix.
 *
 * @param {array} [verts] - The vertices of the linkage.
 * @param {array} [edges] - The edges of the linkage.
 */
function populateMatrix(verts, edges) {
	const hash_vertex_to_index = populateHashArrayToIndex(verts);
	let M = [];

	for (const e of edges) {
		let l = Array(2*hash_vertex_to_index.size).fill(0);
		const i1 = hash_vertex_to_index.get(e.start);
		const i2 = hash_vertex_to_index.get(e.end);
		const diff = Vec2.sub(e.end, e.start);
		const len_sr = diff.x**2 + diff.y**2;

		l[2*i1] = diff.x/len_sr;
		l[2*i1+1] = diff.y/len_sr;
		l[2*i2] = -diff.x/len_sr;
		l[2*i2+1] = -diff.y/len_sr;
		M.push(l);
	}

	return new Matrix(M);
}

/**
 * Removes vertices that have been fixed by the user from the vertex-edge matrix. Returns a zero matrix if everything has been fixed.
 *
 * @param {array} [verts] - All vertices in the linkage.
 * @param {array} [presetVerts] - The vertices that should be removed.
 * @param {Matrix} [M] - The vertex-edge matrix as provided by populateMatrix(...).
 */
function truncateMatrix(verts, presetVerts, M) {

	const hash_vertex_to_index = populateHashArrayToIndex(verts);
	const colsToRemove = new Set();
	for (const v of presetVerts) {
		const i = hash_vertex_to_index.get(v);
		colsToRemove.add(2*i);
		colsToRemove.add(2*i+1);
	}

	let MArray = M.to2DArray();
	MArray = MArray.map( (c,_) => c.filter((_,i) => !colsToRemove.has(i)) );
	const M2 = new Matrix(MArray)

	return M2;
}

/**
 * Turns the keys of a hash into an array in any order.
 *
 * @param {hash} [hash] - The hashmap whose keys will end up in an array.
 */
function turnKeysToArray(hash) {
	let keys = [];
	for (const [key, value] of hash) {
		keys.push(key);
	}

	return keys;
}

/**
 * Turns a flat column matrix coding for x and y values into an array of Vec2 points.
 *
 * @param {Matrix} [columnVector] - The flat column vector coding for successive x and y values of points like "new Matrix([[x], [y], [x], [y], ...])".
 */
function unflattenColumnVectorToPoints(columnVector) {
	let points = [];
	const array = columnVector.to1DArray();
	for (let i = 0; i < array.length/2; i++) {
		points.push( Vec2.make(array[2*i], array[2*i + 1]) );
	}

	return points;
}

/**
 * Returns a flat column vector with 0 where no movement was specified and the movement vector where movement was given.
 *
 * @param {array} [verts] - All vertices of the linkage.
 * @param {hash} [hash_vertex_to_movement] - A hashmap that maps some amount of predetermined vertices to Vec2 points coding for their movement.
 */
function createMovementVector(verts, hash_vertex_to_movement) {
	let v = [];
	for (const vertex of verts) {
		v.push(
			[ hash_vertex_to_movement.has(vertex) ? hash_vertex_to_movement.get(vertex).x : 0 ]
		);
		v.push(
			[ hash_vertex_to_movement.has(vertex) ? hash_vertex_to_movement.get(vertex).y : 0 ]
		);
	}
	v = new Matrix(v);

	return v;
}

/**
 * Returns the default outputs if the entire linkage movement is already given in the hash_vertex_to_movement with no more freedom.
 * 
 * If [options.unitMotion == true], it outputs the zero movement (not very unitary I know) with no stress and 0 instability.
 * If [options.unitMotion == false], it outputs the provided movement and calcualtes the stresses normally.
 *
 * @param {array} [verts] - All the vertices in the linkage.
 * @param {hash} [hash_vertex_to_movement] - The predetermined movement. This better contain a value for every vertex in verts.
 * @param {array} [edges] - All the edges in the linkage.
 * @param {Matrix} [M] - The vertex-edge matrix as provided by populateMatrix().
 */
function handleFullyPresetLinkage(verts, hash_vertex_to_movement, edges, options, M) {
	if (options.unitMotion) {
		const edgeStressesArray = Array(edges.length).fill(0);
		return [
			replaceHashValuesWithZeroPoints(hash_vertex_to_movement),
			populateHashArrayToArray(edges, edgeStressesArray),
			0
		];
	}

	const movementVector = createMovementVector(verts, hash_vertex_to_movement);
	const edgeStressesVector = M.mmul(movementVector);
	return [
		hash_vertex_to_movement,
		populateHashArrayToArray(edges, edgeStressesVector.to1DArray()),
		edgeStressesVector.norm()
	];
}

/**
 * Returns the array [motionOfLeastResistance, stress, instability].
 * "motionOfLeastResistance" is a hashmap from vertices to Vec2 points coding for movement.
 * "stress" is a haspmap from edges to stress values from 0 to infinity (1 means the link has been compressed to a point) based on motionOfLeastResistance.
 * "instability" is a potential from 1 to infinity.
 *
 * @param {array} [verts] - All vertices of the linkage.
 * @param {hash} [hash_vertex_to_movement] - A hashmap from some of the vertices to their predetermined movement.
 * @param {array} [edges] - All edges of the linkage.
 * @param {Matrix} [M2] - The truncated matrix.
 * @param {SingularValueDecomposition} [svdM2] - The SVD of the truncated matrix.
 */
function computeUnitMotion(verts, hash_vertex_to_movement, edges, M2, svdM2) {
		const hash_vertex_to_zeroMovement = replaceHashValuesWithZeroPoints(hash_vertex_to_movement);
		const V = svdM2.rightSingularVectors;
		const d = svdM2.diagonal;

		const optimalMotionVectorFlat = V.getColumnVector(V.columns - 1);
		const optimalMotionArray = unflattenColumnVectorToPoints(optimalMotionVectorFlat);

		const stressVector = M2.mmul(optimalMotionVectorFlat);
		const stress = populateHashArrayToArray(edges, stressVector.to1DArray());

		const instability = 1 / d[d.length - 1]; // Apparently this already spits out infinity without erroring.

		const motionOfLeastResistance = populateHashArrayToArray(verts, optimalMotionArray, {knownHash : hash_vertex_to_zeroMovement});

		return [motionOfLeastResistance, stress, instability];
}

/**
 * Returns the array [motionOfLeastResistance, stress, resistanceToPresetMotion].
 * "motionOfLeastResistance" is a hashmap from vertices to Vec2 points coding for movement.
 * "stress" is a hashmap from edges to stress values from 0 to infinity (1 means the link has been compressed down to a point).
 * "reistanceToPresetMotion" is a number from 0 to infinity based on the stress that the preset motion causes on the edges.
 * 
 * @param {array} [verts] - All vertices of the linkage.
 * @param {hash} [hash_vertex_to_movement] - A hashmap from some of the vertices to their prescribed movements.
 * @param {array} [edges] - All edges of the linkage.
 * @param {Matrix} [M] - The vertex-edge matrix as returned by populateMatrix.
 * @param {Matrix} [M2] - The truncated vertex-edge matrix as returned by truncateMatrix.
 * @param {SingularValueDecomposition} [svdM2] - The SVD of the previous argument.
 */
function computePresetMotion(verts, hash_vertex_to_movement, edges, M, M2, svdM2) {
	const presetMovement = createMovementVector(verts, hash_vertex_to_movement);
	const presetDeformation = M.mmul(presetMovement);

	const optimalMotionVectorFlat = svdM2.inverse().mmul( presetDeformation.mul(-1) ); // We multiply by -1 because we aim to counteract the deformation caused by the presets.
	const optimalMotionArray = unflattenColumnVectorToPoints(optimalMotionVectorFlat);

	const motionOfLeastResistance = populateHashArrayToArray(verts, optimalMotionArray, {knownHash : hash_vertex_to_movement});

	const closestCompensationDeformation = M2.mmul(optimalMotionVectorFlat);
	const stressVector = Matrix.sub(closestCompensationDeformation, presetDeformation);

	const stress = populateHashArrayToArray(edges, stressVector.to1DArray());

	const resistanceToPresetMotion = stressVector.norm();

	return [motionOfLeastResistance, stress, resistanceToPresetMotion];
}

/**
 * If [options.unitMotion = true] remains set to true: returns the array [motionOfLeastResistance, stress, instability], where.
 * "motionOfLeastResistance" is a hashmap from vertices to Vec2 points coding for movement.
 * "stress" is a haspmap from edges to stress values from 0 to infinity (1 means the link has been compressed to a point) based on motionOfLeastResistance.
 * "instability" is a potential from 1 to infinity.
 * 
 * If it is set to false: returns the array [motionOfLeastResistance, stress, resistanceToPresetMotion], where.
 * "motionOfLeastResistance" is a hashmap from vertices to Vec2 points coding for movement.
 * "stress" is a hashmap from edges to stress values from 0 to infinity (1 means the link has been compressed down to a point).
 * "reistanceToPresetMotion" is a number from 0 to infinity based on the stress that the preset motion causes on the edges. It is defined to become 1 / instability when the unit motion is manually entered.
 *
 * @param {array} [verts] - All vertices of the linkage.
 * @param {hash} [hash_vertex_to_movement] - A hashmap from any number of vertices to their predetermined movements. These get overwritten with zero movement when unit motion is selected.
 * @param {array} [edges] - All the links of the linkage.
 * @param {set} [options = {unitMotion : true}] - The unitMotion option.
 */
export function motionOfLeastResistance(verts, hash_vertex_to_movement, edges, options = {unitMotion : true,}) {

	// I don't understand imports...
	//console.log(ml);
	//console.log(Object.keys(window).filter(x => x.toLowerCase().includes('matrix')));

	const M = populateMatrix(verts, edges);

	const presetVerts = turnKeysToArray(hash_vertex_to_movement);

	if (presetVerts.length == verts.length) {
		return handleFullyPresetLinkage(verts, hash_vertex_to_movement, edges, options, M);
	}

	const M2 = truncateMatrix(verts, presetVerts, M);

	const svdM2 = new SingularValueDecomposition(M2, {autoTranspose : false});

	if (options.unitMotion) {
		return computeUnitMotion(verts, hash_vertex_to_movement, edges, M2, svdM2);
	} 

	return computePresetMotion(verts, hash_vertex_to_movement, edges, M, M2, svdM2);
}
