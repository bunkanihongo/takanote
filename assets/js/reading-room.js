/* ==========================================================================
   takanote 読解ルーム — v3（改良版）
   Interactive Japanese reading room with audio, translation, and grammar
   ========================================================================== */
(function () {
  'use strict';

  // ---- 状態 ----
  let currentData = null;
  let currentAudio = null;
  let currentParaIdx = -1;
  let isPlaying = false;
  let audioQueue = [];
  let isAutoMode = false;

  // ---- DOM 参照 ----
  let container, progressBar;

  // ======================================================================
  //  初期化
  // ======================================================================
  document.addEventListener('DOMContentLoaded', () => {
    container = document.getElementById('reading-room-container');
    if (!container) return;

    // CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/takanote/assets/css/reading-room.css?v4';
    document.head.appendChild(link);

    // プログレスバー
    progressBar = document.createElement('div');
    progressBar.className = 'rr-progress-bar';
    document.body.appendChild(progressBar);

    // スクロール進捗
    window.addEventListener('scroll', updateProgress, { passive: true });

    // ルート
    const params = new URLSearchParams(window.location.search);
    const readingId = params.get('read');
    if (readingId) {
      loadReading(readingId);
    } else {
      renderList();
    }
  });

  // ======================================================================
  //  プログレスバー
  // ======================================================================
  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(scrollTop / docHeight * 100, 100) : 0;
    if (progressBar) progressBar.style.width = pct + '%';
  }

  // ======================================================================
  //  読解リスト
  // ======================================================================
  const READING_LIST = [
    {
      id: 'nihon-no-poster',
      title: '日本のポスターはなぜ情報量が多いのか',
      kicker: '中級〜上級',
      desc: '文化と流通の構造を読み解く',
      badge: '8段落',
      file: '/takanote/assets/readings/nihon-no-poster.json'
    }
  ];

  function renderList() {
    container.innerHTML = '';
    document.title = '読解ルーム | たかのーと';

    const h = document.createElement('div');
    h.className = 'rr-header';
    h.innerHTML = `
      <div class="rr-kicker">READING ROOM</div>
      <h2>読解ルーム</h2>
      <p class="rr-subtitle">短い文章で日本語を深く読む。逐語訳・文法解説・音声練習付き。</p>
    `;
    container.appendChild(h);

    const list = document.createElement('div');
    list.className = 'reading-list';

    READING_LIST.forEach(r => {
      const card = document.createElement('div');
      card.className = 'reading-card';
      card.innerHTML = `
        <span class="card-kicker">${escHtml(r.kicker)}</span>
        <h3>${escHtml(r.title)}</h3>
        <span class="card-badge">${escHtml(r.badge)}</span>
      `;
      card.addEventListener('click', () => {
        loadReading(r.id);
        history.pushState({}, '', `?read=${r.id}`);
      });
      list.appendChild(card);
    });

    container.appendChild(list);
  }

  // ======================================================================
  //  読解ロード
  // ======================================================================
  function loadReading(id) {
    const reading = READING_LIST.find(r => r.id === id);
    if (!reading) { renderList(); return; }

    container.innerHTML = '<div class="rr-loading">読み込み中…</div>';

    fetch(reading.file)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const doc = Array.isArray(data) ? data[0] : data;
        renderReader(doc);
      })
      .catch(err => {
        container.innerHTML = `<div class="rr-error">❌ 読み込みエラー: ${escHtml(err.message)}</div>`;
      });
  }

  // ======================================================================
  //  読解表示
  // ======================================================================
  function renderReader(data) {
    currentData = data;
    currentParaIdx = -1;
    currentAudio = null;
    isPlaying = false;
    audioQueue = [];
    isAutoMode = false;

    container.innerHTML = '';

    // タイトル
    document.title = `${escHtml(data.title)} | 読解ルーム | たかのーと`;

    const wrapper = document.createElement('div');
    wrapper.className = 'rr-reader';

    // 戻る
    const backWrap = document.createElement('div');
    backWrap.className = 'rr-back-wrap';

    const backBtn = document.createElement('button');
    backBtn.className = 'rr-back-btn';
    backBtn.innerHTML = '← 一覧へ戻る';
    backBtn.addEventListener('click', () => {
      stopAudio();
      renderList();
      history.pushState({}, '', window.location.pathname);
    });
    backWrap.appendChild(backBtn);

    // 残段落表示
    const paraCount = document.createElement('span');
    paraCount.className = 'rr-para-count';
    paraCount.textContent = `${data.paragraphs.length}段落`;
    backWrap.appendChild(paraCount);

    wrapper.appendChild(backWrap);

    // タイトル
    const hdr = document.createElement('div');
    hdr.className = 'rr-reader-header';
    hdr.innerHTML = `<h1 class="rr-reader-title">${escHtml(data.title)}</h1>`;
    wrapper.appendChild(hdr);

    // ツールバー
    wrapper.appendChild(buildToolbar());

    // 凡例
    wrapper.appendChild(buildLegend());

    // 本文
    const article = document.createElement('div');
    article.className = 'rr-article';
    article.id = 'rr-article';

    data.paragraphs.forEach((para, idx) => {
      article.appendChild(buildParagraph(para, idx));
    });

    wrapper.appendChild(article);



    container.appendChild(wrapper);

    // ツールバー状態復元
    restoreToolbarState();

    // キーボードバインド
    if (!window._rrKeyBound) {
      window._rrKeyBound = true;
      document.addEventListener('keydown', handleKeydown);
    }

    // 最初の段落にスクロール
    setTimeout(() => {
      const firstPara = document.querySelector('.rr-para');
      if (firstPara) firstPara.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // ======================================================================
  //  ツールバー
  // ======================================================================
  const TOOLBAR_TOGGLES = [
    { id: 'ruby',    label: '🔤 ルビ',        cls: 'rr-hide-ruby',  default: false },
    { id: 'gap',     label: '📏 間隔なし',    cls: 'rr-no-gap',     default: false },
    { id: 'color',   label: '🎨 品詞色',      cls: 'rr-no-color',   default: false },
    { id: 'compact', label: '📄 コンパクト',  cls: 'rr-compact',    default: false },
    { id: 'large',   label: '🔍 拡大',        cls: 'rr-large',      default: false },
  ];

  function buildToolbar() {
    const tb = document.createElement('div');
    tb.className = 'rr-toolbar';
    const inner = document.createElement('div');
    inner.className = 'rr-toolbar-inner';

    TOOLBAR_TOGGLES.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'rr-toolbar-btn' + (t.default ? ' active' : '');
      btn.textContent = t.label;
      btn.dataset.toggleId = t.id;
      btn.addEventListener('click', () => {
        const isActive = document.body.classList.toggle(t.cls);
        btn.classList.toggle('active', isActive);
        saveToolbarState();
      });
      inner.appendChild(btn);
    });

    inner.appendChild(sep());

    // 停止
    const stopBtn = document.createElement('button');
    stopBtn.className = 'rr-toolbar-btn';
    stopBtn.textContent = '⏹ 停止';
    stopBtn.addEventListener('click', stopAudio);
    inner.appendChild(stopBtn);

    // 自動再生
    const autoBtn = document.createElement('button');
    autoBtn.className = 'rr-toolbar-btn';
    autoBtn.textContent = '▶ 全再生';
    autoBtn.addEventListener('click', () => playAll());
    inner.appendChild(autoBtn);

    inner.appendChild(sep());

    // ループ
    const loopLabel = document.createElement('label');
    loopLabel.className = 'rr-loop-toggle';
    loopLabel.innerHTML = `<input type="checkbox" id="rr-loop-cb"> 🔁 ループ`;
    inner.appendChild(loopLabel);

    tb.appendChild(inner);
    return tb;
  }

  function sep() {
    const el = document.createElement('span');
    el.className = 'rr-toolbar-sep';
    return el;
  }

  function buildLegend() {
    const l = document.createElement('div');
    l.className = 'rr-legend';
    [
      ['名詞', 'noun'],
      ['動詞', 'verb'],
      ['助詞', 'particle'],
      ['形容詞', 'adj'],
      ['副詞', 'adverb'],
      ['接続', 'connector'],
      ['文法', 'grammar'],
    ].forEach(([label, cls]) => {
      const span = document.createElement('span');
      span.className = `rr-legend-item`;
      span.style.color = `var(--rr-${cls})`;
      const dot = document.createElement('span');
      dot.className = 'rr-legend-dot';
      dot.style.background = `var(--rr-${cls})`;
      span.appendChild(dot);
      span.appendChild(document.createTextNode(label));
      l.appendChild(span);
    });
    return l;
  }

  // ---- ツールバー状態保存 ----
  function saveToolbarState() {
    const state = {};
    TOOLBAR_TOGGLES.forEach(t => {
      state[t.id] = document.body.classList.contains(t.cls);
    });
    try { localStorage.setItem('rr-toolbar', JSON.stringify(state)); } catch (e) {}
  }

  function restoreToolbarState() {
    try {
      const raw = localStorage.getItem('rr-toolbar');
      if (!raw) return;
      const state = JSON.parse(raw);
      TOOLBAR_TOGGLES.forEach(t => {
        const val = state[t.id];
        if (val === undefined) return;
        document.body.classList.toggle(t.cls, val);
        const btn = document.querySelector(`[data-toggle-id="${t.id}"]`);
        if (btn) btn.classList.toggle('active', val);
      });
    } catch (e) {}
  }

  // ======================================================================
  //  段落構築
  // ======================================================================
  function buildParagraph(para, idx) {
    const sec = document.createElement('section');
    sec.className = 'rr-para';
    sec.id = para.id || ('p' + (idx + 1));
    sec.dataset.idx = idx;

    // 段ヘッダー
    const head = document.createElement('div');
    head.className = 'rr-para-head';

    const no = document.createElement('span');
    no.className = 'rr-para-no';
    no.textContent = `§ ${String(idx + 1).padStart(2, '0')}`;
    head.appendChild(no);

    // 音声ボタン
    const ab = document.createElement('div');
    ab.className = 'rr-audio-btns';

    const text4audio = escAttr(para.ja);

    const normalBtn = document.createElement('button');
    normalBtn.className = 'rr-audio-btn normal';
    normalBtn.innerHTML = '▶ 普通';
    normalBtn.dataset.text = text4audio;
    normalBtn.dataset.speed = '1';
    normalBtn.dataset.audio = para.audio || '';
    normalBtn.dataset.paraIdx = idx;

    const slowBtn = document.createElement('button');
    slowBtn.className = 'rr-audio-btn slow';
    slowBtn.innerHTML = '▶ ゆっくり';
    slowBtn.dataset.text = text4audio;
    slowBtn.dataset.speed = '0.65';
    slowBtn.dataset.audio = para.audio || '';
    slowBtn.dataset.paraIdx = idx;

    ab.appendChild(normalBtn);
    ab.appendChild(slowBtn);
    head.appendChild(ab);
    sec.appendChild(head);

    // ナビボタン（段落間）
    const prevBtn = document.createElement('button');
    prevBtn.className = 'rr-para-nav-btn';
    prevBtn.textContent = '↑ 前';
    prevBtn.addEventListener('click', () => scrollToPara(idx - 1));
    if (idx === 0) prevBtn.style.visibility = 'hidden';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'rr-para-nav-btn';
    nextBtn.textContent = '↓ 次';
    nextBtn.addEventListener('click', () => scrollToPara(idx + 1));
    if (idx === currentData.paragraphs.length - 1) nextBtn.style.visibility = 'hidden';

    const navInline = document.createElement('div');
    navInline.className = 'rr-nav-inline';
    navInline.appendChild(prevBtn);
    navInline.appendChild(nextBtn);
    head.appendChild(navInline);

    // 本文
    const jpDiv = document.createElement('div');
    jpDiv.className = 'rr-jp-text';
    jpDiv.appendChild(buildTokens(para.words));
    sec.appendChild(jpDiv);

    // 詳細パネル
    sec.appendChild(buildDetail(para));

    // 音声バインド
    ab.querySelectorAll('.rr-audio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pIdx = parseInt(btn.dataset.paraIdx);
        playPara(pIdx, btn);
      });
    });

    return sec;
  }

  // ---- トークン構築（CSS ツールチップ対応） ----
  function buildTokens(words) {
    const frag = document.createDocumentFragment();
    (words || []).forEach(w => {
      if (!w.s) return;

      // 句読点/空白はそのまま
      if (/^[　 　、。．，！？\n\r]+$/.test(w.s)) {
        frag.appendChild(document.createTextNode(w.s));
        return;
      }

      const span = document.createElement('span');
      span.className = 'rr-tok';
      if (w.p && ['noun','verb','particle','adj','adverb','connector','grammar'].includes(w.p)) {
        span.classList.add(w.p);
      }

      // 注釈 → data-note（CSSツールチップ）
      if (w.n) {
        span.setAttribute('data-note', w.n);
      }

      // Ruby 注音
      if (w.r && /[\u4e00-\u9fff]/.test(w.s)) {
        const ruby = document.createElement('ruby');
        ruby.textContent = w.s;
        const rt = document.createElement('rt');
        rt.textContent = w.r;
        ruby.appendChild(rt);
        span.appendChild(ruby);
      } else {
        span.textContent = w.s;
        if (w.r) {
          const sup = document.createElement('sup');
          sup.textContent = `(${w.r})`;
          sup.style.cssText = 'font-size:0.5em;color:var(--rr-muted);';
          span.appendChild(sup);
        }
      }

      frag.appendChild(span);
    });
    return frag;
  }

  // ---- 詳細パネル ----
  function buildDetail(para) {
    const dt = document.createElement('details');
    dt.className = 'rr-detail';

    const sum = document.createElement('summary');
    sum.className = 'rr-detail-summary';
    sum.textContent = ' 翻訳・文法・語彙';
    dt.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'rr-detail-body';

    // 翻訳
    if (para.en) {
      const block = document.createElement('div');
      block.className = 'rr-trans-block';
      block.innerHTML = `
        <span class="rr-trans-label">Translation</span>
        <div class="rr-trans-text">${escHtml(para.en)}</div>
      `;
      body.appendChild(block);
    }

    // 直訳
    if (para.literal) {
      const lit = document.createElement('div');
      lit.className = 'rr-literal';
      lit.textContent = '直訳: ' + para.literal;
      body.appendChild(lit);
    }

    // 文法
    if (para.grammar) {
      const gs = document.createElement('div');
      gs.className = 'rr-grammar-section';
      gs.innerHTML = `
        <span class="rr-grammar-label">Grammar</span>
        <div>${escHtml(para.grammar)}</div>
      `;
      body.appendChild(gs);
    }

    // 語彙
    if (para.vocab && para.vocab.length) {
      const vl = document.createElement('div');
      vl.className = 'rr-vocab-list';
      para.vocab.forEach(v => {
        const item = document.createElement('div');
        item.className = 'rr-vocab-item';
        const reading = v[1] ? ` <span class="rr-vocab-reading">（${escHtml(v[1])}）</span>` : '';
        item.innerHTML = `<strong>${escHtml(v[0])}</strong>${reading} — ${escHtml(v[2])}`;
        vl.appendChild(item);
      });
      body.appendChild(vl);
    }

    dt.appendChild(body);
    return dt;
  }

  // ======================================================================
  //  音声再生
  // ======================================================================
  function playPara(idx, btn) {
    if (!currentData || !currentData.paragraphs[idx]) return;
    stopAudio();
    currentParaIdx = idx;

    const para = currentData.paragraphs[idx];
    const audioSrc = btn.dataset.audio;
    const text = btn.dataset.text;
    const speed = parseFloat(btn.dataset.speed) || 1;

    // スクロール
    const section = document.getElementById(para.id);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // ハイライト
    document.querySelectorAll('.rr-para.playing').forEach(p => p.classList.remove('playing'));
    if (section) section.classList.add('playing');

    btn.classList.add('playing');

    if (audioSrc) {
      const audio = new Audio('/takanote/' + audioSrc);
      audio.playbackRate = speed;
      audio.loop = document.getElementById('rr-loop-cb').checked;

      audio.addEventListener('ended', () => {
        btn.classList.remove('playing');
        if (audio.loop) {
          audio.currentTime = 0;
          audio.play();
          return;
        }
        if (isAutoMode) {
          playNextInQueue();
        }
      });

      audio.addEventListener('error', () => {
        btn.classList.remove('playing');
        fallbackTTS(text, speed, idx);
      });

      currentAudio = audio;
      isPlaying = true;
      audio.play().catch(() => {
        btn.classList.remove('playing');
        fallbackTTS(text, speed, idx);
      });
    } else {
      fallbackTTS(text, speed, idx);
    }
  }

  function fallbackTTS(text, rate, idx) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rate / 1.2;
    u.onend = () => {
      const loop = document.getElementById('rr-loop-cb');
      if (loop && loop.checked) {
        setTimeout(() => fallbackTTS(text, rate, idx), 400);
        return;
      }
      if (isAutoMode) {
        playNextInQueue();
      }
    };
    u.onerror = () => {
      if (isAutoMode) playNextInQueue();
    };
    window.speechSynthesis.speak(u);
    isPlaying = true;
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    window.speechSynthesis.cancel();
    isPlaying = false;
    isAutoMode = false;
    audioQueue = [];
    document.querySelectorAll('.rr-audio-btn.playing').forEach(b => b.classList.remove('playing'));
    document.querySelectorAll('.rr-para.playing').forEach(p => p.classList.remove('playing'));
  }

  // ---- 全段落自動再生 ----
  function playAll() {
    if (!currentData || !currentData.paragraphs.length) return;
    stopAudio();

    isAutoMode = true;
    audioQueue = currentData.paragraphs.map((_, idx) => idx);

    // 最初の段落の「普通」ボタンを探す
    playNextInQueue();
  }

  function playNextInQueue() {
    if (!isAutoMode || audioQueue.length === 0) {
      isAutoMode = false;
      return;
    }

    const nextIdx = audioQueue.shift();
    const section = document.getElementById(currentData.paragraphs[nextIdx].id);
    if (!section) return;

    // この段落の「普通」ボタンを探して再生
    const normalBtn = section.querySelector('.rr-audio-btn.normal');
    if (normalBtn) {
      playPara(nextIdx, normalBtn);
    }
  }

  // ======================================================================
  //  キーボードショートカット
  // ======================================================================
  function handleKeydown(e) {
    // テキスト入力中は無視
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'n':
      case 'N':
        e.preventDefault();
        nextPara();
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        prevPara();
        break;
      case ' ':
        e.preventDefault();
        toggleCurrentParaAudio();
        break;
    }
  }

  function scrollToPara(idx) {
    if (!currentData || idx < 0 || idx >= currentData.paragraphs.length) return;
    const section = document.getElementById(currentData.paragraphs[idx].id);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function nextPara() {
    if (currentParaIdx < 0) { scrollToPara(0); currentParaIdx = 0; return; }
    scrollToPara(currentParaIdx + 1);
    if (currentParaIdx + 1 < currentData.paragraphs.length) currentParaIdx++;
  }

  function prevPara() {
    scrollToPara(currentParaIdx - 1);
    if (currentParaIdx > 0) currentParaIdx--;
  }

  function toggleCurrentParaAudio() {
    if (isPlaying) {
      stopAudio();
      return;
    }
    // 現在表示中の最初の段落に「普通」ボタンがあれば再生
    const firstSection = document.querySelector('.rr-para');
    if (!firstSection) return;
    const btn = currentParaIdx >= 0
      ? document.querySelector(`.rr-para[data-idx="${currentParaIdx}"] .rr-audio-btn.normal`)
      : firstSection.querySelector('.rr-audio-btn.normal');
    if (btn) {
      playPara(parseInt(btn.dataset.paraIdx), btn);
    }
  }

  // ======================================================================
  //  ユーティリティ
  // ======================================================================
  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
