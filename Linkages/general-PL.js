import {
	Joint,
	PL,
} from "./linkage-utils.js"

/*
import {
	testPL
} from "./test-linkage.js"
*/

import {
	Vec2,
} from "./low-level-utils.js"

import {
	initDefault,
} from "./canvas-utils.js";

import {
	motionOfLeastResistance,
} from "./test_project.js"

// =========================
// Initialization
// =========================

function initializeLinkages() {
	// This needs to be a function or it will reuse the pointers every time instead of creating new objects.
	function defaultSettings() {
		return {
			//dragCrank : false,
			//Lrhombus1 : 1,
			//Lrhombus2 : 2,
			//Lrhombus : Math.sqrt(2),
			//side1Folded : 1,
			//dragA1 : false,
			output : new Joint({x: 0, y: -1}),
			//offset : {x: -1.5, y: -1},
			crank : new Joint({x: 0, y: 2}),
			//dragOutput : false,
			//dragRocker : false,
			symmetric : true,
			//showAllStresses : true,
			//showAllVelocities : true,
		};
	}

	const PL1 = new PL({
		//...defaultSettings(),
		output : new Joint({x: 0, y: -1}),
		crank : new Joint({x: 0, y: 2}),
		symmetric : true,
		offset : {x: -1.5, y: -1},
		//output : new Joint({x: 0, y: -2}),
	});

	const PL2 = new PL({
		//...defaultSettings(),
		output : new Joint({x: 0, y: -1}),
		crank : new Joint({x: 0, y: 2}),
		symmetric : true,
		//A2 : sharedA2,
		offset : {x: 1.5, y: -1},
		forceMode : true,
		drawOutputLine : false,
		//showAllStresses : true,
		//showAllVelocities : true,
	});

	return [
		PL1,
		PL2,
	];
}

const sharedLinkages = initializeLinkages();
const first = sharedLinkages[0];
const second = sharedLinkages[1];

/*
let sharedJoints = new Map();
sharedJoints.set(sharedLinkages[0].A1, sharedLinkages[1].A1);
sharedJoints.set(sharedLinkages[0].A2, sharedLinkages[1].A2);
sharedJoints.set(sharedLinkages[0].crank, sharedLinkages[1].crank);
shareJoints(sharedJoints);
*/


document.addEventListener("DOMContentLoaded", initDefault("general-PL", initializeLinkages, sharedLinkages, {}), {once : true});

//sharedLinkages[1].crank = sharedLinkages[0].crank;
//sharedLinkages[1].A2 = sharedLinkages[0].A2;



let presetMovement = new Map();
/*
presetMovement.set(sharedLinkages[0].A1, Vec2.make(0,0));
presetMovement.set(sharedLinkages[0].A2, Vec2.make(0,0));
presetMovement.set(sharedLinkages[0].crank, Vec2.make(0,0));
presetMovement.set(sharedLinkages[0].output, Vec2.make(-0.5,0));
//presetMovement.set(sharedLinkages[0].rocker1, {x: 0.051063438684820626, y: 0.3811036389525073});
//presetMovement.set(sharedLinkages[0].rocker2, {x: 0.05106343868482026, y: -0.3811036389525062});
//presetMovement.set(sharedLinkages[0].output, {x: 0.8392288622382327, y: 1.4788395384546074e-15});
*/

document.addEventListener("mousemove", e => {
	

	for (const [index, joint] of second.getJoints().entries()) {
		presetMovement.set(joint, joint.velocity.direction);

		joint.setPt( Vec2.add( first.getJoints()[index], {x: 3, y: 0} ) );
		second.Lrhombus1 = first.Lrhombus1;
		second.Lrhombus2 = first.Lrhombus2;
		second.Lrocker1 = first.Lrocker1;
		second.Lrocker2 = first.Lrocker2;
		second.side1Folded = first.side1Folded;
		second.side2Folded = first.side2Folded;
	}

	const motion = motionOfLeastResistance(
		sharedLinkages[1].getJoints(),
		presetMovement,
		sharedLinkages[1].getLinks(),
		{unitMotion : false}
	);

	for (const joint of sharedLinkages[1].getJoints()) {
		joint.velocity.dir = motion[0].get(joint);
	}
	for (const link of sharedLinkages[1].getLinks()) {
		link.stress = motion[1].get(link);
	}
	//console.log("generalPL motion:", motion)
});
