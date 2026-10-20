import {
	Joint,
	Hart,
} from "./linkage-utils.js"

import {
	initDefault,
} from "./canvas-utils.js";

// =========================
// Initialization
// =========================

function initializeLinkages(){
	return [

		new Hart({
			//A1 : {x:1, y:1},
			//A2 : new Joint({x:0, y:1}, {is_anchor : true}),
			crank : new Joint({x:1, y:1}),
			output : new Joint({x:2, y:2}),
			Lgrounded : 1,
			offset : {x:0, y:-2},
			//flipped : true,
		})

	];
}

const sharedLinkages = initializeLinkages();

document.addEventListener("DOMContentLoaded", initDefault("general-hart", initializeLinkages, sharedLinkages, {}), {once : true});
