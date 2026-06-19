/* game.js — Core game state & rules engine */

const Game = (() => {

  /* ─── Character definitions ─── */
  const CHAR_DEFS = {
    toriel:   { faction:'RUINS',     displayName:'Toriel',   tiers:['Toriel'] },
    papyrus:  { faction:'SNOWDIN',   displayName:'Papyrus',  tiers:['Papyrus'] },
    undyne:   { faction:'WATERFALL', displayName:'Undyne',   tiers:['Undyne','Pre-Undying','Undyne the Undying'] },
    mettaton: { faction:'HOTLAND',   displayName:'Mettaton', tiers:['Mettaton','Mettaton EX','Mettaton NEO','Mettaton NEO + Alphys'] },
  };

  /* ─── To-do list per faction ─── */
  const TODOS = {
    RUINS: [
      { text:'파이널 프로깃 2개 획득',   check:(p) => countInv(p,'Final Froggit') >= 2 },
      { text:'윔삿 2개 획득',            check:(p) => countInv(p,'Whimsalot') >= 2 },
      { text:'Napstablook 데려오기',      check:(p) => hasInv(p,'Napstablook') },
    ],
    SNOWDIN: [
      { text:'그레이터 독 3개 획득',      check:(p) => countInv(p,'Greater Dog') >= 3 },
      { text:'Sans 데려오기',             check:(p) => hasInv(p,'Sans') },
      { text:'Flowey 데려오기',           check:(p) => hasInv(p,'Flowey') },
    ],
    WATERFALL: [
      { text:'몰드바그 2개 획득',         check:(p) => countInv(p,'Moldbygg') >= 2 },
      { text:'Undyne the Undying 달성',   check:(p) => p.charTier >= 2 },
      { text:'Asgore 데려오기',           check:(p) => hasInv(p,'Asgore') },
    ],
    HOTLAND: [
      { text:'Mettaton NEO 달성',         check:(p) => p.charTier >= 2 },
      { text:'Alphys 부르기',             check:(p) => p.charTier >= 3 },
      { text:'Monster Kid 데려오기',      check:(p) => hasInv(p,'Monster Kid') },
    ],
  };

  /* ─── Item upgrade map ─── */
  const UPGRADES = {
    'Froggit':    'Final Froggit',
    'Whimsun':    'Whimsalot',
    'Lesser Dog': 'Greater Dog',
    'Moldsmal':   'Moldbygg',
  };

  /* ─── Character pickup rights ─── */
  const PICKUP_RIGHTS = {
    toriel:   { regular:['Froggit','Whimsun'],    special:['Napstablook'] },
    papyrus:  { regular:['Lesser Dog'],           special:['Sans','Flowey'] },
    undyne:   { regular:['Moldsmal'],             special:['Asgore'] },
    mettaton: { regular:[],                       special:['Monster Kid'] },
  };

  /* ─── State ─── */
  let boardData = null;
  let state = null;

  /* ─── Helpers ─── */
  function countInv(p, name) {
    return [...p.inventory, ...p.box].filter(i => i.name === name).length;
  }
  function hasInv(p, name) {
    return [...p.inventory, ...p.box].some(i => i.name === name);
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ─── Init ─── */
  function init(bd, selectedChars) {
    // selectedChars: array of charKeys in player order (length 1–4)
    boardData = bd;

    const playerKeys = selectedChars.length ? selectedChars : Object.keys(CHAR_DEFS);
    const players = {};
    for (const key of playerKeys) {
      const def = CHAR_DEFS[key];
      players[key] = {
        charKey:   key,
        faction:   def.faction,
        displayName: def.displayName,
        charTier:  0,
        gold:      0,
        inventory: [],
        box:       [],
        position:  def.faction,
        todoStatus: TODOS[def.faction].map(() => false),
        hasJoker:  false,
        sansFloweyBonus: false,
      };
    }

    const turnOrder = shuffle([...playerKeys]);

    // Deep-copy board items from boardData
    const boardItems = {};
    for (const [id, node] of Object.entries(bd.nodes)) {
      boardItems[id] = node.items ? node.items.map(i => ({ ...i })) : [];
    }

    state = {
      players,
      turnOrder,
      turnIdx: 0,
      round: 1,
      boardItems,
      phase: 'playing',
      turn: {
        actionDone: false,
        upgradeToken: false,
        swapDone: false,
        jokerUsed: false,
        extraAction: false,
        actionsLeft: 1,
      },
    };

    _startRound();
    return state;
  }

  function _startRound() {
    // All players +15G
    for (const p of Object.values(state.players)) p.gold += 15;

    // Assign joker to random player
    const holder = randomChoice(state.turnOrder);
    for (const p of Object.values(state.players)) p.hasJoker = false;
    state.players[holder].hasJoker = true;
    state.jokerHolder = holder;

    _emit('round-start', { round: state.round, jokerHolder: holder });
  }

  /* ─── Queries ─── */
  function getState()  { return state; }
  function getPlayer(key) { return state.players[key]; }
  function currentKey()   { return state.turnOrder[state.turnIdx]; }
  function currentPlayer(){ return state.players[currentKey()]; }

  function getAdjacent(pos) {
    const node = boardData.nodes[pos];
    return node ? node.adj : [];
  }

  function canPickupAt(charKey, cellId) {
    const items = state.boardItems[cellId] || [];
    const rights = PICKUP_RIGHTS[charKey];
    return items.filter(item => {
      if (item.picked) return false;
      if (item.type === 'regular') return rights.regular.includes(item.name);
      if (item.type === 'special') return item.owner === charKey;
      return false;
    });
  }

  function isAtOwnFaction(charKey) {
    const p = state.players[charKey];
    return p.position === p.faction;
  }

  function canSwap(charKey) {
    const p = state.players[charKey];
    return p.position === p.faction && p.canSwap && !state.turn.swapDone;
  }

  function canUpgradeChar(charKey) {
    const p = state.players[charKey];
    const def = CHAR_DEFS[charKey];
    return p.charTier < def.tiers.length - 1;
  }

  function canUpgradeItem(charKey) {
    const p = state.players[charKey];
    return p.inventory.some(i => UPGRADES[i.name]);
  }

  function upgradableItems(charKey) {
    const p = state.players[charKey];
    return p.inventory
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => UPGRADES[item.name]);
  }

  /* ─── Actions ─── */
  function doMove(toCell) {
    const key = currentKey();
    const p   = currentPlayer();

    if (state.turn.actionDone && !state.turn.extraAction) return { ok:false, msg:'이미 행동했습니다' };

    const adj = getAdjacent(p.position);
    if (!adj.includes(toCell)) return { ok:false, msg:'이동할 수 없는 칸입니다' };

    const prevPos = p.position;
    p.position = toCell;

    // Arriving at own faction: allow swap from NEXT turn
    if (toCell === p.faction) {
      p.canSwap = false;      // must wait one turn
      p._arrivedFaction = true;
    } else {
      p._arrivedFaction = false;
    }

    // Leaving Core: grant upgrade token
    if (prevPos === 'CORE') {
      state.turn.upgradeToken = true;
      _emit('upgrade-token', { player: key });
    }

    // Arrived at Core
    if (toCell === 'CORE') {
      _emit('arrived-core', { player: key });
    }

    // Reveal items at this cell if hidden
    const cellItems = state.boardItems[toCell] || [];
    let revealed = false;
    for (const item of cellItems) {
      if (item.hidden && !item.picked) { item.hidden = false; revealed = true; }
    }
    if (revealed) _emit('items-revealed', { cell: toCell });

    state.turn.actionDone = true;
    if (state.turn.extraAction) state.turn.extraAction = false;

    _emit('moved', { player: key, from: prevPos, to: toCell });
    _checkAutoTodo(key);
    return { ok:true };
  }

  function doPickup(cellId, itemIdx) {
    const key = currentKey();
    const p   = currentPlayer();

    if (state.turn.actionDone && !state.turn.extraAction) return { ok:false, msg:'이미 행동했습니다' };
    if (p.position !== cellId) return { ok:false, msg:'해당 칸에 있지 않습니다' };
    if (p.inventory.length >= 8) return { ok:false, msg:'인벤토리가 가득 찼습니다' };

    const cellItems = state.boardItems[cellId] || [];
    const available = canPickupAt(key, cellId);
    if (itemIdx >= available.length) return { ok:false, msg:'아이템이 없습니다' };

    const target = available[itemIdx];

    // Special item: pay gold
    if (target.type === 'special') {
      if (p.gold < target.cost) return { ok:false, msg:'골드가 부족합니다' };
      p.gold -= target.cost;
      _emitGold(key, -target.cost);
    }

    // Remove from board (mark picked)
    const boardIdx = cellItems.indexOf(target);
    if (boardIdx !== -1) cellItems.splice(boardIdx, 1);

    p.inventory.push({ name: target.name, type: target.type });

    state.turn.actionDone = true;
    if (state.turn.extraAction) state.turn.extraAction = false;

    _emit('item-picked', { player: key, item: target.name, cell: cellId });
    _checkSansFloweyBonus(key);
    _checkAutoTodo(key);
    return { ok:true, item: target.name };
  }

  function doUpgrade(target, itemIdx) {
    // target: 'char' | 'item'
    const key = currentKey();
    const p   = currentPlayer();

    if (!state.turn.upgradeToken) return { ok:false, msg:'업그레이드 토큰이 없습니다' };

    if (target === 'char') {
      if (!canUpgradeChar(key)) return { ok:false, msg:'더 이상 업그레이드할 수 없습니다' };
      p.charTier++;
      state.turn.upgradeToken = false;
      const tierName = CHAR_DEFS[key].tiers[p.charTier];
      _emit('char-upgraded', { player: key, tier: p.charTier, tierName });
      _checkAutoTodo(key);
      return { ok:true, msg: `${tierName}으로 업그레이드!` };
    }

    if (target === 'item') {
      const upgradable = upgradableItems(key);
      if (itemIdx >= upgradable.length) return { ok:false, msg:'업그레이드 가능한 아이템이 없습니다' };
      const { item, idx } = upgradable[itemIdx];
      const newName = UPGRADES[item.name];
      p.inventory[idx] = { name: newName, type: 'regular' };
      state.turn.upgradeToken = false;
      _emit('item-upgraded', { player: key, from: item.name, to: newName });
      _checkAutoTodo(key);
      return { ok:true, msg: `${item.name} → ${newName}!` };
    }

    // Skip (lose token)
    state.turn.upgradeToken = false;
    return { ok:true, msg:'업그레이드 건너뜀' };
  }

  function doSkipUpgrade() {
    state.turn.upgradeToken = false;
    return { ok:true };
  }

  function doSwap(fromType, fromIdx, toType, toIdx) {
    // fromType/toType: 'inv' | 'box'
    const key = currentKey();
    const p   = currentPlayer();

    if (!canSwap(key)) return { ok:false, msg:'교체할 수 없습니다' };

    const src  = fromType === 'inv' ? p.inventory : p.box;
    const dst  = toType   === 'inv' ? p.inventory : p.box;

    if (toIdx === -1) {
      // Move item from src to dst (append)
      if (dst.length >= 8) return { ok:false, msg:'슬롯이 가득 찼습니다' };
      const [item] = src.splice(fromIdx, 1);
      dst.push(item);
    } else {
      // Swap two items
      const a = src[fromIdx];
      const b = dst[toIdx];
      src[fromIdx] = b;
      dst[toIdx]   = a;
    }

    state.turn.swapDone = true;
    _emit('swapped', { player: key });
    _checkAutoTodo(key);
    return { ok:true };
  }

  function doJoker(effect, extra) {
    const key = currentKey();
    const p   = currentPlayer();

    if (!p.hasJoker) return { ok:false, msg:'조커가 없습니다' };
    if (state.turn.jokerUsed) return { ok:false, msg:'이미 조커를 사용했습니다' };

    p.hasJoker = false;
    state.turn.jokerUsed = true;

    if (effect === 1) {
      // Move to Core immediately
      const prevPos = p.position;
      p.position = 'CORE';
      state.turn.upgradeToken = true;
      state.turn.actionDone = true;
      _emit('joker-core', { player: key, from: prevPos });
      _emit('upgrade-token', { player: key });
      return { ok:true };
    }

    if (effect === 2) {
      // Steal item from another player
      const { victimKey, itemIdx } = extra;
      const victim = state.players[victimKey];
      if (!victim || itemIdx >= victim.inventory.length) return { ok:false, msg:'대상이 없습니다' };
      if (p.inventory.length >= 8) return { ok:false, msg:'인벤토리가 가득 찼습니다' };
      const [stolen] = victim.inventory.splice(itemIdx, 1);
      p.inventory.push(stolen);
      _emit('joker-steal', { player: key, victim: victimKey, item: stolen.name });
      _checkSansFloweyBonus(key);
      _checkAutoTodo(key);
      return { ok:true };
    }

    if (effect === 3) {
      // Double turn — get one extra main action this turn
      state.turn.actionDone = false;
      state.turn.extraAction = true;
      _emit('joker-double', { player: key });
      return { ok:true };
    }

    return { ok:false, msg:'잘못된 조커 효과' };
  }

  function endTurn() {
    const key = currentKey();
    const p   = currentPlayer();

    // If arrived at faction last turn, now can swap
    if (p._arrivedFaction) {
      p.canSwap = true;
      p._arrivedFaction = false;
    }

    // Discard upgrade token if unused
    state.turn.upgradeToken = false;

    // Check to-do completion for round end
    _checkAutoTodo(key);
    const roundResult = _checkRoundEnd();
    if (roundResult) return roundResult;

    // Advance turn
    state.turnIdx = (state.turnIdx + 1) % state.turnOrder.length;
    state.turn = {
      actionDone: false,
      upgradeToken: false,
      swapDone: false,
      jokerUsed: false,
      extraAction: false,
      actionsLeft: 1,
    };
    _emit('turn-end', { player: key, nextPlayer: currentKey() });
    return { ok:true, type:'next-turn' };
  }

  /* ─── To-do & scoring ─── */
  function _checkAutoTodo(key) {
    const p = state.players[key];
    const todos = TODOS[p.faction];
    let changed = false;
    for (let i = 0; i < todos.length; i++) {
      if (!p.todoStatus[i] && todos[i].check(p)) {
        p.todoStatus[i] = true;
        p.gold += 5;
        changed = true;
        _emitGold(key, 5);
        _emit('todo-done', { player: key, todoIdx: i, text: todos[i].text });
      }
    }
    return changed;
  }

  function _checkSansFloweyBonus(key) {
    const p = state.players[key];
    if (key !== 'papyrus' || p.sansFloweyBonus) return;
    if (hasInv(p,'Sans') && hasInv(p,'Flowey')) {
      p.gold += 2;
      p.sansFloweyBonus = true;
      _emitGold(key, 2);
      _emit('sans-flowey-bonus', { player: key });
    }
  }

  function _checkRoundEnd() {
    const key = currentKey();
    const p   = state.players[key];
    if (p.todoStatus.every(Boolean)) {
      // Round won by this player
      const gameEnd = _checkGameEnd();
      if (gameEnd) {
        state.phase = 'game-end';
        _emit('game-end', { winner: key, scores: _scores() });
        return { ok:true, type:'game-end', winner: key };
      }
      state.phase = 'round-end';
      _emit('round-end', { winner: key, round: state.round, scores: _scores() });
      return { ok:true, type:'round-end', winner: key };
    }
    return null;
  }

  function _checkGameEnd() {
    for (const p of Object.values(state.players)) {
      if (p.gold >= 100) return true;
    }
    return false;
  }

  function _scores() {
    return Object.entries(state.players)
      .map(([k,p]) => ({ key:k, name:p.displayName, gold:p.gold, faction:p.faction }))
      .sort((a,b) => b.gold - a.gold);
  }

  /* ─── Round reset ─── */
  function nextRound() {
    // Keep only gold; reset everything else
    for (const p of Object.values(state.players)) {
      p.charTier = 0;
      p.inventory = [];
      p.box = [];
      p.position = p.faction;
      p.todoStatus = TODOS[p.faction].map(() => false);
      p.hasJoker = false;
      p.sansFloweyBonus = false;
      p.canSwap = false;
      p._arrivedFaction = false;
    }

    // Respawn board items
    const bd = boardData;
    for (const [id, node] of Object.entries(bd.nodes)) {
      state.boardItems[id] = node.items ? node.items.map(i => ({ ...i })) : [];
    }

    state.round++;
    state.turnIdx = (state.turnIdx + 1) % state.turnOrder.length; // next player starts
    state.phase = 'playing';
    state.turn = { actionDone:false, upgradeToken:false, swapDone:false, jokerUsed:false, extraAction:false, actionsLeft:1 };

    _startRound();
  }

  /* ─── Event bus ─── */
  const listeners = {};
  function on(event, fn)   { (listeners[event] = listeners[event] || []).push(fn); }
  function off(event, fn)  { listeners[event] = (listeners[event]||[]).filter(f=>f!==fn); }
  function _emit(event, data) {
    (listeners[event]||[]).forEach(fn => fn(data));
    (listeners['*']||[]).forEach(fn => fn(event, data));
  }
  function _emitGold(player, amount) { _emit('gold-changed', { player, amount }); }

  return {
    init, getState, getPlayer, currentKey, currentPlayer,
    getAdjacent, canPickupAt, isAtOwnFaction, canSwap,
    canUpgradeChar, canUpgradeItem, upgradableItems,
    doMove, doPickup, doUpgrade, doSkipUpgrade, doSwap, doJoker, endTurn,
    nextRound, on, off,
    CHAR_DEFS, TODOS, UPGRADES, PICKUP_RIGHTS,
  };
})();
