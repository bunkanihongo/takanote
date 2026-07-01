// takanote 読解ルーム — Interactive Reading Reader v2

(function () {
  'use strict';

  let currentReading = null;
  let currentAudio = null;

  // ---- 初始化 ----
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('reading-room-container');
    if (!container) return;

    // CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/takanote/assets/css/reading-room.css';
    document.head.appendChild(link);

    const params = new URLSearchParams(window.location.search);
    const readingId = params.get('read');
    if (readingId) {
      loadReading(readingId, container);
    } else {
      renderList(container);
    }
  });

  // ---- 阅读清单 ----
  function getList() {
    return [
      { id: 'poster', title: '日本のポスターはなぜ情報量が多いのか', desc: '中級〜上級 | 5段落', file: '/takanote/assets/readings/poster.json' }
    ];
  }

  // ---- 列表页 ----
  function renderList(container) {
    container.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'rr-header';
    h.innerHTML = '<h2>読解ルーム</h2><p class="rr-desc">小文章で日本語を深く読む。逐語訳・文法解説・音声練習付き。</p>';
    container.appendChild(h);

    const list = document.createElement('div');
    list.className = 'reading-list';
    getList().forEach(r => {
      const card = document.createElement('div');
      card.className = 'reading-card';
      card.innerHTML = `<h3>${esc(r.title)}</h3><div class="meta">${esc(r.desc)}</div>`;
      card.addEventListener('click', () => {
        loadReading(r.id, container);
        history.pushState({}, '', `?read=${r.id}`);
      });
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  // ---- 加载阅读 ----
  function loadReading(id, container) {
    const reading = getList().find(r => r.id === id);
    if (!reading) { renderList(container); return; }

    container.innerHTML = '<p style="color:var(--muted);padding:30px 0;">読み込み中…</p>';

    fetch(reading.file)
      .then(res => res.json())
      .then(data => {
        renderReader(Array.isArray(data) ? data[0] : data, container);
      })
      .catch(err => {
        container.innerHTML = `<p class="error-msg">❌ 読み込みエラー: ${err.message}</p>`;
      });
  }

  // ---- 渲染阅读器 ----
  function renderReader(data, container) {
    currentReading = data;
    container.innerHTML = '';

    // 返回按钮
    const back = mk('button', 'back-btn', '← 読解ルーム一覧');
    back.addEventListener('click', () => {
      stopAudio();
      renderList(container);
      history.pushState({}, '', window.location.pathname);
    });

    // 标题区
    const header = mk('div', 'reader-header');
    header.appendChild(back);
    header.appendChild(mk('h1', 'reader-title', data.title));
    if (data.subtitle) {
      header.appendChild(mk('p', 'reader-subtitle', data.subtitle));
    }
    container.appendChild(header);

    // 工具栏
    const tb = mk('div', 'reader-toolbar');
    tb.innerHTML = `
      <div class="toolbar-inner">
        <button class="toolbar-btn" data-toggle="hide-ruby">🔤 ルビ</button>
        <button class="toolbar-btn" data-toggle="no-gap">📏 間隔</button>
        <button class="toolbar-btn active" data-toggle="no-color">🎨 品詞色</button>
        <button class="toolbar-btn" data-toggle="compact">📄 コンパクト</button>
        <button class="toolbar-btn" id="stop-btn">⏹ 停止</button>
        <label class="loop-toggle"><input type="checkbox" id="loop-cb"> 🔁 ループ</label>
      </div>
    `;
    container.appendChild(tb);

    // 绑定工具栏
    tb.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.body.classList.toggle(btn.dataset.toggle);
        btn.classList.toggle('active');
      });
    });
    document.getElementById('stop-btn').addEventListener('click', stopAudio);

    // 图例
    const legend = mk('div', 'legend');
    [
      ['名詞', 'noun'], ['動詞', 'verb'], ['助詞', 'particle'],
      ['形容詞', 'adj'], ['副詞', 'adverb'], ['接続', 'connector'], ['文法', 'grammar']
    ].forEach(([label, cls]) => {
      const span = document.createElement('span');
      span.className = `legend-item ${cls}`;
      span.textContent = label;
      legend.appendChild(span);
    });
    container.appendChild(legend);

    // 文章卡片
    const article = mk('div', 'article-body');
    data.paragraphs.forEach((para, idx) => {
      article.appendChild(buildPara(para, idx));
    });
    container.appendChild(article);

    // 说明
    if (data.has_audio) {
      const note = mk('p', 'reader-note', '🔊 音声は Microsoft Edge ニューラル音声（ja-JP-NanamiNeural）で合成しています。');
      container.appendChild(note);
    }

    currentAudio = null;
  }

  // ---- 构建段落 ----
  function buildPara(para, idx) {
    const sec = document.createElement('section');
    sec.className = 'para';
    sec.id = para.id || ('p' + (idx + 1));

    // 段头
    const head = mk('div', 'para-head');
    head.appendChild(mk('div', 'para-no', `段落 ${String(idx + 1).padStart(2, '0')}`));

    // 音频按钮
    const ab = mk('div', 'audio-btns');
    const text4audio = escAttr(para.ja);
    ab.innerHTML = `
      <button class="audio-btn normal" data-text="${text4audio}" data-speed="1" data-audio="${escAttr(para.audio || '')}">▶ 普通</button>
      <button class="audio-btn slow" data-text="${text4audio}" data-speed="0.65" data-audio="${escAttr(para.audio || '')}">▶ ゆっくり</button>
    `;
    head.appendChild(ab);
    sec.appendChild(head);

    // 正文
    const jpDiv = mk('div', 'jp-text');
    jpDiv.appendChild(buildWords(para.words));
    sec.appendChild(jpDiv);

    // 详情面板
    const dt = document.createElement('details');
    dt.className = 'detail-panel';
    const sum = document.createElement('summary');
    sum.className = 'detail-summary';
    sum.textContent = ' 翻訳 / 文法 / 語彙';
    dt.appendChild(sum);

    const dc = mk('div', 'detail-content');
    if (para.en) {
      dc.innerHTML += `<div class="translation-block"><span class="label">翻译</span><div class="text">${esc(para.en)}</div></div>`;
    }
    if (para.literal) {
      dc.innerHTML += `<div class="literal-trans">直訳: ${esc(para.literal)}</div>`;
    }
    if (para.grammar) {
      dc.innerHTML += `<div class="grammar-note"><span class="label">文法</span><div>${esc(para.grammar)}</div></div>`;
    }
    if (para.vocab && para.vocab.length) {
      let vhtml = '<div class="vocab-grid">';
      para.vocab.forEach(v => {
        const r = v[1] ? `（${v[1]}）` : '';
        vhtml += `<div class="vocab-item"><strong>${esc(v[0])}</strong>${r} — ${esc(v[2])}</div>`;
      });
      vhtml += '</div>';
      dc.innerHTML += vhtml;
    }
    dt.appendChild(dc);
    sec.appendChild(dt);

    // 绑定音频
    ab.querySelectorAll('.audio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playAudio(sec.id, btn);
      });
    });

    return sec;
  }

  // ---- 构建单词 ----
  function buildWords(words) {
    const frag = document.createDocumentFragment();
    (words || []).forEach(w => {
      if (!w.s) return;
      if (/^[　 　、。．，！？\n\r]+$/.test(w.s)) {
        frag.appendChild(document.createTextNode(w.s));
        return;
      }

      const span = document.createElement('span');
      span.className = 'tok';
      if (w.p && ['noun','verb','particle','adj','adverb','connector','grammar'].includes(w.p)) {
        span.classList.add(w.p);
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

  // ---- 音频播放（预生成 MP3 优先，Web Speech API 后备） ----
  function playAudio(paraId, btn) {
    stopAudio();

    const audioSrc = btn.dataset.audio;
    const text = btn.dataset.text;
    const speed = parseFloat(btn.dataset.speed) || 1;

    if (audioSrc) {
      // 预生成 MP3 播放
      const audio = new Audio('/takanote/' + audioSrc);
      audio.playbackRate = speed;
      audio.loop = document.getElementById('loop-cb').checked;

      audio.addEventListener('ended', () => {
        if (audio.loop) {
          audio.currentTime = 0;
          audio.play();
        } else {
          btn.classList.remove('playing');
        }
      });

      audio.addEventListener('error', () => {
        // 降级到 Web Speech API
        btn.classList.remove('playing');
        fallbackTTS(text, speed);
      });

      btn.classList.add('playing');
      currentAudio = audio;
      audio.play().catch(() => {
        btn.classList.remove('playing');
        fallbackTTS(text, speed);
      });
    } else {
      fallbackTTS(text, speed);
    }
  }

  function fallbackTTS(text, rate) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rate;
    u.onend = () => {
      const loop = document.getElementById('loop-cb');
      if (loop && loop.checked) {
        setTimeout(() => fallbackTTS(text, rate), 400);
      }
    };
    window.speechSynthesis.speak(u);
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    window.speechSynthesis.cancel();
    document.querySelectorAll('.audio-btn.playing').forEach(b => b.classList.remove('playing'));
  }

  // ---- 工具函数 ----
  function mk(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
