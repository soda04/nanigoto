// ===================================================
// 難読語コレクション — ゲームロジック
// ===================================================
// このファイルがゲームの動きを全部管理しています。
// 上から順に読むと流れが分かるようになっています。

// ===== ゲームの定数（変わらない数値） =====

const POINTS_PER_CORRECT = 3; // 正解1回で得られる知識ポイント

// アップグレードの設定
// costs   : 各レベルアップに必要な知識ポイント（配列）
// speed側 : intervals = 言葉が1つ湧くまでの時間（ミリ秒）
// capacity: capacities = 未鑑定の最大ストック数
const UPGRADE_CONFIG = {
  speed: {
    label: "湧出速度アップ",
    desc: "言葉が湧いてくるのが速くなる",
    costs: [10, 25, 50],
    intervals: [
      3 * 1000,  // Lv.0：3秒
      2 * 1000,  // Lv.1：2秒
      1 * 1000,  // Lv.2：1秒
      1 * 1000   // Lv.3：1秒（最大）
    ]
  },
  capacity: {
    label: "ストック上限アップ",
    desc: "未鑑定の言葉を多く溜められる",
    costs: [15, 30, 60],
    capacities: [20, 25, 30, 40]  // Lv.0〜Lv.3の上限数
  }
};

// ===== セーブデータの初期値 =====
// 最初に遊ぶときはこの値から始まる。
const INITIAL_SAVE = {
  collected:       [],           // 収集済みの言葉IDの配列
  pending:         [],           // 未鑑定ストックのIDの配列
  knowledgePoints: 0,            // 知識ポイント
  lastTickTime:    Date.now(),   // 最後に時間を計算した時刻（ミリ秒）
  upgrades:        { speed: 0, capacity: 0 }, // アップグレードのレベル
  meterProgress:   0             // メーターの進捗（0〜1の小数）
};

// ===== プレイ中に変化する状態 =====
let saveData = null;        // 現在のセーブデータ（起動時に読み込む）
let currentQuizWord = null; // 今出題中の言葉オブジェクト
let tickTimer = null;       // メーターを動かすタイマーのID

// ===================================================
// セーブデータの保存と読み込み
// ===================================================

// ゲームの状態をブラウザに保存する
function saveGame() {
  // オブジェクトをJSON文字列に変換してlocalStorageに書き込む
  localStorage.setItem('nanigoto_save', JSON.stringify(saveData));
}

// 保存されたデータを読み込む
function loadGame() {
  const raw = localStorage.getItem('nanigoto_save');
  if (raw) {
    // 保存データがあればそれを使う
    saveData = JSON.parse(raw);
    // 古いバージョンのデータに新しいキーがない場合に補完する
    if (saveData.meterProgress === undefined) saveData.meterProgress = 0;
  } else {
    // 初回起動：初期値をセット
    saveData = Object.assign({}, INITIAL_SAVE, { lastTickTime: Date.now() });
  }
}

// ===================================================
// 放置計算ヘルパー
// ===================================================

// 現在の生成間隔（ミリ秒）を返す
function getGenerateInterval() {
  const level = saveData.upgrades.speed;
  return UPGRADE_CONFIG.speed.intervals[level];
}

// 現在の未鑑定上限数を返す
function getMaxPending() {
  const level = saveData.upgrades.capacity;
  return UPGRADE_CONFIG.capacity.capacities[level];
}

// ===================================================
// 放置の核心：オフライン中の経過時間を計算して反映
// ===================================================
// アプリを閉じている間に何個言葉が湧いたか計算し、pendingに追加する。
// 起動時に1回だけ呼ぶ。
function processOfflineTime() {
  const now = Date.now();
  const elapsed = now - saveData.lastTickTime; // 経過時間（ミリ秒）
  const interval = getGenerateInterval();

  // これまでのメーター進捗 + 今回の経過分を足す
  const totalProgress = saveData.meterProgress + elapsed / interval;

  // 整数部分が「今回湧いた個数」、小数部分が「次回への持ち越し」
  const newWordCount = Math.floor(totalProgress);
  saveData.meterProgress = totalProgress - newWordCount;

  // 計算した個数だけ言葉を追加する
  for (let i = 0; i < newWordCount; i++) {
    addPendingWord();
  }

  saveData.lastTickTime = now;
  saveGame();
}

// 未鑑定ストックに言葉を1つ追加する（上限チェックあり）
function addPendingWord() {
  const maxPending = getMaxPending();
  if (saveData.pending.length >= maxPending) return; // 上限なら追加しない

  // 「まだ集めていない かつ 未鑑定にもない」言葉を候補にする
  const available = WORDS.filter(w =>
    !saveData.collected.includes(w.id) &&
    !saveData.pending.includes(w.id)
  );

  if (available.length === 0) return; // 全部集め終わった

  // 候補からランダムに1つ選ぶ
  const pick = available[Math.floor(Math.random() * available.length)];
  saveData.pending.push(pick.id);
}

// ===================================================
// 定期更新タイマー（メーターをリアルタイムに動かす）
// ===================================================
function startTicker() {
  if (tickTimer) clearInterval(tickTimer); // 二重起動を防ぐ

  // 5秒ごとにメーターを更新する
  tickTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - saveData.lastTickTime;
    const interval = getGenerateInterval();
    const maxPending = getMaxPending();

    // 未鑑定が上限に達している間はメーターを止める
    if (saveData.pending.length >= maxPending) {
      saveData.meterProgress = 1.0;
      saveData.lastTickTime = now;
      updateMainView();
      return;
    }

    // メーターを進める
    saveData.meterProgress += elapsed / interval;
    saveData.lastTickTime = now;

    // メーターが満タン（1以上）になったら言葉を追加してリセット
    while (saveData.meterProgress >= 1.0) {
      saveData.meterProgress -= 1.0;
      addPendingWord();
    }

    saveGame();
    updateMainView();
  }, 1000); // 1000ミリ秒 = 1秒
}

// ===================================================
// タブ切り替え
// ===================================================
function switchTab(tabName, btn) {
  // すべてのタブコンテンツを非表示にする
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
  });
  // すべてのタブボタンを非アクティブにする
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active');
  });

  // 選んだタブを表示して、ボタンをアクティブにする
  document.getElementById('tab-' + tabName).classList.add('active');
  btn.classList.add('active');

  // 各タブに切り替えたときに最新の内容を描画する
  if (tabName === 'zukan')   renderZukan();
  if (tabName === 'upgrade') renderUpgrade();
}

// ===================================================
// メイン画面の更新
// ===================================================
function updateMainView() {
  const pendingCount = saveData.pending.length;
  const maxPending   = getMaxPending();

  // 未鑑定の数を表示
  document.getElementById('pending-count').textContent = pendingCount;

  // 鑑定ボタンの表示／非表示
  const assessBtn = document.getElementById('assess-btn');
  if (pendingCount > 0) {
    assessBtn.classList.remove('hidden');
  } else {
    assessBtn.classList.add('hidden');
  }

  // メーターバーの幅を進捗に合わせる（0〜100%）
  const barPct = Math.min(saveData.meterProgress * 100, 100);
  document.getElementById('meter-bar').style.width = barPct + '%';

  // 次の生成までの時間を表示
  const nextTimeEl = document.getElementById('next-time');
  if (pendingCount >= maxPending) {
    nextTimeEl.textContent = '（上限到達）';
  } else {
    const remainingMs  = (1 - saveData.meterProgress) * getGenerateInterval();
    const remainingMin = Math.ceil(remainingMs / 60000);
    nextTimeEl.textContent = `あと約${remainingMin}分`;
  }

  // 知識ポイントの表示
  document.getElementById('points-value').textContent = saveData.knowledgePoints;

  // ドット絵の風景を更新
  renderWorld();
}

// ===================================================
// ドット絵の風景（収集数に応じて賑やかになる）
// ===================================================
function renderWorld() {
  const count   = saveData.collected.length;
  const worldEl = document.getElementById('world-view');
  let html = '<div class="world-ground"></div>';

  // 集めた言葉の数が増えるほど要素が追加される
  if (count >= 1)  html += '<div class="world-tree tree1"></div>';
  if (count >= 3)  html += '<div class="world-tree tree2"></div>';
  if (count >= 5)  html += '<div class="world-house"></div>';
  if (count >= 7)  html += '<div class="world-tree tree3"></div>';
  if (count >= 10) html += '<div class="world-bird"></div>';
  if (count >= 12) html += '<div class="world-flower"></div>';
  if (count >= 15) html += '<div class="world-sun"></div>';

  worldEl.innerHTML = html;
}

// ===================================================
// 図鑑画面の描画
// ===================================================
function renderZukan() {
  const collected = saveData.collected.length;
  const total     = WORDS.length;

  // コンプリート率を表示
  document.getElementById('rate-value').textContent = `${collected} / ${total}`;

  // 全言葉のカードを作る
  let html = '';
  WORDS.forEach(word => {
    if (saveData.collected.includes(word.id)) {
      // 収集済み：詳細を表示する
      html += `
        <div class="word-card collected">
          <div class="card-word">${word.word}</div>
          <div class="card-reading">意味：${word.reading}</div>
          <div class="card-meaning">${word.meaning}</div>
          <div class="card-trivia">📖 ${word.trivia}</div>
        </div>
      `;
    } else {
      // 未収集：？？？のシルエット表示
      html += `
        <div class="word-card unknown">
          <div class="card-word">？？？</div>
          <div class="card-reading">読み：？？？</div>
          <div class="card-meaning">鑑定して登録しよう</div>
        </div>
      `;
    }
  });

  document.getElementById('zukan-list').innerHTML = html;
}

// ===================================================
// アップグレード画面の描画
// ===================================================
function renderUpgrade() {
  // ポイントの表示を更新
  document.getElementById('upgrade-points-value').textContent = saveData.knowledgePoints;

  const listEl = document.getElementById('upgrade-list');
  let html = '';

  // 速度アップグレードのカード
  html += buildUpgradeCard('speed');
  // 上限アップグレードのカード
  html += buildUpgradeCard('capacity');

  listEl.innerHTML = html;
}

// アップグレードカードのHTMLを作るヘルパー
function buildUpgradeCard(type) {
  const config       = UPGRADE_CONFIG[type];
  const currentLevel = saveData.upgrades[type];
  const maxLevel     = config.costs.length; // これ以上はアップできないレベル
  const cost         = config.costs[currentLevel]; // 次のレベルアップのコスト
  const hasPoints    = saveData.knowledgePoints >= cost;

  let effectText = '';
  if (type === 'speed') {
    const nextInterval = config.intervals[currentLevel + 1];
    const nextMins     = Math.floor(nextInterval / 60000);
    effectText = `次のレベル：${nextMins}分に1個`;
  } else {
    const nextCap = config.capacities[currentLevel + 1];
    effectText = `次のレベル：最大${nextCap}個`;
  }

  let actionHtml = '';
  if (currentLevel >= maxLevel) {
    // 最大レベル到達
    actionHtml = `<div class="upgrade-max">★ 最大レベル！</div>`;
  } else {
    const disabled = hasPoints ? '' : 'disabled';
    actionHtml = `
      <div class="upgrade-effect">${effectText}</div>
      <button class="upgrade-btn" onclick="doUpgrade('${type}')" ${disabled}>
        ★${cost} ポイントで強化（現在 Lv.${currentLevel}）
      </button>
    `;
  }

  return `
    <div class="upgrade-item">
      <div class="upgrade-name">${config.label}</div>
      <div class="upgrade-desc">${config.desc}</div>
      ${actionHtml}
    </div>
  `;
}

// アップグレードを実行する
function doUpgrade(type) {
  const config       = UPGRADE_CONFIG[type];
  const currentLevel = saveData.upgrades[type];
  const cost         = config.costs[currentLevel];

  // バリデーション（ボタンのdisabledで防いでいるが念のため）
  if (cost === undefined) return;
  if (saveData.knowledgePoints < cost) return;

  // ポイントを消費してレベルアップ
  saveData.knowledgePoints -= cost;
  saveData.upgrades[type]++;

  saveGame();
  renderUpgrade();   // アップグレード画面を再描画
  updateMainView();  // メイン画面のポイント表示も更新
}

// ===================================================
// 鑑定（クイズ）の流れ
// ===================================================

// 「鑑定する」ボタンを押したとき：最初の未鑑定言葉を出題する
function startAssessment() {
  if (saveData.pending.length === 0) return;

  // 未鑑定の先頭の言葉を取り出す
  const wordId = saveData.pending[0];
  currentQuizWord = WORDS.find(w => w.id === wordId);

  if (!currentQuizWord) {
    // データに存在しない言葉はスキップ
    saveData.pending.shift();
    saveGame();
    return;
  }

  showQuizPhase(currentQuizWord);

  // モーダルを開く
  document.getElementById('assessment-modal').classList.remove('hidden');
}

// クイズ画面を表示する
function showQuizPhase(word) {
  // クイズ画面を見せて、結果画面を隠す
  document.getElementById('quiz-phase').classList.remove('hidden');
  document.getElementById('result-phase').classList.add('hidden');

  // お題を表示
  document.getElementById('quiz-word').textContent = word.word;

  // 4択の選択肢を作る（正解1つ＋ダミー3つをシャッフル）
  const choices = [word.reading, ...word.dummies];
  shuffleArray(choices);

  let html = '';
  choices.forEach(choice => {
    // onclick に文字列を渡すため、シングルクォートで囲む
    html += `<button class="choice-btn" onclick="checkAnswer('${escapeSingleQuote(choice)}')">${choice}</button>`;
  });
  document.getElementById('choices').innerHTML = html;
}

// 選択肢を選んだとき：正誤判定する
function checkAnswer(selected) {
  const word      = currentQuizWord;
  const isCorrect = (selected === word.reading);

  // ボタンを全部無効化して、正解・不正解を色で示す
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === word.reading) {
      btn.classList.add('correct');  // 正解ボタンを緑に
    } else if (btn.textContent === selected && !isCorrect) {
      btn.classList.add('wrong');    // 選んだ不正解ボタンを赤に
    }
  });

  // 少し待ってから結果画面に切り替える（色を見せるため）
  setTimeout(() => {
    showResultPhase(isCorrect, word);
  }, 600);
}

// 結果画面を表示する
function showResultPhase(isCorrect, word) {
  document.getElementById('quiz-phase').classList.add('hidden');
  document.getElementById('result-phase').classList.remove('hidden');

  const iconEl    = document.getElementById('result-icon');
  const messageEl = document.getElementById('result-message');

  if (isCorrect) {
    // 正解：図鑑に登録してポイント追加
    iconEl.textContent  = '○';
    iconEl.className    = 'result-icon correct';
    messageEl.textContent = '正解！　図鑑に登録しました';

    // pendingから削除してcollectedに追加
    saveData.pending = saveData.pending.filter(id => id !== word.id);
    if (!saveData.collected.includes(word.id)) {
      saveData.collected.push(word.id);
    }
    saveData.knowledgePoints += POINTS_PER_CORRECT;

  } else {
    // 不正解：pendingの末尾に移動（後で再挑戦できる）
    iconEl.textContent  = '×';
    iconEl.className    = 'result-icon wrong';
    messageEl.textContent = `不正解... 正解は「${word.reading}」`;

    // 先頭から取り除いて末尾に追加する
    saveData.pending = saveData.pending.filter(id => id !== word.id);
    saveData.pending.push(word.id);
  }

  // 読み・意味・雑学を表示
  document.getElementById('result-reading').textContent = `意味：${word.reading}`;
  document.getElementById('result-meaning').textContent = word.meaning;
  document.getElementById('result-trivia').textContent  = `📖 ${word.trivia}`;

  // 次へボタンのラベルを変える（残りがあるかどうか）
  const nextBtn = document.getElementById('next-btn');
  if (saveData.pending.length > 0) {
    nextBtn.textContent = '次の言葉へ ▶';
  } else {
    nextBtn.textContent = '閉じる';
  }

  saveGame();
  updateMainView(); // メイン画面のポイントと未鑑定数を更新
}

// 「次へ」ボタンを押したとき
function nextAssessment() {
  if (saveData.pending.length > 0) {
    // まだ未鑑定があれば続けて出題する
    startAssessment();
  } else {
    // なくなったらモーダルを閉じる
    closeModal();
  }
}

// モーダルを閉じる
function closeModal() {
  document.getElementById('assessment-modal').classList.add('hidden');
  currentQuizWord = null;
}

// ===================================================
// ユーティリティ関数
// ===================================================

// 配列をランダムな順番に並べ替える（フィッシャー・イェーツ法）
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // 2つの要素を入れ替える（分割代入）
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// onclick属性にシングルクォートを含む文字列を安全に渡すためのエスケープ
function escapeSingleQuote(str) {
  return str.replace(/'/g, "\\'");
}

// ===================================================
// 初期化：アプリ起動時に最初に呼ばれる
// ===================================================
function init() {
  // 1. 保存データを読み込む
  loadGame();

  // 2. アプリを閉じていた間の放置分を計算して反映
  processOfflineTime();

  // 3. メイン画面を最新の状態に更新
  updateMainView();

  // 4. メーターのリアルタイム更新タイマーを開始
  startTicker();
}

// ページの読み込みが完了したら init() を呼ぶ
window.addEventListener('load', init);
