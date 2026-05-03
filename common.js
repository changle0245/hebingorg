/* hebing.org — shared bootstrap script
 *
 * Loaded SYNCHRONOUSLY in <head> BEFORE any AdSense / GA tag, because GA Consent Mode default
 * MUST be set before gtag/js loads. Keep this file small.
 *
 * Responsibilities:
 *   1. Initialize window.dataLayer + gtag() helper
 *   2. Set GA + AdSense Consent Mode v2 default to "denied"
 *      (and apply persisted user choice if present, before GA fires)
 *   3. Render a cookie consent banner on first visit; persist choice in localStorage
 *   4. Expose window.openCookiePrefs() so footers / privacy page can re-open the banner
 *
 * Lang/theme/dark-mode handling stays per-page for now to avoid cascade conflicts.
 */
(function(){
  'use strict';

  // ---- gtag bootstrap ---------------------------------------------------------------------------
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // ---- Consent state ----------------------------------------------------------------------------
  var STORAGE_KEY = 'hebing.consent.v1';
  var DENIED = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  };
  var GRANTED = {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
    functionality_storage: 'granted',
    security_storage: 'granted'
  };
  var ANALYTICS_ONLY = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
    functionality_storage: 'granted',
    security_storage: 'granted'
  };

  function readChoice(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch(_) { return null; }
  }
  function writeChoice(choice){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch(_){}
  }

  // Always set defaults FIRST. If user has a saved preference, immediately update.
  gtag('consent', 'default', DENIED);
  // Default URL passthrough so GA can still measure without cookies (Consent Mode behavior).
  gtag('set', 'url_passthrough', true);
  gtag('set', 'ads_data_redaction', true);

  var saved = readChoice();
  if(saved && saved.state){
    if(saved.state === 'all')          gtag('consent', 'update', GRANTED);
    else if(saved.state === 'analytics') gtag('consent', 'update', ANALYTICS_ONLY);
    // 'reject' => leave defaults (denied)
  }

  // ---- i18n strings -----------------------------------------------------------------------------
  var I18N = {
    zh: {
      title: 'Cookie 与统计偏好',
      body: '我们使用 Google Analytics 做匿名访问统计，使用 Google AdSense 投放广告以维持网站免费运行。这两项可能会读写 Cookie。你处理的文件本身不会上传——仅访问行为会被统计。',
      readMore: '查看隐私政策',
      btnAll: '全部接受',
      btnAnalytics: '仅接受统计',
      btnReject: '全部拒绝'
    },
    en: {
      title: 'Cookies & analytics',
      body: 'We use Google Analytics for anonymous traffic stats and Google AdSense to keep the site free. Both may read/write cookies. The files you process never leave your device — only page-view metadata is collected.',
      readMore: 'Privacy policy',
      btnAll: 'Accept all',
      btnAnalytics: 'Analytics only',
      btnReject: 'Reject all'
    },
    ar: {
      title: 'تفضيلات ملفات تعريف الارتباط',
      body: 'نستخدم Google Analytics للإحصاءات المجهولة، و Google AdSense لإبقاء الموقع مجانيًا. قد يستخدمان ملفات تعريف الارتباط. الملفات التي تعالجها لا تغادر جهازك أبدًا.',
      readMore: 'سياسة الخصوصية',
      btnAll: 'قبول الكل',
      btnAnalytics: 'الإحصاءات فقط',
      btnReject: 'رفض الكل'
    }
  };
  function detectLang(){
    var html = document.documentElement;
    var l = (html.getAttribute('lang') || '').toLowerCase();
    if(l.indexOf('ar') === 0) return 'ar';
    if(l.indexOf('en') === 0) return 'en';
    return 'zh';
  }

  // ---- Banner UI --------------------------------------------------------------------------------
  function buildBanner(){
    var lang = detectLang();
    var t = I18N[lang] || I18N.zh;
    var wrap = document.createElement('div');
    wrap.className = 'hebing-cookie-banner';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-label', t.title);
    if(lang === 'ar') wrap.setAttribute('dir', 'rtl');

    // Build via DOM (no innerHTML with user data) — keeps it CSP-friendly
    var inner = document.createElement('div');
    inner.className = 'hebing-cookie-inner';

    var heading = document.createElement('strong');
    heading.className = 'hebing-cookie-title';
    heading.textContent = t.title;

    var body = document.createElement('p');
    body.className = 'hebing-cookie-body';
    body.textContent = t.body + ' ';
    var link = document.createElement('a');
    link.href = '/privacy.html';
    link.textContent = t.readMore;
    link.className = 'hebing-cookie-link';
    body.appendChild(link);

    var btnRow = document.createElement('div');
    btnRow.className = 'hebing-cookie-btns';

    function makeBtn(label, kind, choice){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hebing-cookie-btn hebing-cookie-btn-' + kind;
      b.textContent = label;
      b.addEventListener('click', function(){ commit(choice); });
      return b;
    }
    btnRow.appendChild(makeBtn(t.btnReject,    'reject',    'reject'));
    btnRow.appendChild(makeBtn(t.btnAnalytics, 'analytics', 'analytics'));
    btnRow.appendChild(makeBtn(t.btnAll,       'all',       'all'));

    inner.appendChild(heading);
    inner.appendChild(body);
    inner.appendChild(btnRow);
    wrap.appendChild(inner);
    return wrap;
  }

  function commit(state){
    writeChoice({ state: state, ts: Date.now() });
    if(state === 'all')           gtag('consent', 'update', GRANTED);
    else if(state === 'analytics') gtag('consent', 'update', ANALYTICS_ONLY);
    else                           gtag('consent', 'update', DENIED);
    var el = document.querySelector('.hebing-cookie-banner');
    if(el && el.parentNode) el.parentNode.removeChild(el);
  }

  function show(){
    if(document.querySelector('.hebing-cookie-banner')) return;
    var banner = buildBanner();
    (document.body || document.documentElement).appendChild(banner);
  }

  function maybeShow(){
    if(readChoice()) return;
    if(document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }

  window.openCookiePrefs = function(){
    // Force re-show, even if a choice was saved
    var existing = document.querySelector('.hebing-cookie-banner');
    if(existing && existing.parentNode) existing.parentNode.removeChild(existing);
    if(document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  };

  maybeShow();
})();
