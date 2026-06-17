(function () {
  'use strict';

  /**
   * Promo bar front-end behavior: tracks two directional states —
   * can-scroll-left (scrolled away from the start) and can-scroll-right
   * (more content past the right edge). Each toggles a class on the bar
   * that drives the matching edge fade + chevron (see promo-bar.scss).
   * Re-evaluated on scroll and on resize (ResizeObserver).
   */

  const LEFT_CLASS = 'promo-bar--can-scroll-left';
  const RIGHT_CLASS = 'promo-bar--can-scroll-right';
  const EDGE_TOLERANCE = 1;
  const FADE_OFFSET = 25;

  function init(bar) {
    const list = bar.querySelector('.promo-bar__list');
    const prevBtn = bar.querySelector('.promo-bar__scroll--prev');
    const nextBtn = bar.querySelector('.promo-bar__scroll--next');
    if (!list || !prevBtn || !nextBtn) return;

    function update() {
      const canLeft = list.scrollLeft > EDGE_TOLERANCE;
      const canRight =
        list.scrollLeft + list.clientWidth < list.scrollWidth - EDGE_TOLERANCE;
      bar.classList.toggle(LEFT_CLASS, canLeft);
      bar.classList.toggle(RIGHT_CLASS, canRight);
    }

    function step(direction) {
      // Advance by one item boundary. Targets the next/previous item
      // relative to the list's left edge, so a click works even when a
      // single item is wider than the viewport (mobile).
      const items = list.querySelectorAll('.promo-bar__item');
      if (!items.length) return;
      const listRect = list.getBoundingClientRect();
      let target = null;
      if (direction > 0) {
        // First item past the landing zone — anything already at or before
        // the landing zone is "already shown clear of the fade."
        for (const item of items) {
          if (item.getBoundingClientRect().left - listRect.left > FADE_OFFSET + EDGE_TOLERANCE) {
            target = item;
            break;
          }
        }
      } else {
        // Last item that hasn't reached the landing zone yet.
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i].getBoundingClientRect().left - listRect.left < FADE_OFFSET - EDGE_TOLERANCE) {
            target = items[i];
            break;
          }
        }
      }
      if (!target) return;
      const left =
        list.scrollLeft +
        (target.getBoundingClientRect().left - listRect.left) -
        FADE_OFFSET;
      const reduce =
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      list.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
    }

    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));

    list.addEventListener('scroll', update, { passive: true });

    if (typeof window.ResizeObserver !== 'undefined') {
      new window.ResizeObserver(update).observe(list);
    } else {
      window.addEventListener('resize', update);
    }

    update();
  }

  function setup() {
    document.querySelectorAll('.promo-bar').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
