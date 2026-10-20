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
			//dragCrank : false,
			//Lrhombus1 : 1,
			//Lrhombus2 : 2,
			Lrhombus : Math.sqrt(2),
			//side1Folded : 1,
			// Default settings
			offset : {x:0, y:-1.5},
			dragA1 : false,
			dragOutput : false,
			dragRocker : false,
			//symmetric : false,
		}),

	];
}

const sharedLinkages = initializeLinkages();

document.addEventListener("DOMContentLoaded", initDefault("normal-PL", initializeLinkages, sharedLinkages, {}), {once : true});
