function createState() {
	return {
		embedded: false,
		mainSiteLink: null,
	};
}

const state = createState();

document.addEventListener("DOMContentLoaded", () => {
	if (window.self !== window.top) {
		document.documentElement.classList.add("embedded");
		state.embedded = true;
	}

	state.mainSiteLink = document.querySelector(`.main-link`);

	state.mainSiteLink.addEventListener("click", (e) => {
		if (state.embedded) {
			e.preventDefault();
			window.parent.postMessage(
				{ type: "return-to-main" },
				"*"
			);
		}
	});

	window.addEventListener("message", (event) => {
		if(event.data.type == "activate") {
			document.documentElement.classList.add("active");
		}
		if(event.data.type == "deactivate") {
			document.documentElement.classList.remove("active");
		}
	});

}, {once : true});
