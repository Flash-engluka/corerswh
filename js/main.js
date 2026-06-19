/* main.js — Screen transitions, starfield, HUD, event wiring */

(() => {
  /* ─── State ─── */
  let mode = 'local';  // 'local' | 'online'
  let selectedChars = [];  // chosen charKeys
  let inMoveMode   = false;
  let boardDataRaw = null;

  /* ─── Screen transitions ─── */
  function goTo(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
  }

  /* ─── Starfield ─── */
  function initStarfield() {
    const canvas = document.getElementById('bg-stars');
    const ctx    = canvas.getContext('2d');
    const stars  = [];

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 180; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.0002 + 0.0001,
        phase: Math.random() * Math.PI * 2,
      });
    }

    function draw(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const alpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.speed * 1000 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,255,${alpha.toFixed(2)})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* ─── Modal system ─── */
  function showModal(title, bodyHTML, buttons) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    const btns = document.getElementById('modal-buttons');
    btns.innerHTML = '';
    for (const { label, cls, onClick } of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = 'btn ' + (cls || 'btn-primary');
      b.addEventListener('click', () => { onClick(); hideModal(); });
      btns.appendChild(b);
    }
    document.getElementById('modal-backdrop').removeAttribute('hidden');
  }

  function hideModal() {
    document.getElementById('modal-backdrop').setAttribute('hidden', '');
  }

  /* ─── Toast ─── */
  function showToast(msg, duration = 4000) {
    const container = document.getElementById('log-toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration + 200);
  }

  /* ─── Gold popup ─── */
  function showGoldPopup(amount, anchorEl) {
    const el = document.createElement('div');
    el.className = 'gold-popup';
    el.textContent = (amount > 0 ? '+' : '') + amount + 'G';
    const rect = (anchorEl || document.getElementById('gold-display')).getBoundingClientRect();
    el.style.left = rect.left + rect.width / 2 - 20 + 'px';
    el.style.top  = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  /* ─── Character select screen ─── */
  const CHAR_ORDER = ['toriel','papyrus','undyne','mettaton'];
  const FACTION_LABELS = { toriel:'RUINS', papyrus:'SNOWDIN', undyne:'WATERFALL', mettaton:'HOTLAND' };
  const FACTION_COLORS = { RUINS:'#ff0000', SNOWDIN:'#0099ff', WATERFALL:'#15ff00', HOTLAND:'#fbff00' };

  function buildCharSelect() {
    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    selectedChars = [];

    for (const key of CHAR_ORDER) {
      const def = Game.CHAR_DEFS[key];
      const card = document.createElement('div');
      card.className = 'char-card';
      card.dataset.charKey = key;

      const img = document.createElement('img');
      const sprite = Sprites.get(def.tiers[0]);
      if (sprite) img.src = sprite.src;
      img.alt = def.displayName;

      const name = document.createElement('div');
      name.className = 'char-card-name';
      name.textContent = def.displayName;

      const fac = document.createElement('div');
      fac.className = 'char-card-fac';
      fac.style.color = FACTION_COLORS[def.faction];
      fac.textContent = def.faction;

      card.appendChild(img);
      card.appendChild(name);
      card.appendChild(fac);
      card.addEventListener('click', () => _onCharCardClick(key, card));
      grid.appendChild(card);
    }

    document.getElementById('btn-start-game').disabled = true;
    document.getElementById('char-msg').textContent = '진영을 선택하세요 (1~4명)';
  }

  function _onCharCardClick(key, card) {
    if (card.classList.contains('taken')) return;
    if (card.classList.contains('selected')) {
      card.classList.remove('selected');
      selectedChars = selectedChars.filter(k => k !== key);
    } else {
      card.classList.add('selected');
      selectedChars.push(key);
    }
    const n = selectedChars.length;
    document.getElementById('char-msg').textContent = n
      ? `${n}명 선택됨 — START를 누르세요`
      : '진영을 선택하세요 (1~4명)';
    document.getElementById('btn-start-game').disabled = n < 1;
  }

  /* ─── Game start ─── */
  function startGame() {
    const chars = selectedChars.length ? selectedChars : CHAR_ORDER;
    Game.init(boardDataRaw, chars);
    Board.init(document.getElementById('board-canvas'), boardDataRaw);
    Board.setClickHandler(_onBoardCellClick);
    _wireGameEvents();
    goTo('game');
    _updateHUD();
    showToast(`라운드 ${Game.getState().round} 시작! 순서: ${Game.getState().turnOrder.join(' → ')}`);
    _checkJokerNotice();
  }

  /* ─── Game event listeners ─── */
  function _wireGameEvents() {
    Game.on('gold-changed',    (d) => { showGoldPopup(d.amount); _updateHUD(); });
    Game.on('todo-done',       (d) => { showToast(`✓ ${d.text} (+5G)`); _updateHUD(); });
    Game.on('item-picked',     (d) => { showToast(`${_playerLabel(d.player)} → ${d.item} 획득!`); _updateHUD(); });
    Game.on('char-upgraded',   (d) => { showToast(`★ ${d.tierName} 달성!`); _updateHUD(); });
    Game.on('item-upgraded',   (d) => { showToast(`★ ${d.from} → ${d.to}!`); _updateHUD(); });
    Game.on('moved',           ()  => { _updateHUD(); });
    Game.on('sans-flowey-bonus',(d)=> { showToast('Sans + Flowey 동시 보유! +2G'); _updateHUD(); });
    Game.on('joker-steal',     (d) => { showToast(`${_playerLabel(d.player)}이 ${_playerLabel(d.victim)}의 ${d.item}을 훔쳤습니다!`); _updateHUD(); });
    Game.on('upgrade-token',   ()  => { setTimeout(_promptUpgrade, 200); });
    Game.on('round-end',       (d) => { _onRoundEnd(d); });
    Game.on('game-end',        (d) => { _onGameEnd(d); });
    Game.on('round-start',     (d) => { showToast(`라운드 ${d.round} 시작! 전원 +15G. 조커: ${_playerLabel(d.jokerHolder)}`); });
  }

  function _playerLabel(key) {
    return Game.CHAR_DEFS[key]?.displayName || key;
  }

  /* ─── HUD update ─── */
  function _updateHUD() {
    const state = Game.getState();
    const curKey = Game.currentKey();
    const cur    = Game.currentPlayer();

    // Turn info
    document.getElementById('turn-player').textContent = cur.displayName;
    document.getElementById('round-num').textContent   = state.round;

    // Right HUD — current player info
    const infoEl = document.getElementById('player-info');
    const tierName = Game.CHAR_DEFS[curKey].tiers[cur.charTier];
    const sprite   = Sprites.get(tierName);
    infoEl.innerHTML = '';
    if (sprite) {
      const img = document.createElement('img');
      img.src = sprite.src; img.className = 'player-info-sprite';
      infoEl.appendChild(img);
    }
    const nameEl = document.createElement('div');
    nameEl.className = 'player-info-name';
    nameEl.textContent = tierName;
    const facEl = document.createElement('div');
    facEl.className = 'player-info-faction';
    facEl.textContent = cur.faction;
    facEl.style.color = FACTION_COLORS[cur.faction];
    infoEl.appendChild(nameEl);
    infoEl.appendChild(facEl);

    // To-do list
    const todoEl = document.getElementById('todo-list');
    todoEl.innerHTML = '';
    const todos = Game.TODOS[cur.faction];
    todos.forEach((td, i) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (cur.todoStatus[i] ? ' done' : '');
      li.textContent = td.text;
      todoEl.appendChild(li);
    });

    // Gold
    document.getElementById('gold-display').innerHTML = cur.gold + '<span class="gold-unit">G</span>';

    // Scoreboard
    const sbEl = document.getElementById('players-scoreboard');
    sbEl.innerHTML = '';
    for (const [key, p] of Object.entries(state.players)) {
      const row = document.createElement('div');
      row.className = 'score-row';
      const dot  = document.createElement('div');
      dot.className = 'score-dot';
      dot.style.background = FACTION_COLORS[p.faction];
      const nm   = document.createElement('span');
      nm.className = 'score-name';
      nm.textContent = p.displayName + (key === curKey ? ' ▶' : '');
      const gEl  = document.createElement('span');
      gEl.className = 'score-g';
      gEl.textContent = p.gold + 'G';
      row.appendChild(dot); row.appendChild(nm); row.appendChild(gEl);
      sbEl.appendChild(row);
    }

    // Inventory & Box
    _renderSlots('inv-slots',  cur.inventory);
    _renderSlots('box-slots',  cur.box);

    // Action buttons
    _updateActionButtons();
  }

  function _renderSlots(elId, items) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const item = items[i];
      if (item) {
        const img = document.createElement('img');
        const sp  = Sprites.get(item.name);
        if (sp) { img.src = sp.src; }
        else    { img.alt = item.name; img.style.display = 'none'; }
        slot.appendChild(img);
        const label = document.createElement('div');
        label.className = 'inv-slot-label';
        label.textContent = item.name;
        slot.appendChild(label);
        slot.title = item.name;
      }
      el.appendChild(slot);
    }
  }

  function _updateActionButtons() {
    const state  = Game.getState();
    const curKey = Game.currentKey();
    const cur    = Game.currentPlayer();
    const turn   = state.turn;

    const canMainAct = !turn.actionDone || turn.extraAction;
    const pickItems  = (state.boardItems[cur.position] || []).filter(i => !i.picked);
    const canPick    = canMainAct && Game.canPickupAt(curKey, cur.position).length > 0;

    document.getElementById('act-move').disabled    = !canMainAct;
    document.getElementById('act-pickup').disabled  = !canPick;
    document.getElementById('act-upgrade').disabled = !turn.upgradeToken;
    document.getElementById('act-replace').disabled = !Game.canSwap(curKey);
    document.getElementById('act-joker').disabled   = !cur.hasJoker || turn.jokerUsed;
    document.getElementById('act-end-turn').disabled = false;

    // Show joker button highlighted if has joker
    document.getElementById('act-joker').classList.toggle('active', cur.hasJoker && !turn.jokerUsed);

    // Move mode indicator
    document.getElementById('act-move').classList.toggle('active', inMoveMode);
  }

  /* ─── Move mode ─── */
  function _enterMoveMode() {
    if (inMoveMode) { _exitMoveMode(); return; }
    const curKey = Game.currentKey();
    const cur    = Game.currentPlayer();
    const adj    = Game.getAdjacent(cur.position);
    if (!adj.length) { showToast('이동할 수 있는 칸이 없습니다'); return; }
    inMoveMode = true;
    Board.highlight(adj);
    Board.setClickHandler(_onBoardCellClick);
    _updateActionButtons();
    showToast('이동할 칸을 클릭하세요 (다시 클릭하면 취소)');
  }

  function _exitMoveMode() {
    inMoveMode = false;
    Board.clearHighlight();
    _updateActionButtons();
  }

  function _onBoardCellClick(cellId) {
    if (!inMoveMode) return;
    _exitMoveMode();
    const result = Game.doMove(cellId);
    if (!result.ok) { showToast('⚠ ' + result.msg); return; }
    _updateHUD();
  }

  /* ─── Pickup flow ─── */
  function _openPickupModal() {
    const curKey = Game.currentKey();
    const cur    = Game.currentPlayer();
    const avail  = Game.canPickupAt(curKey, cur.position);

    if (!avail.length) { showToast('줍기 가능한 아이템이 없습니다'); return; }

    let bodyHTML = '<div class="modal-item-list">';
    avail.forEach((item, i) => {
      const sp = Sprites.get(item.name);
      const imgTag = sp ? `<img src="${sp.src}" alt="${item.name}">` : '';
      const cost = item.type === 'special' ? ` (-${item.cost}G)` : '';
      bodyHTML += `<button class="modal-item-btn" data-idx="${i}">${imgTag}${item.name}${cost}</button>`;
    });
    bodyHTML += '</div>';

    showModal('아이템 줍기', bodyHTML, [{ label:'취소', cls:'btn-ghost', onClick:()=>{} }]);

    document.querySelectorAll('.modal-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        hideModal();
        const idx = parseInt(btn.dataset.idx);
        const result = Game.doPickup(cur.position, idx);
        if (!result.ok) showToast('⚠ ' + result.msg);
        else _updateHUD();
      });
    });
  }

  /* ─── Upgrade flow ─── */
  function _promptUpgrade() {
    const curKey   = Game.currentKey();
    const canChar  = Game.canUpgradeChar(curKey);
    const upgItems = Game.upgradableItems(curKey);

    const buttons = [];

    if (canChar) {
      const def     = Game.CHAR_DEFS[curKey];
      const cur     = Game.currentPlayer();
      const nextName = def.tiers[cur.charTier + 1];
      buttons.push({ label:`캐릭터 업그레이드 → ${nextName}`, cls:'btn-primary', onClick:() => {
        const r = Game.doUpgrade('char');
        if (r.ok) { showToast(`★ ${r.msg}`); _updateHUD(); }
        else showToast('⚠ ' + r.msg);
      }});
    }

    upgItems.forEach(({ item, idx }, i) => {
      const toName = Game.UPGRADES[item.name];
      buttons.push({ label:`${item.name} → ${toName}`, cls:'btn-secondary', onClick:() => {
        const r = Game.doUpgrade('item', i);
        if (r.ok) { showToast(`★ ${r.msg}`); _updateHUD(); }
        else showToast('⚠ ' + r.msg);
      }});
    });

    buttons.push({ label:'건너뜀 (토큰 소실)', cls:'btn-ghost', onClick:() => {
      Game.doSkipUpgrade(); _updateHUD();
    }});

    showModal('업그레이드', '업그레이드 토큰을 사용할 대상을 선택하세요.', buttons);
  }

  /* ─── Swap flow ─── */
  function _openSwapModal() {
    const curKey = Game.currentKey();
    if (!Game.canSwap(curKey)) { showToast('아직 교체할 수 없습니다 (진영 도착 다음 턴부터 가능)'); return; }
    const cur = Game.currentPlayer();

    let bodyHTML = '<p style="margin-bottom:12px;font-family:var(--font-ko);font-size:12px;">인벤토리 ↔ 박스 이동할 아이템을 선택하세요.</p>';
    bodyHTML += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

    const mkList = (items, type) => {
      let h = `<div><b style="font-family:var(--font-px);font-size:8px;color:var(--c-sub)">${type === 'inv' ? 'INVENTORY' : 'BOX'}</b><div class="modal-item-list" style="margin-top:6px;">`;
      if (!items.length) h += '<div style="color:#666;font-size:11px;font-family:var(--font-ko)">비어 있음</div>';
      items.forEach((item, i) => {
        const sp = Sprites.get(item.name);
        const imgTag = sp ? `<img src="${sp.src}" alt="${item.name}">` : '';
        h += `<button class="modal-item-btn" data-type="${type}" data-idx="${i}">${imgTag}${item.name}</button>`;
      });
      h += '</div></div>';
      return h;
    };

    bodyHTML += mkList(cur.inventory, 'inv');
    bodyHTML += mkList(cur.box, 'box');
    bodyHTML += '</div>';

    showModal('아이템 교체', bodyHTML, [{ label:'닫기', cls:'btn-ghost', onClick:()=>{} }]);

    let selected = null;
    document.querySelectorAll('.modal-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!selected) {
          selected = { type: btn.dataset.type, idx: parseInt(btn.dataset.idx) };
          btn.style.borderColor = 'var(--c-gold)';
          document.getElementById('modal-body').insertAdjacentHTML('beforeend',
            `<p style="margin-top:10px;font-family:var(--font-ko);font-size:11px;color:var(--c-gold)">선택됨. 이동할 위치를 선택하세요 (반대 패널).</p>`);
        } else {
          const toType = btn.dataset.type;
          const toIdx  = parseInt(btn.dataset.idx);
          if (selected.type === toType) { selected = null; return; }
          hideModal();
          const r = Game.doSwap(selected.type, selected.idx, toType, toIdx);
          if (!r.ok) showToast('⚠ ' + r.msg);
          else { showToast('교체 완료!'); _updateHUD(); }
        }
      });
    });
  }

  /* ─── Joker flow ─── */
  function _openJokerModal() {
    const curKey = Game.currentKey();
    const cur    = Game.currentPlayer();
    if (!cur.hasJoker) { showToast('조커가 없습니다'); return; }
    if (Game.getState().turn.jokerUsed) { showToast('이미 조커를 사용했습니다'); return; }

    const buttons = [
      { label:'① 코어로 순간이동 (업그레이드 토큰 획득)', cls:'btn-primary', onClick:() => {
        const r = Game.doJoker(1);
        if (r.ok) { showToast('코어로 이동!'); _updateHUD(); }
      }},
      { label:'② 다른 플레이어 아이템 훔치기', cls:'btn-secondary', onClick:() => {
        _openStealModal();
      }},
      { label:'③ 이번 턴 2회 행동', cls:'btn-secondary', onClick:() => {
        const r = Game.doJoker(3);
        if (r.ok) { showToast('더블 액션!'); _updateHUD(); }
      }},
      { label:'취소', cls:'btn-ghost', onClick:()=>{} },
    ];

    showModal('조커 사용', '조커 효과를 선택하세요.', buttons);
  }

  function _openStealModal() {
    const state  = Game.getState();
    const curKey = Game.currentKey();
    let bodyHTML = '<div class="modal-item-list">';

    let hasAny = false;
    for (const [key, p] of Object.entries(state.players)) {
      if (key === curKey) continue;
      p.inventory.forEach((item, i) => {
        const sp = Sprites.get(item.name);
        const imgTag = sp ? `<img src="${sp.src}" alt="${item.name}">` : '';
        bodyHTML += `<button class="modal-item-btn" data-victim="${key}" data-idx="${i}">${imgTag}${p.displayName}의 ${item.name}</button>`;
        hasAny = true;
      });
    }
    bodyHTML += '</div>';

    if (!hasAny) { showToast('훔칠 아이템이 없습니다'); return; }

    showModal('아이템 훔치기', bodyHTML, [{ label:'취소', cls:'btn-ghost', onClick:()=>{} }]);

    document.querySelectorAll('.modal-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        hideModal();
        const r = Game.doJoker(2, { victimKey: btn.dataset.victim, itemIdx: parseInt(btn.dataset.idx) });
        if (!r.ok) showToast('⚠ ' + r.msg);
        else _updateHUD();
      });
    });
  }

  /* ─── End turn ─── */
  function _onEndTurn() {
    if (inMoveMode) _exitMoveMode();

    const result = Game.endTurn();
    if (!result) return;

    if (result.type === 'next-turn') {
      _updateHUD();
      showToast(`▶ ${Game.currentPlayer().displayName}의 턴`);
      _checkJokerNotice();
    }
  }

  function _checkJokerNotice() {
    const state = Game.getState();
    const curKey = Game.currentKey();
    if (state.players[curKey].hasJoker) {
      showToast('🃏 조커를 보유 중입니다!');
    }
  }

  /* ─── Round / Game end ─── */
  function _onRoundEnd({ winner, round, scores }) {
    const name = Game.CHAR_DEFS[winner].displayName;
    let bodyHTML = `<p>${name}가 라운드 ${round}을 완료했습니다!</p><br>`;
    bodyHTML += _scoresHTML(scores);

    const buttons = [{ label:'다음 라운드', cls:'btn-primary', onClick:() => {
      Game.nextRound();
      _updateHUD();
      showToast(`라운드 ${Game.getState().round} 시작!`);
    }}];
    showModal('라운드 종료!', bodyHTML, buttons);
  }

  function _onGameEnd({ winner, scores }) {
    const name = Game.CHAR_DEFS[winner].displayName;
    let bodyHTML = `<p>🏆 ${name}가 100G를 달성해 최종 우승했습니다!</p><br>`;
    bodyHTML += _scoresHTML(scores);

    goTo('result');
    document.getElementById('result-title').textContent = `${name} 우승!`;

    const lb = document.getElementById('leaderboard');
    lb.innerHTML = '';
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="lb-rank">${i+1}</span><span class="lb-name">${s.name}</span><span class="lb-gold">${s.gold}G</span>`;
      lb.appendChild(li);
    });

    const asriel = Sprites.get('Asriel_B');
    const resultEl = document.getElementById('result-asriel');
    if (asriel) { const img = document.createElement('img'); img.src = asriel.src; img.style.cssText='width:80px;height:80px;image-rendering:pixelated'; resultEl.innerHTML = ''; resultEl.appendChild(img); }
  }

  function _scoresHTML(scores) {
    return '<div style="display:flex;flex-direction:column;gap:6px">' +
      scores.map((s,i) => `<div style="font-family:var(--font-ko);font-size:12px">${i+1}위 ${s.name}: ${s.gold}G</div>`).join('') +
      '</div>';
  }

  /* ─── Button bindings ─── */
  function _bindAll() {
    // Generic goto buttons
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.goto));
    });

    // Mode select
    document.querySelectorAll('.mode-card').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        if (mode === 'online') {
          if (!Online.isConfigured()) {
            showModal(
              'Firebase 설정 필요',
              '<p>온라인 플레이를 위해 js/online.js의 FIREBASE_CONFIG에 Firebase 프로젝트 정보를 입력하세요.</p>',
              [{ label:'확인', cls:'btn-primary', onClick:()=>goTo('mode-select') }]
            );
          } else {
            goTo('online-entry');
          }
        } else {
          buildCharSelect();
          goTo('char-select');
        }
      });
    });

    // Char select start
    document.getElementById('btn-start-game').addEventListener('click', () => {
      if (!selectedChars.length) { showToast('진영을 선택하세요'); return; }
      startGame();
    });

    // Online room buttons
    document.getElementById('btn-create-room')?.addEventListener('click', async () => {
      const name = document.getElementById('online-name').value.trim() || 'Frisk';
      try {
        const code = await Online.createRoom(name, () => {});
        document.getElementById('lobby-code-display').textContent = code;
        goTo('lobby');
      } catch { showToast('방 만들기 실패 (Firebase 설정 확인)'); }
    });

    document.getElementById('btn-join-room')?.addEventListener('click', async () => {
      const name = document.getElementById('online-name').value.trim() || 'Frisk';
      const code = document.getElementById('online-code').value.trim().toUpperCase();
      if (!code) { showToast('코드를 입력하세요'); return; }
      try {
        await Online.joinRoom(code, name, () => {});
        document.getElementById('lobby-code-display').textContent = code;
        goTo('lobby');
      } catch (e) { showToast('참가 실패: ' + e.message); }
    });

    document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
      Online.leaveRoom();
      goTo('mode-select');
    });

    // Game action buttons
    document.getElementById('act-move').addEventListener('click', _enterMoveMode);
    document.getElementById('act-pickup').addEventListener('click', _openPickupModal);
    document.getElementById('act-upgrade').addEventListener('click', () => {
      if (Game.getState().turn.upgradeToken) _promptUpgrade();
    });
    document.getElementById('act-replace').addEventListener('click', _openSwapModal);
    document.getElementById('act-joker').addEventListener('click', _openJokerModal);
    document.getElementById('act-end-turn').addEventListener('click', _onEndTurn);

    // Modal backdrop click to close (only if no buttons required)
    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) hideModal();
    });
  }

  /* ─── Entry point ─── */
  async function main() {
    initStarfield();
    _bindAll();
    Online.init();

    // Load board data
    try {
      const res = await fetch('board_data.json');
      boardDataRaw = await res.json();
    } catch (e) {
      console.error('board_data.json 로드 실패:', e);
      showToast('⚠ board_data.json 로드 실패');
    }

    // Preload sprites
    await Sprites.preload();

    goTo('title');
  }

  document.addEventListener('DOMContentLoaded', main);
})();
