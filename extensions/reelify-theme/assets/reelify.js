(() => {
  const roots = document.querySelectorAll('[data-reelify-root]');
  if (!roots.length || window.__reelifyCoreLoading) return;
  window.__reelifyCoreLoading = true;
  const src = roots[0].getAttribute('data-reelify-core');
  if (!src) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = () => { window.__reelifyCoreLoaded = true; };
  script.onerror = () => { window.__reelifyCoreLoading = false; console.error('Reelify failed to load storefront core.'); };
  document.head.appendChild(script);
})();
