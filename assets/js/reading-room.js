// takanote 読解ルーム — Interactive Reading Room

(function () {
  'use strict';

  // ---- 状态 ----
  let currentReading = null;
  let currentUtterance = null;
  let isSpeaking = false;

  // DOM
  let container, listEl;

  // ---- 初始化 ----
  document.addEventListener('DOMContentLoaded', () => {
    container = document.getElementById('reading-room-container');
    if (!container) return;

    // 注入 CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/takanote/assets/css/reading-room.css';
    document.head.appendChild(link);

    listEl = document.getElementById('reading-list');

    // 从 URL 参数加载指定阅读
    const params = new URLSearchParams(window.location.search);
    const readingId = params.get('read');
    if (readingId) {
      loadReading(readingId);
    } else {
      renderReadingList();
    }
  });

  // ---- 阅读数据清单 ----
  function getReadingList() {
    // 手动维护列表，或从 JSON 目录自动发现
    return [
      { id: 'poster', title: '日本のポスターはなぜ情報量が多いのか', desc: '中級〜上級 | 10段落', file: '/takanote/assets/readings/poster.json' }
    ];
  }

  // ---- 渲染列表 ----
  function renderReadingList() {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'rr-header';
    header.innerHTML = '<h2>読解ルーム</h2><p class="rr-desc">小文章で日本語を深く読む。逐語訳・文法解説・音声練習付き。</p>';
    container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'reading-list';

    getReadingList().forEach(r => {
      const card = document.createElement('div');
      card.className = 'reading-card';
      card.innerHTML = `<h3>${r.title}</h3><div class="meta">${r.desc}</div>`;
      card.addEventListener('click', () => loadReading(r.id));
      list.appendChild(card);
    });

    container.appendChild(list);
  }

  // ---- 加载阅读 ----
  function loadReading(id) {
    const reading = getReadingList().find(r => r.id === id);
    if (!reading) { renderReadingList(); return; }

    fetch(reading.file)
      .then(res => res.json())
      .then(data => {
        // data 是数组，取第一个
        if (Array.isArray(data)) {
          renderReader(data[0] || data);
        } else {
          renderReader(data);
        }
      })
      .catch(err => {
        container.innerHTML = `<p class="error-msg">❌ 読み込みエラー: ${err.message}</p>`;
      });
  }

  // ---- 渲染阅读器 ----
  function renderReader(data) {
    currentReading = data;
    container.innerHTML = '';

    // 返回按钮
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.textContent = '← 読解ルーム一覧';
    backBtn.addEventListener('click', () => {
      stopSpeech();
      renderReadingList();
      history.pushState({}, '', window.location.pathname);
    });

    // 标题
    const header = document.createElement('div');
    header.className = 'reader-header';
    header.appendChild(backBtn);
    header.innerHTML += `<h1>${data.title}</h1>`;
    if (data.subtitle) {
      header.innerHTML += `<p class="subtitle">${data.subtitle}</p>`;
    }
    container.appendChild(header);

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'reader-toolbar';
    toolbar.innerHTML = `
      <div class="toolbar-inner">
        <button class="toolbar-btn" data-toggle="hide-ruby">🔤 ルビ</button>
        <button class="toolbar-btn" data-toggle="no-gap">📏 間隔</button>
        <button class="toolbar-btn active" data-toggle="no-color">🎨 品詞色</button>
        <button class="toolbar-btn" data-toggle="compact">📄 コンパクト</button>
        <button class="toolbar-btn" id="stop-all-audio">⏹ 停止</button>
        <label class="loop-toggle"><input type="checkbox" id="loop-toggle"> 🔁 ループ</label>
      </div>
    `;
    container.appendChild(toolbar);

    // 图例
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `
      <span class="legend-item" style="color:#8c6b35">名詞</span>
      <span class="legend-item" style="color:#7a5c88">動詞</span>
      <span class="legend-item" style="color:#567d7a">助詞</span>
      <span class="legend-item" style="color:#9a5b4f">形容詞</span>
      <span class="legend-item" style="color:#6c7892">副詞</span>
      <span class="legend-item" style="color:#6f7d54">接続</span>
      <span class="legend-item" style="color:#a07352">文法</span>
    `;
    container.appendChild(legend);

    // 文章卡片
    const article = document.createElement('div');
    article.className = 'article-body';

    data.paragraphs.forEach((para, idx) => {
      const section = document.createElement('section');
      section.className = 'para';
      section.id = para.id || ('p' + idx);

      // 段落头
      const head = document.createElement('div');
      head.className = 'para-head';
      const no = document.createElement('div');
      no.className = 'para-no';
      no.textContent = `段落 ${String(idx + 1).padStart(2, '0')}`;
      head.appendChild(no);

      // 音频按钮
      const audioBtns = document.createElement('div');
      audioBtns.className = 'audio-btns';
      audioBtns.innerHTML = `
        <button class="audio-btn normal" data-text="${escHtml(para.ja)}" data-speed="1">▶ 普通</button>
        <button class="audio-btn slow" data-text="${escHtml(para.ja)}" data-speed="0.68">▶ ゆっくり</button>
      `;
      head.appendChild(audioBtns);
      section.appendChild(head);

      // 正文
      const jpDiv = document.createElement('div');
      jpDiv.className = 'jp-text';
      jpDiv.appendChild(renderWords(para.words));
      section.appendChild(jpDiv);

      // 翻译/语法面板
      const details = document.createElement('details');
      details.className = 'detail-panel';
      const summary = document.createElement('summary');
      summary.className = 'detail-summary';
      summary.textContent = ' 翻訳 / 文法 / 語彙';
      details.appendChild(summary);

      const content = document.createElement('div');
      content.className = 'detail-content';

      // 翻译
      if (para.en) {
        const trans = document.createElement('div');
        trans.className = 'translation-block';
        trans.innerHTML = `<span class="label">翻译</span><div class="text">${escHtml(para.en)}</div>`;
        content.appendChild(trans);
      }

      // 逐词译
      if (para.literal) {
        const lit = document.createElement('div');
        lit.className = 'literal-trans';
        lit.textContent = `直訳: ${para.literal}`;
        content.appendChild(lit);
      }

      // 语法
      if (para.grammar) {
        const g = document.createElement('div');
        g.className = 'grammar-note';
        g.innerHTML = `<span class="label">文法</span><div>${para.grammar}</div>`;
        content.appendChild(g);
      }

      // 词汇表
      if (para.vocab && para.vocab.length > 0) {
        const vGrid = document.createElement('div');
        vGrid.className = 'vocab-grid';
        para.vocab.forEach(v => {
          const item = document.createElement('div');
          item.className = 'vocab-item';
          const reading = v[1] ? `（${v[1]}）` : '';
          item.innerHTML = `<strong>${v[0]}</strong>${reading} — ${v[2]}`;
          vGrid.appendChild(item);
        });
        content.appendChild(vGrid);
      }

      details.appendChild(content);
      section.appendChild(details);
      article.appendChild(section);
    });

    container.appendChild(article);

    // 更新历史 URL
    history.pushState({}, '', `?read=${currentReading.id}`);

    // 绑定事件
    bindToolbarEvents();
    bindAudioEvents();
  }

  // ---- 渲染单词 ----
  function renderWords(words) {
    const frag = document.createDocumentFragment();
    (words || []).forEach(w => {
      if (!w.s || w.s === '') return;
      if (w.s === '　' || w.s === ' ') {
        frag.appendChild(document.createTextNode(w.s));
        return;
      }

      const span = document.createElement('span');
      span.className = 'tok';

      if (w.p) {
        const POS_MAP = {
          'noun': 'noun', 'verb': 'verb', 'particle': 'particle',
          'adj': 'adj', 'adverb': 'adverb', 'connector': 'connector', 'grammar': 'grammar'
        };
        if (POS_MAP[w.p]) span.classList.add(POS_MAP[w.p]);
      }

      // 带 ruby 的有汉字则用 ruby
      if (w.r && w.r !== '' && /[\u4e00-\u9fff]/.test(w.s)) {
        const ruby = document.createElement('ruby');
        ruby.textContent = w.s;
        const rt = document.createElement('rt');
        rt.textContent = w.r;
        ruby.appendChild(rt);
        span.appendChild(ruby);
      } else {
        span.textContent = w.s;
        // 如果提供了 r 但没汉字，以括号注音显示
        if (w.r && !/[\u4e00-\u9fff]/.test(w.s)) {
          const small = document.createElement('small');
          small.textContent = `(${w.r})`;
          small.style.cssText = 'font-size:0.5em;color:#6b6259;vertical-align:super;';
          span.appendChild(small);
        }
      }

      // 工具提示
      if (w.n) {
        const tip = document.createElement('span');
        tip.className = 'tok-tooltip';
        tip.textContent = w.n;
        span.appendChild(tip);
      }

      frag.appendChild(span);
    });
    return frag;
  }

  // ---- 工具栏事件 ----
  function bindToolbarEvents() {
    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cls = btn.dataset.toggle;
        document.body.classList.toggle(cls);
        btn.classList.toggle('active');
      });
    });

    document.getElementById('stop-all-audio')?.addEventListener('click', stopSpeech);
  }

  // ---- 音频事件 ----
  function bindAudioEvents() {
    document.querySelectorAll('.audio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.text;
        const rate = parseFloat(btn.dataset.speed) || 1;
        speak(text, rate);
      });
    });
  }

  // ---- 语音合成 ----
  function speak(text, rate) {
    stopSpeech();
    if (!text) return;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rate;
    u.pitch = 1;
    u.onend = () => {
      isSpeaking = false;
      currentUtterance = null;
      const loop = document.getElementById('loop-toggle');
      if (loop && loop.checked) {
        setTimeout(() => speak(text, rate), 400);
      }
    };
    currentUtterance = u;
    isSpeaking = true;
    window.speechSynthesis.speak(u);
  }

  function stopSpeech() {
    window.speechSynthesis.cancel();
    currentUtterance = null;
    isSpeaking = false;
  }

  // ---- 工具 ----
  function escHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
