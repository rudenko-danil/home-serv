/* Home-Serv generated pages: booking popup with the Zenbooker inline widget.
   Every [data-book] link also has href = Zenbooker booking page, so it still works if this script fails.
   Set site.bookingMode to "link" in src/data.json to skip the popup and open the booking page directly. */
(function () {
  var cfg = window.HS || {};
  var popup = document.getElementById('book-popup');
  if (!popup || cfg.bookingMode === 'link') return;
  var closeBtn = document.getElementById('book-close');
  var fallback = document.getElementById('zen-fallback');
  var wrapper = popup.querySelector('.zen-wrapper');
  var lastFocus = null;

  function widgetReady() {
    var w = popup.querySelector('.zenbooker-inline-widget');
    return !!(w && w.children.length > 0);
  }

  function openPopup(e) {
    e.preventDefault();
    lastFocus = document.activeElement;
    popup.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus();
    // If the widget didn't render (script blocked or offline), show a direct link to the booking page.
    setTimeout(function () {
      var ok = widgetReady();
      wrapper.hidden = !ok;
      fallback.hidden = ok;
    }, 2000);
  }

  function closePopup() {
    popup.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll('[data-book]').forEach(function (el) { el.addEventListener('click', openPopup); });
  closeBtn.addEventListener('click', closePopup);
  popup.addEventListener('click', function (e) { if (e.target === popup) closePopup(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !popup.hidden) closePopup(); });
})();
