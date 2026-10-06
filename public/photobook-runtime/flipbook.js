/* Adapted from create-photo-flipbook-ui's bundled HTML runtime. No photos leave this frame. */
(() => {
  'use strict';
  const CHANNEL = 'mealog-photobook-v1';
  const bookElement = document.querySelector('#book');
  const previousButton = document.querySelector('#previous');
  const nextButton = document.querySelector('#next');
  const pageStatus = document.querySelector('#page-status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const send = (type, detail = {}) => parent.postMessage({ channel: CHANNEL, type, ...detail }, location.origin);
  let pageFlip;
  let pages = [];
  let currentPage = 0;
  let isTurning = false;
  let turningCover = false;
  let orientation = 'portrait';
  let archivePage = 0;
  let payload;
  let signature = '';
  let labels;
  // PageFlip briefly clones turning leaves; those visual copies must never become extra tab stops.
  const copies = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.matches?.('.book-page') && !pages.includes(node)) {
        node.inert = true;
        node.setAttribute('aria-hidden', 'true');
      }
    }
  });
  copies.observe(bookElement, { childList: true, subtree: true });
  const sizing = new ResizeObserver(() => {
    if (!pageFlip) return;
    // The iframe can resize independently of the window that originally initialized PageFlip.
    bookElement.dataset.resizing = 'true';
    pageFlip.update();
    updateControls();
    requestAnimationFrame(() => { delete bookElement.dataset.resizing; });
  });
  sizing.observe(document.querySelector('.book-rig'));

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeImageURL(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, `${location.origin}/`);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      if (url.protocol === 'blob:' && url.origin === location.origin) return url.href;
      if (/^data:image\/(?:jpeg|png|webp|gif|avif);base64,/i.test(value)) return value;
    } catch { /* Unavailable media gets a quiet placeholder. */ }
    return '';
  }

  function photo(uri, title, fallback) {
    const holder = element('div', 'photo-holder');
    const missing = () => {
      const placeholder = element('div', 'missing-photo');
      placeholder.append(element('span', '', '◌'), element('p', '', labels.noPhoto));
      holder.replaceChildren(placeholder);
    };
    const source = safeImageURL(uri);
    if (!source) { missing(); return holder; }
    const img = element('img');
    img.alt = title;
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('error', () => {
      const replacement = safeImageURL(fallback);
      if (replacement && img.src !== replacement) img.src = replacement;
      else missing();
    });
    img.src = source;
    holder.append(img);
    return holder;
  }

  function button(text, className, onClick) {
    const node = element('button', className, text);
    node.type = 'button';
    // PageFlip only recognizes the direct button target; include clicks on its image/caption.
    ['mousedown', 'touchstart'].forEach(type => node.addEventListener(type, event => event.stopPropagation(), { passive: true }));
    node.addEventListener('click', event => { event.stopPropagation(); onClick(); });
    return node;
  }

  function leaf(className, title, hard = false) {
    const node = element('article', `book-page art-page ${className} ${pages.length % 2 ? 'verso' : 'recto'}`);
    node.setAttribute('aria-label', title);
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    if (hard) node.dataset.density = 'hard';
    pages.push(node);
    return node;
  }

  function folio(page) { page.append(element('p', 'folio', String(pages.length - 1).padStart(2, '0'))); }

  function makePages(data) {
    pages = [];
    const zh = data.locale === 'zh';
    const monthName = zh ? data.theme.zh : data.theme.en;
    const year = data.month.slice(0, 4);
    const issue = data.month.slice(5, 7);
    const title = `${monthName} ${year}`;
    labels = zh ? {
      cover: '封面', back: '封底', shelf: '书架', index: '食物索引', archive: '食物档案',
      hint: '滑动书页 · 或使用方向键', previous: '上一页', next: '下一页', memory: '查看这餐 ↗',
      noPhoto: '这一餐，还没有照片', empty: '这个月的餐桌，等你留下第一段回忆。',
      archiveHint: '点一份食物，回到那一餐。', fullArchive: '打开食物档案 ↗', title: '这个月，吃过的日常。',
      sample: '示例相册', personal: '我的餐桌回忆', kept: `${data.meals.length} 餐记忆`,
    } : {
      cover: 'Front cover', back: 'Back cover', shelf: 'Bookshelf', index: 'Food index', archive: 'Food archive',
      hint: 'Drag a page · or use arrow keys', previous: 'Previous page', next: 'Next page', memory: 'View memory ↗',
      noPhoto: 'A meal without a photograph', empty: 'This month is waiting for its first memory.',
      archiveHint: 'A little index of everything tasted.', fullArchive: 'Open food archive ↗', title: 'A month at the table.',
      sample: 'Sample edition', personal: 'A personal collection', kept: `${data.meals.length} meal ${data.meals.length === 1 ? 'memory' : 'memories'}`,
    };
    document.documentElement.lang = data.locale;
    document.documentElement.style.setProperty('--cloth', data.theme.color);
    document.documentElement.style.setProperty('--cover-ink', data.theme.ink);
    document.querySelector('#book-title').textContent = title;
    document.querySelector('#close span').textContent = labels.shelf;
    document.querySelector('#jump-archive span').textContent = labels.index;
    document.querySelector('#turn-hint').textContent = labels.hint;
    document.querySelector('.stage').setAttribute('aria-label', zh ? '可翻页的美食相册' : 'Interactive food photobook');
    document.querySelector('.controls').setAttribute('aria-label', zh ? '翻页控制' : 'Book controls');
    previousButton.setAttribute('aria-label', labels.previous);
    nextButton.setAttribute('aria-label', labels.next);
    document.title = `Mealog · ${title}`;

    const front = leaf('paper cover', labels.cover, true);
    const plate = element('figure', 'cover-plate');
    plate.append(photo(data.coverUri, zh ? `${monthName}的餐桌` : `${data.theme.en} table illustration`));
    front.append(plate, element('span', 'cover-line'), element('p', 'cover-label', `${data.theme.en} / ${year}`));

    const endpaper = leaf('endpaper', zh ? '扉页' : 'Endpaper');
    endpaper.append(element('p', 'endpaper-mark', `${year} / ${issue}\n${data.scope === 'sample' ? labels.sample : labels.personal}`));
    const titlePage = leaf('paper', labels.title);
    const block = element('div', 'title-block');
    block.append(element('h2', '', monthName), element('p', '', zh ? `${data.theme.en} · ${year}` : year),
      element('div', 'quiet-rule'), element('p', '', labels.title), element('p', '', labels.kept));
    titlePage.append(block);
    folio(titlePage);

    for (const meal of data.meals) {
      const company = meal.companions ?? [];
      const page = leaf(`paper meal-page${meal.note ? ' with-note' : ''}${company.length ? ' with-company' : ''}`, `${meal.date} · ${meal.title}`);
      page.dataset.mealId = meal.id;
      if (company.length) {
        const byline = element('div', 'meal-company');
        byline.append(element('span', 'company-label', zh ? '同桌' : 'With'));
        for (const person of company) {
          const name = person.personId
            ? button(`${person.name} ↗`, 'company-person', () => send('person', { id: person.personId }))
            : element('span', 'company-snapshot', person.name);
          if (person.personId) name.setAttribute('aria-label', zh ? `我和${person.name}的餐桌` : `Our table with ${person.name}`);
          byline.append(name);
        }
        page.append(byline);
      }
      const plate = element('figure', 'meal-photo');
      plate.append(photo(meal.photoUri, meal.title));
      const caption = element('div', 'meal-caption');
      caption.append(element('p', 'date', `${meal.date.replaceAll('-', '.')}  /  ${meal.time}`), element('h2', '', meal.title));
      if (meal.note) caption.append(element('p', 'note', meal.note));
      page.append(plate, caption, button(labels.memory, 'open-memory', () => send('meal', { id: meal.id })));
      folio(page);
    }

    archivePage = pages.length;
    const archiveCount = Math.max(1, Math.ceil(data.meals.length / 6));
    for (let index = 0; index < archiveCount; index++) {
      const page = leaf('paper archive-page', `${labels.archive} ${index + 1}`);
      const heading = element('header', 'archive-heading');
      heading.append(element('span', 'eyebrow', `THE FOOD INDEX / ${String(index + 1).padStart(2, '0')}`),
        element('h2', '', labels.archive), element('p', '', labels.archiveHint));
      page.append(heading);
      const grid = element('div', 'food-grid');
      for (const meal of data.meals.slice(index * 6, (index + 1) * 6)) {
        const item = button('', 'food-item', () => send('meal', { id: meal.id }));
        item.setAttribute('aria-label', `${meal.title} · ${meal.date}`);
        const image = element('div', 'food-image');
        image.append(photo(meal.stickerUri || meal.photoUri, '', meal.photoUri));
        item.append(image, element('span', 'food-name', meal.title), element('span', 'food-date', meal.date.slice(5).replace('-', '.')));
        grid.append(item);
      }
      page.append(grid);
      if (!data.meals.length) page.append(element('p', 'archive-empty', labels.empty));
      page.append(button(labels.fullArchive, 'open-memory', () => send('archive')));
      folio(page);
    }
    // The back cover belongs to the left side of a final spread (an even leaf count).
    if (pages.length % 2 === 0) leaf('endpaper', zh ? '末页' : 'Endpaper');
    const back = leaf('cloth', labels.back, true);
    back.append(element('span', 'cover-line'), element('p', 'back-word', 'mealog'),
      element('p', 'back-mark', `${year} / ${issue} · ${labels.kept}`),
      button(labels.shelf, 'open-memory', () => send('close')));
    return pages;
  }

  function storageKey() { return `@mealog/book-position/${payload.scope}/${payload.month}`; }
  function updateControls() {
    const lastPage = pages.length - 1;
    bookElement.dataset.edge = currentPage === 0 ? 'front' : currentPage === lastPage ? 'back' : 'inside';
    bookElement.dataset.layout = orientation;
    const coverOffset = orientation === 'landscape' && !turningCover && (currentPage === 0 || currentPage === lastPage)
      ? pageFlip.getBoundsRect().pageWidth / 2 * (currentPage === 0 ? -1 : 1) : 0;
    bookElement.style.setProperty('--cover-offset', `${coverOffset}px`);
    previousButton.disabled = currentPage === 0 || isTurning;
    nextButton.disabled = currentPage === lastPage || isTurning;
    document.querySelector('#jump-archive').disabled = isTurning;
    pageStatus.textContent = currentPage === 0 ? labels.cover : currentPage === lastPage ? labels.back
      : `${String(currentPage).padStart(2, '0')} / ${String(lastPage - 1).padStart(2, '0')}`;
    pages.forEach((page, index) => {
      const visible = index === currentPage || (orientation === 'landscape' && currentPage > 0 && index === currentPage + 1);
      page.setAttribute('aria-hidden', visible ? 'false' : 'true');
      page.inert = !visible;
    });
    try { sessionStorage.setItem(storageKey(), JSON.stringify({ page: currentPage, ids: payload.meals.map(meal => meal.id) })); } catch { /* Reading works without storage. */ }
  }

  function restoredPage() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey()) || 'null');
      if (saved && JSON.stringify(saved.ids) === JSON.stringify(payload.meals.map(meal => meal.id))
        && Number.isInteger(saved.page) && saved.page >= 0 && saved.page < pages.length) return saved.page;
    } catch { /* Private browsing or stale state starts at the cover. */ }
    return 0;
  }

  function render(data) {
    const nextSignature = JSON.stringify(data);
    if (signature === nextSignature) { send('initialized'); return; }
    payload = data;
    const newPages = makePages(data);
    const startPage = restoredPage();
    signature = nextSignature;
    if (pageFlip) {
      pageFlip.turnToPage(0);
      pageFlip.updateFromHtml(newPages);
      pageFlip.turnToPage(startPage);
      updateControls();
      send('initialized');
      return;
    }
    if (!window.St?.PageFlip) throw new Error('The page-turn engine is unavailable.');
    bookElement.replaceChildren(...newPages);
    const pageWidth = Number(bookElement.dataset.pageWidth);
    const pageHeight = Number(bookElement.dataset.pageHeight);
    document.documentElement.style.setProperty('--page-ratio', pageWidth / pageHeight);
    const minWidth = Math.min(240, Math.max(120, (innerHeight - 158) * .75 * .7));
    pageFlip = new St.PageFlip(bookElement, {
      width: pageWidth, height: pageHeight, size: 'stretch',
      minWidth, maxWidth: pageWidth, minHeight: minWidth / .75, maxHeight: pageHeight,
      drawShadow: true, flippingTime: reducedMotion.matches ? 1 : 760, usePortrait: true,
      startZIndex: 10, autoSize: false, maxShadowOpacity: .32, showCover: true,
      mobileScrollSupport: false, clickEventForward: true, useMouseEvents: true,
      swipeDistance: 24, showPageCorners: !reducedMotion.matches, disableFlipByClick: false,
    });
    pageFlip.on('flip', event => { currentPage = Number(event.data); updateControls(); });
    pageFlip.on('changeState', event => {
      isTurning = event.data !== 'read';
      turningCover = event.data === 'flipping' || event.data === 'user_fold';
      updateControls();
    });
    pageFlip.on('changeOrientation', event => { orientation = event.data; updateControls(); });
    pageFlip.on('init', event => {
      orientation = event.data.mode;
      pageFlip.turnToPage(startPage);
      updateControls();
      send('initialized');
    });
    pageFlip.loadFromHTML(pages);
    updateControls();
  }

  function turn(direction) {
    if (!pageFlip || isTurning || (direction < 0 ? currentPage === 0 : currentPage === pages.length - 1)) return;
    if (reducedMotion.matches) direction < 0 ? pageFlip.turnToPrevPage() : pageFlip.turnToNextPage();
    else direction < 0 ? pageFlip.flipPrev('bottom') : pageFlip.flipNext('bottom');
  }
  previousButton.addEventListener('click', () => turn(-1));
  nextButton.addEventListener('click', () => turn(1));
  document.querySelector('#close').addEventListener('click', () => send('close'));
  document.querySelector('#jump-archive').addEventListener('click', () => {
    if (pageFlip && !isTurning) { pageFlip.turnToPage(archivePage); updateControls(); }
  });
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !pageFlip || isTurning) return;
    if (event.key === 'Escape') { send('close'); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (event.key === ' ' && event.target.closest('button, a')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
    if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); turn(1); }
    if (event.key === 'Home') { event.preventDefault(); pageFlip.turnToPage(0); }
    if (event.key === 'End') { event.preventDefault(); pageFlip.turnToPage(pages.length - 1); }
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== CHANNEL) return;
    if (event.data.type === 'hello') { send('ready'); return; }
    if (event.data.type !== 'init') return;
    const data = event.data;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month) || !['zh', 'en'].includes(data.locale)
      || !['personal', 'sample'].includes(data.scope) || !Array.isArray(data.meals)
      || (data.coverUri !== undefined && typeof data.coverUri !== 'string')
      || !data.theme || !['color', 'ink'].every(key => /^#[0-9a-f]{6}$/i.test(data.theme[key]))
      || !['en', 'zh'].every(key => typeof data.theme[key] === 'string')
      || !data.meals.every(meal => meal && ['id', 'date', 'time', 'title'].every(key => typeof meal[key] === 'string')
        && (meal.note === undefined || typeof meal.note === 'string')
        && (meal.companions === undefined || (Array.isArray(meal.companions) && meal.companions.every(person => person
          && typeof person.name === 'string' && (person.personId === undefined || (typeof person.personId === 'string' && person.personId.length > 0))))))) { send('error'); return; }
    try { render(data); }
    catch {
      const error = document.querySelector('#book-error');
      error.textContent = data.locale === 'zh' ? '相册暂时无法打开，请返回书架重试。' : 'The book could not open. Return to the bookshelf and try again.';
      error.hidden = false;
      send('error');
    }
  });
  window.addEventListener('pagehide', () => { copies.disconnect(); sizing.disconnect(); if (pageFlip) pageFlip.destroy(); });
  send('ready');
})();
