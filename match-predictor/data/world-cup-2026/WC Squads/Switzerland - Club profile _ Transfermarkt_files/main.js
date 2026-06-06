function switchPage(element) {
  let property = element.attr('name');
  let value = element.val();
  let pathname = window.location.pathname;

  const regex = new RegExp(`/${property}(?:/[^/]+|$)`);
  pathname = pathname.replace(regex, '');

  if (value != '') {
    pathname = pathname + '/' + property + '/' + value;
  }

  pathname = pathname.replace(/([^:]\/)\/+/g, '$1');

  window.location.href = pathname;
}

function sendFormParams2Path(form) {
  formParams = form.serializeArray();
  path = '';
  jQuery.each(formParams, function (i, formParam) {
    if (formParam.value) {
      path = path + '/' + formParam.name + '/' + formParam.value;
    }
  });
  url = form.attr('action') + path;
  location.href = url;
}

function wechselLiga(liga_id) {
  var url = splitLocation();
  if (url[2] == 'spielerbieten') {
    url[2] = 'transfermarkt';
  }
  if (url[2] == 'verein' || url[2] == 'spieler' || url[2] == 'spielerprofil') {
    location.href =
      window.location.protocol +
      '//' +
      window.location.host +
      '/' +
      url[1] +
      '/' +
      url[2] +
      '/' +
      url[3] +
      '/' +
      liga_id +
      '/' +
      url[5] +
      '/' +
      url[6];
  } else {
    location.href =
      window.location.protocol +
      '//' +
      window.location.host +
      '/' +
      url[1] +
      '/' +
      url[2] +
      '/' +
      url[3] +
      '/' +
      liga_id +
      '';
  }
}

function wechselKaderuebersicht(user_id) {
  var url = splitLocation();
  url[2] = 'aufstellungUndKader';
  location.href =
    window.location.protocol +
    '//' +
    window.location.host +
    '/' +
    url[1] +
    '/' +
    url[2] +
    '/' +
    url[3] +
    '/' +
    url[4] +
    '/user/' +
    user_id +
    '';
}

function wechselTipprunde(wettbewerb_id) {
  var url = splitLocation();
  if (url[3] == 'fanliga') {
    url[3] = 'fanligen';
  }
  if (url[3] == 'privateliga') {
    url[3] = 'privateligen';
  }
  location.href =
    window.location.protocol +
    '//' +
    window.location.host +
    '' +
    url[0] +
    '/' +
    url[1] +
    '/' +
    url[2] +
    '/' +
    url[3] +
    '/' +
    url[4] +
    '/' +
    wettbewerb_id +
    '';
}

function nl2br(str, is_xhtml) {
  var breakTag =
    is_xhtml || typeof is_xhtml === 'undefined' ? '<br />' : '<br>';
  return (str + '').replace(
    /([^>\r\n]?)(\r\n|\n\r|\r|\n)/g,
    '$1' + breakTag + '$2'
  );
}

function splitLocation() {
  var parts = window.location.pathname.split('/');
  return parts;
}

function formatiereMarktwert(marktwert) {
  if (marktwert >= 1000000000) {
    marktwert = round(marktwert / 1000000000, 2);
    marktwert = number_format(marktwert, 2, ',', '.') + ' Mrd. €';
  } else if (marktwert >= 1000000) {
    marktwert = round(marktwert / 1000000, 2);
    marktwert = number_format(marktwert, 2, ',', '.') + ' Mio. €';
  } else if (marktwert == 0) {
    marktwert = '-';
  } else if (marktwert <= -1000000) {
    marktwert = round(marktwert / 1000000, 2);
    marktwert = number_format(marktwert, 2, ',', '.') + ' Mio. €';
  } else {
    marktwert = marktwert / 1000;
    marktwert = number_format(marktwert, 0, '', '.') + ' Tsd. €';
  }
  return marktwert;
}

function round(value, precision, mode) {
  //phpjs.org/functions/round/
  http: var m, f, isHalf, sgn; // helper variables
  precision |= 0; // making sure precision is integer
  m = Math.pow(10, precision);
  value *= m;
  sgn = (value > 0) | -(value < 0); // sign of the number
  isHalf = value % 1 === 0.5 * sgn;
  f = Math.floor(value);
  if (isHalf) {
    switch (mode) {
      case 'PHP_ROUND_HALF_DOWN':
        value = f + (sgn < 0); // rounds .5 toward zero
        break;
      case 'PHP_ROUND_HALF_EVEN':
        value = f + (f % 2) * sgn; // rouds .5 towards the next even integer
        break;
      case 'PHP_ROUND_HALF_ODD':
        value = f + !(f % 2); // rounds .5 towards the next odd integer
        break;
      default:
        value = f + (sgn > 0); // rounds .5 away from zero
    }
  }

  return (isHalf ? value : Math.round(value)) / m;
}

function number_format(number, decimals, dec_point, thousands_sep) {
  // http://phpjs.org/functions/number_format/
  number = (number + '').replace(/[^0-9+\-Ee.]/g, '');
  var n = !isFinite(+number) ? 0 : +number,
    prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
    sep = typeof thousands_sep === 'undefined' ? ',' : thousands_sep,
    dec = typeof dec_point === 'undefined' ? '.' : dec_point,
    s = '',
    toFixedFix = function (n, prec) {
      var k = Math.pow(10, prec);
      return '' + Math.round(n * k) / k;
    };
  // Fix for IE parseFloat(0.55).toFixed(0) = 0;
  s = (prec ? toFixedFix(n, prec) : '' + Math.round(n)).split('.');
  if (s[0].length > 3) {
    s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if ((s[1] || '').length < prec) {
    s[1] = s[1] || '';
    s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(dec);
}

function changeIcon(schaetzung, originalwert) {
  if (schaetzung > originalwert) {
    $('#amount_icon')
      .removeAttr('class')
      .attr('class', 'icons_sprite green-arrow-ten');
  } else if (schaetzung < originalwert) {
    $('#amount_icon')
      .removeAttr('class')
      .attr('class', 'icons_sprite red-arrow-ten');
  } else {
    $('#amount_icon')
      .removeAttr('class')
      .attr('class', 'icons_sprite grey-block-ten');
  }
}

function tinyExecCommandAddTarget(
  editor_id,
  elm,
  command,
  user_interface,
  value
) {
  var editor = tinyMCE.get(editor_id);
  switch (command.toLowerCase()) {
    case 'createlink':
      $(editor.getBody())
        .find('a')
        .attr('target', '_blank');
      break;
  }
}

const tinymceLinkFix = function(editor) {
  var savedRange = null;

  // Save selection before the link command executes
  editor.onBeforeExecCommand.add(function(editor, cmd, ui, value) {
    if (cmd === 'mceLink') {
      savedRange = editor.selection.getRng();  // Save the selection
    }
  });

  // Restore selection after the link command executes
  editor.onExecCommand.add(function(editor, cmd, ui, value) {
    if (cmd === 'mceLink' && savedRange) {
      setTimeout(() => {
        if (savedRange) {
          editor.selection.setRng(savedRange);
        }
      }, 400);
    }
  });
};

const dropDownHeader = () => {
  $('.dropdown-header, .dropdown-image').on('click', function () {
    $(this).toggleClass('active_dropdown-header');
    $(this)
      .parent()
      .find('.dropdown-content')
      .toggle('fast');
  });
};

const trackBreadcrumbs = () =>
  $('.breadcrumb-button').on(
    'click',
    () => typeof tmEvent === 'function' && tmEvent('breadcrumb-button', 'click', 'menu')
  );

const trackPlayerPronunciation = () => {
  const audio = document.getElementById('audio_aussprache');
  const infoLink = document.getElementById('info_aussprache');
  let lastRate = audio?.playbackRate;
  if (audio) {
    audio.addEventListener('play', () => (typeof tmEvent === 'function') && tmEvent('spielerprofil', 'play', 'pronunciation'));
    audio.addEventListener('ratechange', () => {
      if (audio.playbackRate !== lastRate) {
        lastRate = audio.playbackRate;
        return (typeof tmEvent === 'function') && tmEvent('spielerprofil', 'speed', 'pronunciation');
      }

    });
  }
  if (infoLink) {
    infoLink.addEventListener('click', () => (typeof tmEvent === 'function') && tmEvent('spielerprofil', 'information', 'pronunciation'));
  }
};

const backToTopInit = () => {
  var backToTopButton = document.getElementById('back-to-top');
  var mainElement = document.getElementById('main');

  if (backToTopButton && mainElement) {
    function toggleButtonVisibility() {
      if (window.scrollY > 200) {
        backToTopButton.style.display = 'block';
        backToTopButton.style.opacity = '1';
      } else {
        backToTopButton.style.display = 'none';
        backToTopButton.style.opacity = '0';
      }
    }

    function scrollToTop() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

    function setButtonPosition() {
      var mainRect = mainElement.getBoundingClientRect();
      var buttonRightPosition = window.innerWidth - mainRect.right;

      backToTopButton.style.right = buttonRightPosition + 'px';
    }

    window.addEventListener('scroll', toggleButtonVisibility);
    backToTopButton.addEventListener('click', scrollToTop);
    window.addEventListener('resize', setButtonPosition);
    setButtonPosition();
  }
};

const revokeTrackingInit = () => {
  const revokeTracking = document.querySelector('.revoke-tracking');
  revokeTracking.addEventListener('click', function () {
    if (typeof window.__tcfapi === 'function') {
      window.__tcfapi('postRejectAll', 2, (postRejectAllResponse, success) => {
        if (success) {
          document.getElementById("tm-modal-revoke-tracking").show = true;
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          console.error('Error while revoking tracking consent:', postRejectAllResponse);
        }
      });
    } else {
      console.error('Error while revoking tracking consent: __tcfapi not available');
    }
  });
};

const cmpInit = () => {
  const openCMP = () => {
    const cmpLayerId = parseInt(document.body.getAttribute('data-cmp-layer-id'), 10);
    if (window._sp_ && typeof window._sp_.loadPrivacyManagerModal === 'function' && !isNaN(cmpLayerId)) {
      const cmpLayerId = document.body.getAttribute('data-cmp-layer-id');
      window._sp_.loadPrivacyManagerModal(cmpLayerId)
    }
  };

  const cmpLinks = document.querySelectorAll('.cmp-link');
  if (cmpLinks && cmpLinks.length) {
    cmpLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        openCMP();
      })
    })
  }
};

const mainNavAndHamburgerInit = () => {
  const hamburger = document.querySelector('.main-navbar__details .hamburger');
  const dropdownElement = document.querySelector('.main-navbar__dropdown');

  hamburger.addEventListener('click', (e) => {
    e.preventDefault();
    hamburger.classList.toggle('is-active');

    if (!hamburger.parentElement.classList.contains('open')) {
      window.dispatchEvent(new CustomEvent('closeDropdowns', {detail: 'desktopMenu'}))
    }
    hamburger.parentElement.classList.toggle('open');
  });

  window.addEventListener('closeDropdowns', (e) => {
    if (hamburger.parentElement.classList.contains('open') && e.detail !== 'desktopMenu') {
      hamburger.classList.toggle('is-active');
      hamburger.parentElement.classList.toggle('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (hamburger.parentElement.classList.contains('open') && !hamburger.contains(e.target) && !dropdownElement.contains(e.target)) {
      window.dispatchEvent(new CustomEvent('closeDropdowns', { detail: 'backgroundClick' }));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hamburger.parentElement.classList.contains('open')) {
      window.dispatchEvent(new CustomEvent('closeDropdowns', { detail: 'escapeKey' }));
    }
  });
};

const tooltipInit = () => {
  var targets = $('[rel~=tooltip]'),
    target = false,
    tooltip = false,
    type = false,
    content = false;
  targets.bind('mouseenter', function () {
    target = $(this);
    type = target.attr('data-type');
    content = target.attr('data-content');
    tooltip = $('<div id="tooltip" class="loading"></div>');
    if (!content || content == '') return false;
    tooltip.css('opacity', 0).appendTo('body');
    if (type == 'link') {
      $.get(content, function (data) {
        tooltip.html(data).removeClass('loading');
      });
    } else {
      tooltip.html(content).removeClass('loading');
    }

    var init_tooltip = function () {
      var pos_hor = target.offset().left + target.outerWidth() + 10,
        pos_top = target.offset().top - 25,
        typ_hor = 'left';
      if (pos_hor > $('#main').outerWidth() / 2 + $('#main').offset().left) {
        pos_hor = $(window).width() - target.offset().left;
        typ_hor = 'right';
      }

      if (pos_top < 0) {
        var pos_top = target.offset().top + target.outerHeight();
      }

      tooltip
        .css(typ_hor, pos_hor)
        .css('top', pos_top)
        .animate({ opacity: 1 }, 50);
    };
    init_tooltip();
    $(window).resize(init_tooltip);
    var remove_tooltip = function () {
      tooltip.animate({ top: '-=10', opacity: 0 }, 50, function () {
        $(this).remove();
      });
    };
    target.bind('mouseleave', remove_tooltip);
    tooltip.bind('click', remove_tooltip);
  });
};

const init = () => {
  $('.js-switcher select').change(function () {
    switchPage($(this));
  });
  $('.js-switcher').submit(function () {
    switchPage($(this).find('select'));
    return false;
  });
  $('.js-form-params2path').submit(function () {
    sendFormParams2Path($(this));
    return false;
  });
  $('.toggler').click(function () {
    var target = $(this).attr('data-toggle');
    $('#' + target).toggle('fast');
    $(this).toggleClass('offen');
  });
  $('.info-content').click(function () {
    $(this).toggleClass('info-offen', 'fast');
    //_gaq.push(['_trackEvent', 'info-text', 'click', 'info']);
    // tmEvent('info-text', 'click', 'info');
  });
  $('.breadcrumb .home').click(function () {
    if ($('#main').innerWidth() < 768) {
      $('.breadcrumb').toggleClass('breadcrumb-offen', 'fast');
    }
  });
  $('.breadcrumb-select select').change(function () {
    if ($(this).val() !== '') {
      $(this)
        .parents('form.breadcrumb-form')
        .find('.breadcrumb-button')
        .removeAttr('disabled')
        .removeClass('disabled');
    }
  });
  $(window).resize(function () {
    if ($(window).width() > 766) {
      $('#mainmenue li:not(.megamenu_button)').show();
    }
  });
};

const customElementInteractions = () => {
  document.body.addEventListener('click', () => {
    const customElements = [
      { identifier: 'domainSwitcher', customSelector: document.querySelector('tm-domainswitcher'), keyProp: 'openList', falsyValue: false },
      { identifier: 'userBox', customSelector: document.querySelector('tm-user-box'), keyProp: 'dropdownVisible', falsyValue: '' },
      { identifier: 'quickSelect', customSelector: document.querySelector('tm-quick-select-bar'), keyProp: 'dropdownVisible', falsyValue: '' }
    ];

    customElements.forEach(ce => {
      // since userbox is not always there, pre login phase, we need to check if it exists first
      if (ce.customSelector) {
        ce.customSelector[ce.keyProp] = ce.falsyValue;
      }
    });
  });

  document.body.addEventListener('closeDropdowns', (ev) => {
    const customElements = [
      { identifier: 'domainSwitcher', customSelector: document.querySelector('tm-domainswitcher'), keyProp: 'openList', falsyValue: false },
      { identifier: 'userBox', customSelector: document.querySelector('tm-user-box'), keyProp: 'dropdownVisible', falsyValue: '' },
      { identifier: 'quickSelect', customSelector: document.querySelector('tm-quick-select-bar'), keyProp: 'dropdownVisible', falsyValue: '' }
    ];

    customElements.forEach(ce => {
      if (ev.detail !== ce.identifier && ce.customSelector) {
        ce.customSelector[ce.keyProp] = ce.falsyValue;
      }
    });
  });
};

const debugInfoModalInit = () => {
  document.body.addEventListener('showDebugInfo', () => {
    MicroModal.show('modal-debugInfos');
  });
};

const lazyLoadUpdate = () => {
  $(document).on('ajaxSuccess', function() {
    if (window.hasOwnProperty('LazyLoadInstance')) {
      window.LazyLoadInstance.update();
    }
  });

  if (window.hasOwnProperty('LazyLoadInstance')) {
    window.LazyLoadInstance.update();
  }

};

document.addEventListener('DOMContentLoaded', function () {
  dropDownHeader();
  trackBreadcrumbs();
  trackPlayerPronunciation();
  backToTopInit();
  revokeTrackingInit();
  cmpInit();
  mainNavAndHamburgerInit();
  tooltipInit();
  init();
  customElementInteractions();
  debugInfoModalInit();
  lazyLoadUpdate();
});

document.addEventListener('DOMContentLoaded', function () {
  const audio = document.getElementById('audio_aussprache');
  const infoLink = document.getElementById('info_aussprache');
  let lastRate = audio?.playbackRate;
  if (audio) {
    audio.addEventListener('play', () => (typeof tmEvent === 'function') && tmEvent('spielerprofil', 'play', 'pronunciation'));
    audio.addEventListener('ratechange', () => {
      if (audio.playbackRate !== lastRate) {
        lastRate = audio.playbackRate;
        return (typeof tmEvent === 'function') && tmEvent('spielerprofil', 'speed', 'pronunciation');
      }

    });
  }
  if (infoLink) {
    infoLink.addEventListener('click', () => (typeof tmEvent === 'function') && tmEvent('spielerprofil', 'information', 'pronunciation'));
  }
});
