import {
	Joint,
	PL,
} from "./linkage-utils.js"

import {
	initDefault,
} from "./canvas-utils.js";

// =========================
// Initialization
// =========================

function initializeLinkages() {
	return [

		new PL({
			output : new Joint({x: 0, y: -1}),
			offset : {x: 0, y:-0.5},
			dragA1 : false,
			A1 : new Joint({x: 0, y: 0}, {is_anchor: true}),
			dragOutput : false,
			dragRocker : false,
			//side1Folded : 1,
			//symmetric : false,
			//drawOutputLine : false,
		})

	];
}

const sharedLinkages = initializeLinkages();

document.addEventListener("DOMContentLoaded", initDefault("inverse-PL", initializeLinkages, sharedLinkages, {}), {once : true});
