const initStuckClassHandling = () => {
    const mainNavbar = document.querySelector(".main-navbar");
    const tmHeaderBox = document.querySelector(".tm-header__box");

    let lastScrollY = window.scrollY;
    let ticking = false;
    let sticky = false;
    let stuckSwitchPaused = false;

    if (lastScrollY > 0) {
        sticky = true;
        stuckSwitchPaused = true;

        mainNavbar.style.transition = 'none';
        tmHeaderBox.style.transition = 'none';
        mainNavbar.classList.add('main-navbar-stuck');
        tmHeaderBox.classList.add('tm-header-stuck');

        setTimeout(() => {
            mainNavbar.style.transition = '';
            tmHeaderBox.style.transition = '';
        }, 100);
    }

    const onScroll = () => {
        lastScrollY = window.scrollY;

        if (!ticking) {
            window.requestAnimationFrame(() => {
                let action = false;
                if (!sticky && lastScrollY > 0) {
                    action = 'add';
                    sticky = true;
                    stuckSwitchPaused = true;
                }
                if (stuckSwitchPaused && sticky && lastScrollY > 30) {
                    stuckSwitchPaused = false;
                }
                if (!stuckSwitchPaused && sticky && lastScrollY === 0) {
                    action = 'remove';
                    sticky = false;
                }

                if (action) {
                    mainNavbar?.classList[action]('main-navbar-stuck');
                    tmHeaderBox?.classList[action]('tm-header-stuck');
                }
                ticking = false;
            });
            ticking = true;
        }
    };

    if (mainNavbar || tmHeaderBox) {
      window.addEventListener('scroll', onScroll);
    } else {
        if (!mainNavbar) {
            console.error('Element with class "main-navbar" not found.');
        }
        if (!tmHeaderBox) {
            console.error('Element with class "tm-header__box" not found.');
        }
    }
}

const configureSkyBelowTheFold = () => {
    const skyBtfElement = document.querySelector('.werbung-skyscraperbtf-container');
    const pageHeight = document.body.scrollHeight;

    if(skyBtfElement && pageHeight > 3000) {
        skyBtfElement.style.top = (pageHeight >= 5000 ? pageHeight / 2 : 2000) + 'px';
        skyBtfElement.style.display = 'block';
    }
};

document.addEventListener("DOMContentLoaded", () => {
    initStuckClassHandling();
    configureSkyBelowTheFold();

    var config={
		'.chzn-select': {},
		'.chzn-select-deselect': { allow_single_deselect: true },
		'.chzn-select-no-single': { disable_search_threshold: 10 },
		'.chzn-select-no-results': { no_results_text: 'Oops, nothing found!' },
		'.chzn-select-width': { width: '95%' }
	};

	for (var selector in config) {
		$(selector).chosen(config[selector]);
	}
});
