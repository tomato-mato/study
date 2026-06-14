/* ── State ── */
let CFG, QS, HIST, APP_ID, TODAY_QS;
let qIdx = 0;
let reviewMode = false;

const storageKey = () => `study-app/${APP_ID}/history`;
const DAY_MS = 86400000;
const WEEK = ['日','月','火','水','木','金','土'];

/* ── Entry point ── */
async function initApp(appId) {
  APP_ID = appId;
  try {
    [CFG, QS] = await Promise.all([
      fetch('./config.json').then(r => r.json()),
      fetch('./questions.json').then(r => r.json()),
    ]);
  } catch {
    document.body.innerHTML = `
      <div style="padding:24px;color:#ef4444;line-height:1.8">
        <p>⚠️ ファイルの読み込みに失敗しました。</p>
        <p style="color:#94a3b8;font-size:.9rem;margin-top:8px">
          ローカルで確認する場合は<br>
          <code>python -m http.server</code><br>
          を実行してからアクセスしてください。
        </p>
      </div>`;
    return;
  }

  HIST = JSON.parse(localStorage.getItem(storageKey()) || '{}');

  if (CFG.theme) document.body.dataset.theme = CFG.theme;
  document.title = CFG.title;
  document.getElementById('app-title').textContent = CFG.title;

  TODAY_QS = getTodayQs();
  showToday();
}

/* ── Question selection ── */
function getTodayQs() {
  const start = midnight(new Date(CFG.startDate));
  const now   = midnight(new Date());
  const n = Math.floor((now - start) / DAY_MS) + 1;
  if (n < 1) return [];
  const s = (n - 1) * CFG.questionsPerDay;
  return QS.slice(s, s + CFG.questionsPerDay);
}

function midnight(d) {
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ── Screen management ── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === id);
  });
}

/* ── Today screen ── */
function showToday() {
  reviewMode = false;
  showScreen('today');

  document.getElementById('today-date').textContent = fmtDate(new Date());

  const el = document.getElementById('today-content');

  if (TODAY_QS.length === 0) {
    const start = midnight(new Date(CFG.startDate));
    const now   = midnight(new Date());
    el.innerHTML = now < start
      ? `<div class="empty-state">📅 開始日は ${CFG.startDate} です</div>`
      : `<div class="empty-state">🎉 全問終了！<br>お疲れ様でした。</div>`;
    return;
  }

  const answered = TODAY_QS.filter(q => HIST[q.id]);
  const correct  = answered.filter(q => HIST[q.id]?.correct);
  const allDone  = answered.length === TODAY_QS.length;

  if (allDone) {
    el.innerHTML = `
      <div class="today-card">
        <div class="score-big">${correct.length} / ${TODAY_QS.length}</div>
        <div class="score-label">今日の正解数</div>
        <button class="btn-primary" onclick="startQuiz(true)">解き直す</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="today-card">
        <div class="progress-info">${answered.length} / ${TODAY_QS.length} 問 回答済み</div>
        <button class="btn-primary" onclick="startQuiz(false)">
          ${answered.length === 0 ? '今日の問題を解く' : '続きから'}
        </button>
      </div>`;
  }
}

/* ── Quiz flow ── */
function startQuiz(redo) {
  reviewMode = false;
  if (redo) {
    qIdx = 0;
  } else {
    qIdx = TODAY_QS.findIndex(q => !HIST[q.id]);
    if (qIdx < 0) qIdx = 0;
  }
  renderQuestion(TODAY_QS[qIdx]);
}

function renderQuestion(q) {
  showScreen('quiz');

  const inToday = !reviewMode;
  const total = inToday ? TODAY_QS.length : 1;
  const num   = inToday ? qIdx + 1 : 1;

  document.getElementById('quiz-num').textContent = `${num} / ${total}`;
  document.getElementById('progress-fill').style.width = `${(num / total) * 100}%`;
  document.getElementById('question-text').textContent = q.question;

  const nextBtn = document.getElementById('btn-next');
  nextBtn.style.display = 'none';
  nextBtn.textContent = reviewMode
    ? '過去問一覧に戻る'
    : num < total ? '次へ →' : '結果を見る';

  const expEl = document.getElementById('explanation');
  expEl.style.display = 'none';
  expEl.className = 'explanation';

  const choicesEl = document.getElementById('choices');
  choicesEl.innerHTML = '';
  q.choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = text;
    btn.onclick = () => selectAnswer(q, i);
    choicesEl.appendChild(btn);
  });
}

function selectAnswer(q, sel) {
  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add('correct');
    else if (i === sel) b.classList.add('wrong');
  });

  const isCorrect = sel === q.answer;

  HIST[q.id] = { answeredAt: new Date().toISOString(), correct: isCorrect, selected: sel };
  localStorage.setItem(storageKey(), JSON.stringify(HIST));

  const expEl = document.getElementById('explanation');
  expEl.style.display = 'block';
  expEl.className = 'explanation ' + (isCorrect ? 'correct' : 'wrong');

  let html = `
    <div class="exp-verdict">${isCorrect ? '✓ 正解！' : '✗ 不正解'}</div>
    <div class="exp-text">${escHtml(q.explanation)}</div>`;
  if (CFG.showLink && q.link) {
    html += `<a class="exp-link" href="${escAttr(q.link)}" target="_blank" rel="noopener noreferrer">参考リンク →</a>`;
  }
  expEl.innerHTML = html;

  document.getElementById('btn-next').style.display = 'block';
}

function nextQuestion() {
  if (reviewMode) { showPast(); return; }
  qIdx++;
  if (qIdx < TODAY_QS.length) {
    renderQuestion(TODAY_QS[qIdx]);
  } else {
    showResults();
  }
}

/* ── Results screen ── */
function showResults() {
  showScreen('result');
  const correct = TODAY_QS.filter(q => HIST[q.id]?.correct).length;
  const total   = TODAY_QS.length;
  const pct     = Math.round((correct / total) * 100);
  const emoji   = pct >= 80 ? '🎉' : pct >= 60 ? '😊' : '💪';

  const items = TODAY_QS.map((q, i) => {
    const ok = HIST[q.id]?.correct;
    return `<div class="result-item ${ok ? 'correct' : 'wrong'}">
      <span class="ri-num">Q${i + 1}</span>
      <span class="ri-mark">${ok ? '✓' : '✗'}</span>
      <span class="ri-text">${escHtml(q.question.slice(0, 28))}${q.question.length > 28 ? '…' : ''}</span>
    </div>`;
  }).join('');

  document.getElementById('result-content').innerHTML = `
    <div class="result-card">
      <div class="result-emoji">${emoji}</div>
      <div class="result-score">${correct} / ${total}</div>
      <div class="result-label">今日の正解数</div>
      <div class="result-pct">${pct}%</div>
      <div class="result-items">${items}</div>
      <button class="btn-primary" onclick="showToday()">今日の画面に戻る</button>
    </div>`;
}

/* ── Past screen ── */
function showPast() {
  showScreen('past');
  reviewMode = false;

  const start = midnight(new Date(CFG.startDate));
  const now   = midnight(new Date());
  const totalDays = Math.floor((now - start) / DAY_MS); // 今日 = totalDays 番目 (0-based)

  if (totalDays <= 0) {
    document.getElementById('past-content').innerHTML =
      '<div class="empty-state">まだ過去問はありません。</div>';
    return;
  }

  let html = '<div class="past-list">';
  for (let d = totalDays - 1; d >= 0; d--) {
    const dayDate = new Date(start.getTime() + d * DAY_MS);
    const s = d * CFG.questionsPerDay;
    const dayQs = QS.slice(s, s + CFG.questionsPerDay);
    if (!dayQs.length) continue;

    const answered = dayQs.filter(q => HIST[q.id]);
    const correct  = answered.filter(q => HIST[q.id]?.correct);
    const scoreStr = answered.length ? `${correct.length}/${dayQs.length}` : '未挑戦';

    const qItems = dayQs.map(q => {
      const rec  = HIST[q.id];
      const mark = !rec ? '－' : rec.correct ? '✓' : '✗';
      const cls  = !rec ? '' : rec.correct ? 'correct' : 'wrong';
      return `<div class="past-q ${cls}" onclick="reviewQuestion('${escAttr(q.id)}')">
        <span class="pq-mark">${mark}</span>
        <span class="pq-text">${escHtml(q.question)}</span>
      </div>`;
    }).join('');

    html += `
      <div class="past-day">
        <div class="past-day-hd" onclick="toggleDay(this)">
          <span class="past-day-date">${fmtDate(dayDate)}</span>
          <span class="past-day-score">${scoreStr}</span>
          <span class="past-day-arrow">▼</span>
        </div>
        <div class="past-day-qs">${qItems}</div>
      </div>`;
  }
  html += '</div>';
  document.getElementById('past-content').innerHTML = html;
}

function toggleDay(hd) {
  const qs    = hd.nextElementSibling;
  const arrow = hd.querySelector('.past-day-arrow');
  const open  = qs.classList.toggle('open');
  arrow.textContent = open ? '▲' : '▼';
}

function reviewQuestion(qId) {
  const q = QS.find(q => q.id === qId);
  if (!q) return;
  reviewMode = true;
  renderQuestion(q);
}

/* ── Helpers ── */
function fmtDate(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
