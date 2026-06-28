(function() {
  if (!window.beehiivEmbedLoaded) {
    window.beehiiv__currentWindowWidth = window.outerWidth;
    window.beehiiv__currentWindowHeight = window.outerHeight;

    function findEmbedIframe(event) {
      return [...document.querySelectorAll('iframe.beehiiv-embed')].find(f => f.contentWindow === event.source);
    }

    function loadBeehiivEmbed() {
      // Fallback: if child never loads (server-side 403 block page), expand
      // iframes so the HUMAN challenge is usable.
      setTimeout(function () {
        document.querySelectorAll('iframe.beehiiv-embed').forEach(function (iframe) {
          if (!iframe.getAttribute('data-bhv-loaded')) {
            iframe.style.height = '350px';
            iframe.style.width = '100%';
          }
        });
      }, 5000);

      window.addEventListener('message', (event) => {
        if (event.data.type === 'beehiiv:styles') {
          const height = event.data.payload.height;
          const width = event.data.payload.width;
          const borderRadius = event.data.payload.borderRadius || '0px';
          const boxShadow = event.data.payload.boxShadow || 'none';
          const iframe = findEmbedIframe(event);
          if (!iframe) return;
          requestAnimationFrame(() => {
            if (iframe.style.width !== width) iframe.style.width = width
            if (iframe.style.height !== height) iframe.style.height = height
            if (iframe.style.borderRadius !== borderRadius) iframe.style.borderRadius = borderRadius
            if (iframe.style.boxShadow !== boxShadow) iframe.style.boxShadow = boxShadow
          })
        } else if (event.data.type === 'beehiiv:challenge') {
          // HUMAN challenge detected inside iframe — resize to fit
          const iframe = findEmbedIframe(event);
          if (!iframe) return;
          requestAnimationFrame(() => {
            if (event.data.payload.height) iframe.style.height = event.data.payload.height;
            if (event.data.payload.width) iframe.style.width = event.data.payload.width;
          });
        } else if (event.data.type === 'beehiiv:challenge-resolved') {
          // Challenge solved — remeasure the form
          const iframe = findEmbedIframe(event);
          if (!iframe) return;
          iframe.style.height = "2000px";
          iframe.style.width = "5000px";
          iframe.contentWindow.postMessage({ type: 'beehiiv:resize' }, '*');
        } else if (event.data.type === 'beehiiv:success-toast') {
          const template = event.data.payload.templateString;
          const doc = (new DOMParser()).parseFromString(template, "text/html");
          const fragment = document.createDocumentFragment();
          [...doc.body.childNodes].forEach(node => fragment.appendChild(node));

          document.body.appendChild(fragment);
          setTimeout(() => document.querySelector("#beehiiv-toast").remove(), 5000);
        } else if (event.data.type === 'beehiiv:child-loaded') {
          const iframe = findEmbedIframe(event);
          if (!iframe) return;
          iframe.setAttribute('data-bhv-loaded', 'true');
          iframe.style.height = "2000px"
          iframe.style.width = "5000px"

          requestAnimationFrame(() => {
            iframe.contentWindow.postMessage({ type: 'beehiiv:parent-loaded' }, '*');
          });
        }
      });

      if (!window.beehiiv_resizeObserver) {
        window.beehiiv_resizeObserver = new ResizeObserver(() => {
          const resize = window.outerWidth > window.beehiiv__currentWindowWidth || window.outerHeight > window.beehiiv__currentWindowHeight;

          document.querySelectorAll('iframe.beehiiv-embed').forEach((iframe) => {
            if (resize) {
              requestAnimationFrame(() => {
                iframe.style.height = "2000px"
                iframe.style.width = "5000px"
                iframe.contentWindow.postMessage({ type: 'beehiiv:resize' }, '*');
              })
            }
          })

          window.beehiiv__currentWindowWidth = window.outerWidth;
          window.beehiiv__currentWindowHeight = window.outerHeight;
        });
        window.beehiiv_resizeObserver.observe(document.querySelector("body"));
      }
    }

    if (window.document.readyState === 'complete') {
      loadBeehiivEmbed();
    } else {
      window.addEventListener('load', loadBeehiivEmbed);
    }
    window.beehiivEmbedLoaded = true;
  }
})();
