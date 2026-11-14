// DueBoard website themes: the same four study themes as the dashboard, with Automatic picking one by the time of
// day (same hours as automaticTheme in src/core/theme.ts). Loaded in <head> so the page never flashes the wrong theme.
(function () {
  var KEY = 'dueboard-site-theme';
  var CHOICES = ['automatic', 'nightowl', 'morning-dew', 'noon-cafe', 'dusk-lullaby'];
  var NAMES = {
    automatic: 'Automatic',
    nightowl: 'Nightowl',
    'morning-dew': 'Morning Dew',
    'noon-cafe': 'Noon Cafe',
    'dusk-lullaby': 'Dusk Lullaby'
  };
  var root = document.documentElement;

  function automaticTheme(now) {
    var hour = now.getHours();
    if (hour >= 5 && hour < 12) return 'morning-dew';
    if (hour >= 12 && hour < 18) return 'noon-cafe';
    if (hour >= 18 && hour < 23) return 'dusk-lullaby';
    return 'nightowl';
  }

  function readChoice() {
    try {
      var saved = localStorage.getItem(KEY);
      return CHOICES.indexOf(saved) >= 0 ? saved : 'automatic';
    } catch (e) {
      return 'automatic';
    }
  }

  var choice = readChoice();

  function shown() {
    return choice === 'automatic' ? automaticTheme(new Date()) : choice;
  }

  function paint() {
    var theme = shown();
    root.setAttribute('data-theme', theme);
    var label = choice === 'automatic' ? 'Automatic · ' + NAMES[theme] : NAMES[theme];
    var switches = document.querySelectorAll('[data-theme-switch]');
    for (var i = 0; i < switches.length; i++) {
      switches[i].hidden = false;
      switches[i].querySelector('[data-theme-name]').textContent = label;
      switches[i].setAttribute('aria-label', 'Theme: ' + label + '. Click for the next theme.');
    }
    var picks = document.querySelectorAll('[data-theme-pick]');
    for (var j = 0; j < picks.length; j++) {
      picks[j].setAttribute('aria-pressed', String(picks[j].getAttribute('data-theme-pick') === choice));
    }
  }

  function choose(next) {
    choice = next;
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {
      // Private windows may block storage; the theme still changes for this visit.
    }
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calm) document.startViewTransition(paint);
    else paint();
  }

  paint();
  // Automatic moves on to the next theme as the hours pass, like the dashboard.
  setInterval(function () {
    if (choice === 'automatic' && root.getAttribute('data-theme') !== shown()) choose('automatic');
  }, 60 * 1000);

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Same format as formatCountdown in src/core/time.ts: "05:42:18", with a day prefix past 24 hours.
  function countdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400);
    var clock = pad(Math.floor((s % 86400) / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    return d === 0 ? clock : d + 'd ' + clock;
  }

  function startDemoDeadline() {
    var el = document.querySelector('[data-demo-countdown]');
    if (!el) return;
    var due = Date.now() + (26 * 3600 + 14 * 60 + 37) * 1000;
    function tick() {
      el.textContent = countdown(due - Date.now());
    }
    tick();
    setInterval(tick, 1000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    paint();
    var switches = document.querySelectorAll('[data-theme-switch]');
    for (var i = 0; i < switches.length; i++) {
      switches[i].addEventListener('click', function () {
        choose(CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length]);
      });
    }
    var picks = document.querySelectorAll('[data-theme-pick]');
    for (var j = 0; j < picks.length; j++) {
      picks[j].addEventListener('click', function (e) {
        choose(e.currentTarget.getAttribute('data-theme-pick'));
      });
    }
    startDemoDeadline();
  });
})();
