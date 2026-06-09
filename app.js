// ===================================================
// コード道場 — ゲームロジック
// ===================================================

let currentTopicId  = null;
let currentQueue    = [];   // シャッフル済みの問題キュー
let currentIndex    = 0;    // キュー内の現在位置
let currentQuestion = null; // 出題中の問題オブジェクト
let currentChoices  = [];   // 現在の選択肢（順番保持用）
let streak          = 0;    // 現在の連続正解数
let sessionCorrect  = 0;    // このセッションの正解数
let sessionAnswered = 0;    // このセッションの回答数
let saveData        = {};   // トピックごとの通算統計

// ===================================================
// セーブデータ
// ===================================================
function loadSave() {
  const raw = localStorage.getItem('code_dojo_v1');
  saveData = raw ? JSON.parse(raw) : { stats: {} };
  if (!saveData.stats) saveData.stats = {};
}

function writeSave() {
  localStorage.setItem('code_dojo_v1', JSON.stringify(saveData));
}

function getStats(topicId) {
  if (!saveData.stats[topicId]) {
    saveData.stats[topicId] = { correct: 0, answered: 0, bestStreak: 0 };
  }
  return saveData.stats[topicId];
}

// ===================================================
// ホーム画面
// ===================================================
function renderTopicGrid() {
  const grid = document.getElementById('topic-grid');
  grid.innerHTML = TOPICS.map(topic => {
    const st   = getStats(topic.id);
    const rate = st.answered > 0
      ? Math.round(st.correct / st.answered * 100) + '%'
      : '--';
    const best = st.bestStreak > 0 ? `🔥${st.bestStreak}` : '';
    return `
      <button class="topic-card" onclick="startTopic('${topic.id}')">
        <span class="topic-icon">${topic.icon}</span>
        <span class="topic-name">${topic.name}</span>
        <span class="topic-desc">${topic.desc}</span>
        <span class="topic-stats">
          <span class="topic-rate">${rate}</span>
          ${best ? `<span class="topic-best">${best}</span>` : ''}
        </span>
      </button>
    `;
  }).join('');
}

function goHome() {
  showScreen('home');
  renderTopicGrid();
}

// ===================================================
// クイズの開始
// ===================================================
function startTopic(topicId) {
  currentTopicId  = topicId;
  currentQueue    = shuffleArray([...QUESTIONS[topicId]]);
  currentIndex    = 0;
  streak          = 0;
  sessionCorrect  = 0;
  sessionAnswered = 0;

  const topic = TOPICS.find(t => t.id === topicId);
  document.getElementById('quiz-topic-name').textContent = `${topic.icon} ${topic.name}`;

  showScreen('quiz');
  showQuestion();
}

// ===================================================
// 問題表示
// ===================================================
function showQuestion() {
  // キューを使い切ったら再シャッフル（無限ループ）
  if (currentIndex >= currentQueue.length) {
    currentQueue = shuffleArray([...QUESTIONS[currentTopicId]]);
    currentIndex = 0;
  }

  currentQuestion = currentQueue[currentIndex];

  // 問題フェーズを表示
  document.getElementById('quiz-question-phase').classList.remove('hidden');
  document.getElementById('quiz-result-phase').classList.add('hidden');

  // カウンター・スコア
  document.getElementById('question-counter').textContent = `問題 ${sessionAnswered + 1}`;
  document.getElementById('question-score').textContent   = `正解 ${sessionCorrect}`;
  updateStreakDisplay();

  // 問題文
  document.getElementById('question-text').textContent = currentQuestion.q;

  // コードブロック
  const codeEl = document.getElementById('question-code');
  if (currentQuestion.code) {
    codeEl.textContent = currentQuestion.code;
    codeEl.classList.remove('hidden');
  } else {
    codeEl.classList.add('hidden');
  }

  // 選択肢（シャッフル）- インデックスで参照してクォート問題を回避
  currentChoices = shuffleArray([currentQuestion.answer, ...currentQuestion.dummies]);
  document.getElementById('quiz-choices').innerHTML = currentChoices.map((c, i) => `
    <button class="choice-btn" onclick="checkAnswer(${i})">
      ${c}
    </button>
  `).join('');
}

// ===================================================
// 答え合わせ
// ===================================================
function checkAnswer(selectedIdx) {
  const q         = currentQuestion;
  const selected  = currentChoices[selectedIdx];
  const isCorrect = selected === q.answer;

  // 全ボタンを無効化して正解・不正解を色で示す
  document.querySelectorAll('.choice-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (currentChoices[i] === q.answer) {
      btn.classList.add('correct');
    } else if (i === selectedIdx && !isCorrect) {
      btn.classList.add('wrong');
    }
  });

  // 統計を更新
  sessionAnswered++;
  if (isCorrect) {
    sessionCorrect++;
    streak++;
  } else {
    streak = 0;
  }

  const st = getStats(currentTopicId);
  st.answered++;
  if (isCorrect) st.correct++;
  if (streak > st.bestStreak) st.bestStreak = streak;
  writeSave();

  updateStreakDisplay();

  // 少し待ってから結果フェーズへ
  setTimeout(() => showResult(isCorrect, q), 450);
}

// ===================================================
// 結果表示
// ===================================================
function showResult(isCorrect, q) {
  document.getElementById('quiz-question-phase').classList.add('hidden');
  document.getElementById('quiz-result-phase').classList.remove('hidden');

  const iconEl = document.getElementById('quiz-result-icon');
  const msgEl  = document.getElementById('quiz-result-message');

  if (isCorrect) {
    iconEl.textContent = '○';
    iconEl.className   = 'result-icon correct';
    msgEl.textContent  = streak >= 3 ? `正解！  🔥 ${streak}連続！` : '正解！';
  } else {
    iconEl.textContent = '×';
    iconEl.className   = 'result-icon wrong';
    msgEl.textContent  = '不正解...';
  }

  document.getElementById('quiz-correct-answer').textContent = `正解：${q.answer}`;
  document.getElementById('quiz-explanation').textContent    = q.exp;

  currentIndex++;
}

function nextQuestion() {
  showQuestion();
}

// ===================================================
// UI ヘルパー
// ===================================================
function updateStreakDisplay() {
  const el = document.getElementById('quiz-streak');
  el.textContent = `🔥 ${streak}`;
  el.className   = streak >= 3 ? 'quiz-streak hot' : 'quiz-streak';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// フィッシャー・イェーツ法によるシャッフル
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===================================================
// 初期化
// ===================================================
function init() {
  loadSave();
  renderTopicGrid();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

window.addEventListener('load', init);
