// RIDDIM.LOVE analytics: Google Tag Manager with Consent Mode v2.
// Loaded as a normal file (the site's CSP allows no inline scripts).
//
// - EU/EEA, UK and Switzerland: analytics cookies stay off until the visitor
//   accepts in the small banner (the Worker marks these visitors with
//   <html data-consent="required">; Google's own region rules back this up).
// - Everywhere else: analytics on by default.
// - Ads storage / personalisation: always denied (the site runs no ads).
(function () {
  'use strict';
  var GTM_ID = 'GTM-KCMD2C2M';
  var KEY = 'riddim.love:consent';
  var REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  var noAds = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  function extend(a, b) {
    for (var k in b) a[k] = b[k];
    return a;
  }
  gtag('consent', 'default', extend({ analytics_storage: 'denied', region: REGIONS, wait_for_update: 500 }, noAds));
  gtag('consent', 'default', extend({ analytics_storage: 'granted' }, noAds));

  var stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {
    /* storage unavailable */
  }
  if (stored === 'granted' || stored === 'denied') gtag('consent', 'update', { analytics_storage: stored });

  gtag('js', new Date());
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
  document.head.appendChild(s);

  function choose(value, bar) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* ignore */
    }
    gtag('consent', 'update', { analytics_storage: value });
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function banner() {
    if (document.documentElement.getAttribute('data-consent') !== 'required') return;
    if (stored === 'granted' || stored === 'denied') return;
    var bar = document.createElement('div');
    bar.className = 'consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie consent');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('We use Google Analytics cookies to see how RIDDIM.LOVE is used. '));
    var a = document.createElement('a');
    a.href = '/privacy';
    a.textContent = 'Privacy';
    p.appendChild(a);
    var actions = document.createElement('div');
    actions.className = 'consent-actions';
    var no = document.createElement('button');
    no.type = 'button';
    no.textContent = 'Decline';
    no.addEventListener('click', function () {
      choose('denied', bar);
    });
    var yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'consent-accept';
    yes.textContent = 'Accept';
    yes.addEventListener('click', function () {
      choose('granted', bar);
    });
    actions.appendChild(no);
    actions.appendChild(yes);
    bar.appendChild(p);
    bar.appendChild(actions);
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
  else banner();

  /** In-app page changes (the app updates the URL without reloading). */
  window.rlPageView = function () {
    window.dataLayer.push({ event: 'rl_page_view', page_location: location.href, page_path: location.pathname + location.search, page_title: document.title });
  };
})();
