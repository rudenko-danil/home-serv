/* Home-Serv landing pages: booking popup (Zenbooker inline widget) + phone-click conversion. */
(function () {
  var cfg = window.HS || {};
  var popup = document.getElementById('book-popup');
  var closeBtn = document.getElementById('book-close');
  var fallback = document.getElementById('zen-fallback');
  var wrapper = popup ? popup.querySelector('.zen-wrapper') : null;
  var lastFocus = null;

  function widgetReady() {
    var w = popup && popup.querySelector('.zenbooker-inline-widget');
    return !!(w && w.children.length > 0);
  }

  function openPopup(e) {
    if (!popup) return; // no popup: the link itself opens Zenbooker
    e.preventDefault();
    lastFocus = document.activeElement;
    popup.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus();
    // If the widget script didn't render (blocked, offline), show a direct link to the booking page.
    setTimeout(function () {
      var ok = widgetReady();
      if (wrapper) wrapper.hidden = !ok;
      if (fallback) fallback.hidden = ok;
    }, 2000);
  }

  function closePopup() {
    popup.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll('[data-book]').forEach(function (el) {
    el.addEventListener('click', openPopup);
  });
  if (popup) {
    closeBtn.addEventListener('click', closePopup);
    popup.addEventListener('click', function (e) { if (e.target === popup) closePopup(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !popup.hidden) closePopup(); });
  }

  // Phone clicks -> secondary Google Ads conversion (only when IDs are configured).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!a || typeof window.gtag !== 'function' || !cfg.gtagId || !cfg.phoneLabel) return;
    window.gtag('event', 'conversion', { send_to: cfg.gtagId + '/' + cfg.phoneLabel });
  });
})();
