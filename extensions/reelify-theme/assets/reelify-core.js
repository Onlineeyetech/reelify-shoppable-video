(() => {
  const roots = document.querySelectorAll('[data-reelify-root]');
  if (!roots.length) return;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const getRootPath = () => {
    const base = window.Shopify?.routes?.root || '/';
    return `${base.replace(/\/$/, '')}/apps/reelify`;
  };

  const getRootUrl = (path = '') => `${window.Shopify?.routes?.root || '/'}${path.replace(/^\//, '')}`;

  const track = (type, detail = {}) => {
    try {
      const payload = JSON.stringify({ type, reelId: detail.reelId || null, playlistId: detail.playlistId || null, sessionKey: sessionStorage.getItem('reelify_session') || crypto.randomUUID?.() || String(Date.now()) });
      sessionStorage.setItem('reelify_session', JSON.parse(payload).sessionKey);
      fetch(getRootPath(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    } catch (_) {}
  };

  const updateCartBubble = (itemCount) => {
    if (typeof itemCount !== 'number') return;
    document.querySelectorAll('.cart-count-bubble .count, [data-cart-count], [data-cart-item-count]').forEach((el) => {
      el.textContent = itemCount;
      el.hidden = itemCount < 1;
    });
    document.querySelectorAll('.cart-count-bubble').forEach((el) => { el.hidden = itemCount < 1; });
  };

  const getCartUI = () => ({
    drawer: document.querySelector('cart-drawer'),
    notification: document.querySelector('cart-notification'),
  });

  const openCartUI = async (cartData) => {
    const { drawer, notification } = getCartUI();
    const component = drawer || notification;

    if (!component) {
      window.location.href = getRootUrl('cart');
      return;
    }

    try {
      let rendered = false;
      const sectionsToRender = typeof component.getSectionsToRender === 'function'
        ? component.getSectionsToRender().map((section) => section.id).filter(Boolean)
        : [];

      if (typeof component.renderContents === 'function' && sectionsToRender.length) {
        let sections = cartData?.sections || null;

        if (!sections) {
          const sectionUrl = `${window.location.pathname}?sections=${encodeURIComponent(sectionsToRender.join(','))}`;
          const sectionResponse = await fetch(sectionUrl, { headers: { Accept: 'application/json' } });
          if (sectionResponse.ok) sections = await sectionResponse.json();
        }

        if (sections) {
          component.renderContents({
            ...cartData,
            item: cartData?.items?.[0] || cartData?.item,
            sections,
          });
          rendered = true;
        }
      }

      if (!rendered && typeof component.open === 'function') component.open();
      else if (typeof component.open === 'function') component.open();
    } catch (error) {
      console.warn('Reelify cart drawer refresh failed:', error);
      if (typeof component.open === 'function') component.open();
    }
  };

  const addToCart = async (variantId, button) => {
    if (!variantId || button.disabled) return;

    const numericId = String(variantId).split('/').pop();
    const original = button.textContent;
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = 'Adding…';

    try {
      const { drawer, notification } = getCartUI();
      const component = drawer || notification;
      const sectionIds = component && typeof component.getSectionsToRender === 'function'
        ? component.getSectionsToRender().map((section) => section.id).filter(Boolean)
        : [];

      const response = await fetch(getRootUrl('cart/add.js'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: Number(numericId), quantity: 1 }],
          ...(sectionIds.length ? { sections: sectionIds.join(',') } : {}),
          sections_url: window.location.pathname,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.description || data?.message || 'Cart request failed');

      updateCartBubble(data.item_count);
      document.dispatchEvent(new CustomEvent('reelify:added-to-cart', { detail: data }));

      button.textContent = 'Added ✓';
      await openCartUI(data);

      setTimeout(() => {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.textContent = original;
      }, 1200);
    } catch (error) {
      console.error('Reelify add to cart error:', error);
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = 'Try again';
      setTimeout(() => { button.textContent = original; }, 1600);
    }
  };

  const formatPrice = (price) => {
    if (!price) return '';
    const numeric = Number(price);
    if (Number.isFinite(numeric)) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency', currency: window.Shopify?.currency?.active || 'USD', maximumFractionDigits: 2,
        }).format(numeric);
      } catch (_) {}
    }
    return String(price);
  };

  const render = (root, payload) => {
    const list = root.querySelector('[data-reelify-list]');
    if (!list) return;

    const reels = payload?.reels || [];
    if (!reels.length) {
      list.innerHTML = '<div class="reelify-empty">No shoppable Reels are live yet.</div>';
      return;
    }

    const autoplay = root.dataset.autoplay === 'true';
    const loop = root.dataset.loop === 'true';
    const showProduct = root.dataset.showProduct !== 'false';
    const showVolume = root.dataset.showVolume !== 'false';
    const showArrows = root.dataset.showArrows !== 'false';
    const playlistId = root.dataset.playlist || '';
    root.classList.remove('reelify-design--classic', 'reelify-design--editorial', 'reelify-design--commerce', 'reelify-design--social');
    const blockDesign = root.dataset.design || 'classic';
    const designKey = blockDesign !== 'classic' ? blockDesign : (payload?.designKey || blockDesign);
    root.classList.add(`reelify-design--${designKey}`);

    list.innerHTML = reels.map((reel, index) => {
      const product = reel.product;
      const poster = reel.thumbnailUrl || '';
      const productUrl = product?.url || '#';
      const price = formatPrice(product?.price);
      return `
        <article class="reelify-card" data-reel-card data-reel-id="${escapeHtml(reel.id)}">
          <video class="reelify-card__video" src="${escapeHtml(reel.videoUrl)}" ${poster ? `poster="${escapeHtml(poster)}"` : ''}
            playsinline muted ${autoplay ? 'autoplay' : ''} ${loop ? 'loop' : ''} preload="auto" data-reel-video></video>
          <div class="reelify-card__shade"></div>
          <button class="reelify-card__play" type="button" data-play aria-label="Play Reel"><span>▶</span></button>
          ${showVolume ? '<button class="reelify-card__mute" type="button" data-mute aria-label="Unmute Reel">🔇</button>' : ''}
          <div class="reelify-card__loading" data-loading><span class="reelify-spinner"></span></div>
          <div class="reelify-card__error" data-video-error hidden>Video unavailable</div>
          <div class="reelify-card__content">
            <div class="reelify-card__meta"><span class="reelify-card__badge">REEL</span><span class="reelify-card__counter">${index + 1}/${reels.length}</span></div>
            <h3 class="reelify-card__title">${escapeHtml(reel.title)}</h3>
            ${showProduct && product ? `<p class="reelify-card__product">${escapeHtml(product.title)}${price ? `<span> · ${escapeHtml(price)}</span>` : ''}</p>` : ''}
            <div class="reelify-card__actions">
              ${product ? `<a class="reelify-card__button reelify-card__button--secondary" data-shop-link href="${escapeHtml(productUrl)}">Shop Now</a>` : ''}
              ${product?.variantId ? `<button class="reelify-card__button" type="button" data-add="${escapeHtml(product.variantId)}">Add to cart</button>` : ''}
            </div>
          </div>
        </article>`;
    }).join('');

    const cards = list.querySelectorAll('[data-reel-card]');
    cards.forEach((card) => track('reel_impression', { reelId: card.dataset.reelId, playlistId }));
    cards.forEach((card) => {
      const video = card.querySelector('[data-reel-video]');
      const playButton = card.querySelector('[data-play]');
      const muteButton = card.querySelector('[data-mute]');
      const loading = card.querySelector('[data-loading]');
      const errorBox = card.querySelector('[data-video-error]');
      if (!video) return;

      const showPlayingState = () => {
        card.classList.add('is-playing', 'is-ready');
        if (loading) loading.hidden = true;
        if (errorBox) errorBox.hidden = true;
      };
      const showPausedState = () => {
        card.classList.remove('is-playing');
        if (playButton) playButton.hidden = false;
      };
      const playVideo = async ({ withSound = false } = {}) => {
        try {
          if (video.readyState === 0) video.load();
          if (withSound) video.muted = false;
          else video.muted = true;
          video.defaultMuted = video.muted;
          await video.play();
          showPlayingState();
          if (playButton) playButton.hidden = true;
          if (muteButton) {
            muteButton.textContent = video.muted ? '🔇' : '🔊';
            muteButton.setAttribute('aria-label', video.muted ? 'Unmute Reel' : 'Mute Reel');
          }
        } catch (error) {
          if (withSound) {
            // A browser can reject audible playback; keep the video playing muted rather than forcing a second Play click.
            video.muted = true;
            try { await video.play(); showPlayingState(); } catch (_) {}
          }
          if (playButton) playButton.hidden = false;
          if (loading) loading.hidden = true;
          console.warn('Reelify playback blocked:', error);
        }
      };

      video.addEventListener('loadstart', () => { if (loading) loading.hidden = false; });
      video.addEventListener('loadedmetadata', () => {
        if (loading) loading.hidden = true;
        card.classList.add('is-ready');
      });
      video.addEventListener('canplay', () => {
        if (loading) loading.hidden = true;
        card.classList.add('is-ready');
        if (autoplay) {
        video.muted = true;
        video.defaultMuted = true;
        playVideo();
      }
      });
      video.addEventListener('playing', () => { showPlayingState(); track('reel_play', { reelId: card.dataset.reelId, playlistId }); });
      video.addEventListener('pause', showPausedState);
      video.addEventListener('stalled', () => {
        if (video.paused && autoplay) playVideo();
      });
      video.addEventListener('error', () => {
        if (loading) loading.hidden = true;
        if (errorBox) errorBox.hidden = false;
        if (playButton) playButton.hidden = true;
        console.error('Reelify video failed to load:', { src: video.currentSrc || video.src, error: video.error, code: video.error?.code, message: video.error?.message });
      });

      playButton?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (video.paused) playVideo(); else video.pause();
      });

      muteButton?.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (video.muted) await playVideo({ withSound: true });
        else { video.muted = true; muteButton.textContent = '🔇'; muteButton.setAttribute('aria-label', 'Unmute Reel'); }
      });

      // Tapping the video always resumes playback. It no longer creates a second tap requirement after unmuting.
      video.addEventListener('click', () => {
        if (video.paused) playVideo({ withSound: !video.muted });
        else video.pause();
      });

      if (autoplay) {
        video.muted = true;
        video.defaultMuted = true;
        playVideo();
      }
    });

    list.querySelectorAll('[data-add]').forEach((button) => {
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); const card = button.closest('[data-reel-card]'); track('add_to_cart', { reelId: card?.dataset.reelId, playlistId }); addToCart(button.dataset.add, button); });
    });

    list.querySelectorAll('[data-shop-link]').forEach((link) => {
      link.addEventListener('click', () => { const card = link.closest('[data-reel-card]'); track('product_click', { reelId: card?.dataset.reelId, playlistId }); });
    });

    if (showArrows) {
      root.querySelector('[data-reel-prev]')?.addEventListener('click', () => scrollList(list, -1));
      root.querySelector('[data-reel-next]')?.addEventListener('click', () => scrollList(list, 1));
    }

    setupDrag(list);

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && autoplay) video.play().catch(() => {});
        else if (!entry.isIntersecting) video.pause();
      }), { threshold: 0.35 });
      list.querySelectorAll('[data-reel-video]').forEach((video) => observer.observe(video));
    }
  };

  const scrollList = (list, direction) => {
    const card = list.querySelector('[data-reel-card]');
    if (!card) return;
    const distance = card.getBoundingClientRect().width + parseFloat(getComputedStyle(list).gap || 16);
    list.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  const setupDrag = (list) => {
    if (list.dataset.dragReady === 'true') return;
    list.dataset.dragReady = 'true';
    let isDown = false, startX = 0, startScroll = 0, moved = false;
    list.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button, a')) return;
      isDown = true; moved = false; startX = event.clientX; startScroll = list.scrollLeft;
      list.classList.add('is-dragging');
      list.setPointerCapture?.(event.pointerId);
    });
    list.addEventListener('pointermove', (event) => {
      if (!isDown) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 5) moved = true;
      list.scrollLeft = startScroll - dx;
    });
    const end = (event) => {
      if (!isDown) return;
      isDown = false; list.classList.remove('is-dragging');
      list.releasePointerCapture?.(event.pointerId);
      if (moved) event.preventDefault();
    };
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
    list.addEventListener('pointerleave', (event) => { if (isDown) end(event); });
  };

  const load = async (root) => {
    const list = root.querySelector('[data-reelify-list]');
    if (!list) return;
    list.innerHTML = '<div class="reelify-empty">Loading Reels…</div>';
    try {
      const limit = root.dataset.limit || '6';
      const playlist = root.dataset.playlist || '';
      const params = new URLSearchParams({ limit });
      if (playlist) params.set('playlist', playlist);
      params.set('_reelify', String(Date.now()));
      const response = await fetch(`${getRootPath()}?${params.toString()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`Reelify request failed: ${response.status}`);
      render(root, await response.json());
    } catch (error) {
      console.error('Reelify storefront error:', error);
      list.innerHTML = '<div class="reelify-empty">Reels are temporarily unavailable.</div>';
    }
  };

  roots.forEach(load);
  document.addEventListener('shopify:section:load', (event) => event.target.querySelectorAll?.('[data-reelify-root]').forEach(load));
})();
