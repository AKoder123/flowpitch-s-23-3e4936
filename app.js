'use strict';
(function(){
  const state = {
    slidesData: null,
    currentIndex: 0,
    dots: [],
    io: null,
    isNavigating: false,
    wheelBlockUntil: 0
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function setCSSVar(name, val){
    document.documentElement.style.setProperty(name, val);
  }

  function computeTopOffset(){
    const nav = $('#topNav');
    const h = nav ? nav.getBoundingClientRect().height : 0;
    const safeTop = 0; // env(safe-area-inset-top) handled in CSS padding
    setCSSVar('--topOffset', Math.round(h + safeTop) + 'px');
  }

  function setCompactMode(){
    const compact = window.innerHeight < 680;
    document.body.classList.toggle('compact', compact);
  }

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function createEl(tag, cls, html){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function applyStagger(container){
    const nodes = container.querySelectorAll('[data-animate]');
    nodes.forEach((n,i)=>{
      n.style.setProperty('--i', i);
    });
  }

  function headlineWithOptionalGradSpan(txt, enable){
    if (!enable) return txt;
    const parts = (txt||'').trim().split(/\s+/);
    if (parts.length <= 1) return txt;
    const take = Math.min(2, parts.length);
    const lead = parts.slice(0, take).join(' ');
    const rest = parts.slice(take).join(' ');
    return '<span class="grad">' + lead + '</span>' + (rest ? ' ' + rest : '');
  }

  function renderSlides(data){
    const slidesWrap = $('#slides');
    if (!slidesWrap) return;
    slidesWrap.innerHTML = '';

    data.slides.forEach((s, idx)=>{
      const section = createEl('section', 'slide slide-' + (s.type||'content'));
      section.id = 'slide-' + idx;
      section.setAttribute('role','group');
      section.setAttribute('aria-roledescription','slide');

      const inner = createEl('div','slideInner card');
      const content = createEl('div','contentWrap');

      // Headline
      const isTitle = s.type === 'title';
      const isSection = s.type === 'section';
      const isClosing = s.type === 'closing';

      if (isTitle){
        const h = createEl('h1','hTitle grad', s.headline ? escapeHtml(s.headline) : '');
        h.setAttribute('data-animate','');
        content.appendChild(h);
        if (s.subheadline){
          const sub = createEl('p','subTitle', escapeHtml(s.subheadline));
          sub.setAttribute('data-animate','');
          content.appendChild(sub);
        }
      } else if (isSection){
        const h = createEl('h2','hSection grad', s.headline ? escapeHtml(s.headline) : '');
        h.setAttribute('data-animate','');
        content.appendChild(h);
        if (s.subheadline){
          const sub = createEl('p','subTitle', escapeHtml(s.subheadline));
          sub.setAttribute('data-animate','');
          content.appendChild(sub);
        }
      } else if (isClosing){
        const h = createEl('h2','hClosing', headlineWithOptionalGradSpan(escapeHtml(s.headline), true));
        h.setAttribute('data-animate','');
        content.appendChild(h);
        if (s.subheadline){
          const sub = createEl('p','subTitle', escapeHtml(s.subheadline));
          sub.setAttribute('data-animate','');
          content.appendChild(sub);
        }
      } else {
        const h = createEl('h2','hContent', headlineWithOptionalGradSpan(escapeHtml(s.headline||''), true));
        h.setAttribute('data-animate','');
        content.appendChild(h);
      }

      // Columns wrapper for content body
      const cols = createEl('div','columns');

      // Left/main column
      const leftCol = createEl('div','col left');
      if (Array.isArray(s.bullets) && s.bullets.length){
        const ul = createEl('ul','bullets');
        s.bullets.forEach(b=>{
          const li = createEl('li',null, escapeHtml(b));
          li.setAttribute('data-animate','');
          ul.appendChild(li);
        });
        leftCol.appendChild(ul);
      }
      cols.appendChild(leftCol);

      // Optional right column
      if (s.right && (Array.isArray(s.right.bullets) && s.right.bullets.length)){
        const rightCol = createEl('div','col right');
        const card = createEl('div','sideCard');
        if (s.right.title){
          const rt = createEl('div','sideTitle grad', escapeHtml(s.right.title));
          rt.setAttribute('data-animate','');
          card.appendChild(rt);
        }
        const ulr = createEl('ul','bullets alt');
        s.right.bullets.forEach(b=>{
          const li = createEl('li',null, escapeHtml(b));
          li.setAttribute('data-animate','');
          ulr.appendChild(li);
        });
        card.appendChild(ulr);
        rightCol.appendChild(card);
        cols.appendChild(rightCol);
      }

      // Optional left column title support (schema provides left.
      if (s.left && (Array.isArray(s.left.bullets) && s.left.bullets.length)){
        // If left provided, prefer that as the main list instead of s.bullets
        leftCol.innerHTML = '';
        if (s.left.title){
          const lt = createEl('div','sideTitle grad', escapeHtml(s.left.title));
          lt.setAttribute('data-animate','');
          leftCol.appendChild(lt);
        }
        const ull = createEl('ul','bullets');
        s.left.bullets.forEach(b=>{
          const li = createEl('li',null, escapeHtml(b));
          li.setAttribute('data-animate','');
          ull.appendChild(li);
        });
        leftCol.appendChild(ull);
      }

      content.appendChild(cols);

      // Notes (hidden, could be used later)
      if (s.note){
        const note = createEl('aside','note sr-only', escapeHtml(s.note));
        content.appendChild(note);
      }

      inner.appendChild(content);
      section.appendChild(inner);

      // mark animatable children for stagger
      applyStagger(section);

      slidesWrap.appendChild(section);
    });
  }

  function escapeHtml(str){
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/\"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function buildDots(){
    const dotsWrap = $('#sideDots');
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    state.dots = [];
    const total = state.slidesData.slides.length;
    for (let i=0;i<total;i++){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dotBtn';
      btn.setAttribute('aria-label','Go to slide ' + (i+1));
      btn.addEventListener('click', ()=> goToSlide(i,true));
      dotsWrap.appendChild(btn);
      state.dots.push(btn);
    }
  }

  function updateProgressUI(){
    const total = state.slidesData ? state.slidesData.slides.length : 0;
    const idx = state.currentIndex;
    const pct = total > 1 ? (idx/(total-1))*100 : 0;
    const bar = $('#topProgressBar');
    if (bar) bar.style.width = pct + '%';
    state.dots.forEach((b,i)=>{
      if (!b) return;
      const active = i === idx;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current','true'); else b.removeAttribute('aria-current');
    });
  }

  function getSlides(){ return $$('#slides .slide'); }

  function applyActiveSlide(idx){
    const slides = getSlides();
    slides.forEach((s,i)=>{
      s.classList.toggle('is-active', i===idx);
      // reset text scale to 1 before fitting
      s.style.setProperty('--textScale','1');
    });
    fitTypographyForSlide(slides[idx]);
  }

  function goToSlide(idx, smooth){
    const slides = getSlides();
    if (!slides.length) return;
    idx = clamp(idx, 0, slides.length-1);
    const deck = $('#deck');
    const target = slides[idx];
    if (deck && target){
      state.isNavigating = true;
      deck.scrollTo({ top: target.offsetTop, behavior: smooth ? 'smooth' : 'auto' });
      // In case IO doesn't fire (fast jump), set after a tick
      setTimeout(()=>{
        state.currentIndex = idx;
        applyActiveSlide(idx);
        updateProgressUI();
        state.isNavigating = false;
      }, smooth ? 260 : 0);
    }
  }

  function nextSlide(){ goToSlide(state.currentIndex + 1, true); }
  function prevSlide(){ goToSlide(state.currentIndex - 1, true); }

  function setupKeyboard(){
    window.addEventListener('keydown', (e)=>{
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
      if (typing) return;
      if (e.code === 'Space'){ e.preventDefault(); if (e.shiftKey) prevSlide(); else nextSlide(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'ArrowDown'){ e.preventDefault(); nextSlide(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp'){ e.preventDefault(); prevSlide(); }
      else if (e.key === 'Home'){ e.preventDefault(); goToSlide(0,true); }
      else if (e.key === 'End'){ e.preventDefault(); goToSlide(getSlides().length-1,true); }
    });
  }

  function isScrollable(el){
    if (!el || el === document.body) return false;
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    const can = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight;
    return can;
  }

  function canScrollInDirection(el, deltaY){
    let node = el;
    while (node && node !== document.body){
      if (isScrollable(node)){
        if (deltaY > 0 && (node.scrollTop + node.clientHeight) < node.scrollHeight - 1) return true;
        if (deltaY < 0 && node.scrollTop > 0) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function setupWheel(){
    const deck = $('#deck');
    if (!deck) return;
    deck.addEventListener('wheel', (e)=>{
      const now = Date.now();
      const cooldown = 500;
      if (now < state.wheelBlockUntil) return; // do nothing, passive
      if (canScrollInDirection(e.target, e.deltaY)) return; // allow inner scroll
      e.preventDefault();
      if (e.deltaY > 10){
        state.wheelBlockUntil = now + cooldown;
        nextSlide();
      } else if (e.deltaY < -10){
        state.wheelBlockUntil = now + cooldown;
        prevSlide();
      }
    }, { passive: false });
  }

  function setupObserver(){
    const deck = $('#deck');
    if (!deck) return;
    const slides = getSlides();
    if (state.io) state.io.disconnect();
    state.io = new IntersectionObserver((entries)=>{
      // pick the most visible entry
      const visible = entries
        .filter(en=>en.isIntersecting)
        .sort((a,b)=> b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const idx = slides.indexOf(visible.target);
      if (idx >= 0 && idx !== state.currentIndex && !state.isNavigating){
        state.currentIndex = idx;
        applyActiveSlide(idx);
        updateProgressUI();
      }
    }, { root: deck, threshold: [0.55, 0.66, 0.8] });

    slides.forEach(s=> state.io.observe(s));
  }

  function fitTypography(){
    const active = getSlides()[state.currentIndex];
    if (active) fitTypographyForSlide(active);
  }

  function fitTypographyForSlide(slide){
    if (!slide) return;
    const wrap = slide.querySelector('.contentWrap');
    if (!wrap) return;
    // Base
    let scale = 1.0;
    const min = 0.85, max = 1.08;

    // First try to downscale if overflowing
    wrap.style.setProperty('--textScale', scale);
    const box = wrap.getBoundingClientRect();
    const scroller = slide.querySelector('.slideInner');
    const avail = scroller ? scroller.clientHeight - parseInt(getComputedStyle(scroller).paddingTop) - parseInt(getComputedStyle(scroller).paddingBottom) : slide.clientHeight;

    // Tighten spacing if still large
    slide.classList.remove('tight');

    // Iteratively adjust
    let i = 0;
    while (i < 20){
      const need = wrap.scrollHeight;
      if (need > avail && scale > min){
        scale -= 0.02;
        wrap.style.setProperty('--textScale', scale.toFixed(3));
      } else if (need < avail * 0.82 && scale < max){
        scale += 0.02;
        wrap.style.setProperty('--textScale', scale.toFixed(3));
      } else {
        break;
      }
      i++;
    }

    // If still overflowing at minimum, tighten layout a bit
    if (wrap.scrollHeight > avail && scale <= min + 0.0001){
      slide.classList.add('tight');
    }
  }

  function updateBrand(data){
    const el = $('#brandTitle');
    if (el && data && data.meta && data.meta.title){
      el.textContent = data.meta.title;
    }
  }

  function setupNavButtons(){
    const prev = $('#prevBtn');
    const next = $('#nextBtn');
    prev && prev.addEventListener('click', prevSlide);
    next && next.addEventListener('click', nextSlide);
  }

  async function loadLib(url){
    return new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      s.src = url; s.async = true; s.onload = ()=> resolve(); s.onerror = ()=> reject(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
  }

  function cloneBgLayers(into){
    const layers = $$('.bgLayer');
    layers.forEach(l=> into.appendChild(l.cloneNode(true)) );
  }

  function ensurePdfStage(){
    let stage = document.getElementById('pdfStage');
    if (!stage){
      stage = document.createElement('div');
      stage.id = 'pdfStage';
      document.body.appendChild(stage);
    }
    return stage;
  }

  function hideExportArtifacts(hide){
    document.body.classList.toggle('exportingPdf', !!hide);
  }

  function setupPdfExport(){
    const btn = document.getElementById('exportPdfBtn');
    if (!btn) return;
    btn.addEventListener('click', async ()=>{
      try{
        btn.disabled = true; const prevLabel = btn.textContent; btn.textContent = 'Exporting…';
        hideExportArtifacts(true);

        // Load libs on-demand
        await loadLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const { jsPDF } = window.jspdf || window.jspdfUmd || window.jspdf_umd || {};
        if (!window.html2canvas || !jsPDF){
          throw new Error('Libraries not available');
        }

        const slides = getSlides();
        const pdf = new jsPDF({ orientation:'landscape', unit:'px', format:[1920,1080] });
        const scale = Math.max(window.devicePixelRatio || 1, 2);

        for (let i=0;i<slides.length;i++){
          const stage = ensurePdfStage();
          stage.innerHTML = '';
          cloneBgLayers(stage);

          const clone = slides[i].cloneNode(true);
          clone.classList.add('is-active');
          stage.appendChild(clone);

          const canvas = await window.html2canvas(stage, {
            backgroundColor: '#050611',
            scale: scale,
            useCORS: true,
            allowTaint: true
          });
          const data = canvas.toDataURL('image/png');
          if (i>0) pdf.addPage([1920,1080], 'landscape');
          pdf.addImage(data, 'PNG', 0, 0, 1920, 1080);
        }

        pdf.save('FlowPitch.pdf');
        hideExportArtifacts(false);
        btn.disabled = false; btn.textContent = prevLabel;
      } catch (err){
        console.error(err);
        hideExportArtifacts(false);
        alert('Export failed. Please allow cdnjs.cloudflare.com or self-host html2canvas and jsPDF.');
        const btn = document.getElementById('exportPdfBtn');
        if (btn){ btn.disabled = false; btn.textContent = 'Export PDF'; }
      }
    });
  }

  function onResize(){
    computeTopOffset();
    setCompactMode();
    fitTypography();
  }

  async function init(){
    computeTopOffset();
    setCompactMode();

    try{
      const res = await fetch('./content.json?ts=' + Date.now(), { cache:'no-store' });
      const data = await res.json();
      state.slidesData = data;
      updateBrand(data);
      renderSlides(data);
      buildDots();
      setupObserver();
      setupKeyboard();
      setupWheel();
      setupNavButtons();
      setupPdfExport();

      // Initial activation and fit
      requestAnimationFrame(()=>{
        applyActiveSlide(0);
        updateProgressUI();
        const deck = $('#deck');
        if (deck) deck.scrollTo({ top: 0, behavior: 'auto' });
      });

      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
    } catch (e){
      console.error('Failed to load content.json', e);
    }
  }

  // Kick off
  document.addEventListener('DOMContentLoaded', init);
})();
