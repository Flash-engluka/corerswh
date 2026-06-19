/* board.js — Canvas board rendering & movement */

const Board = (() => {
  let canvas, ctx, boardData;
  let bgImage = null;
  let highlightedCells = [];
  let animFrame = null;
  let onCellClick = null;  // callback(cellId)
  let scale = 1;
  let offsetX = 0, offsetY = 0;
  let drawW = 0, drawH = 0;

  /* ─── Zone colors ─── */
  const ZONE_COLORS = {
    RUINS:     '#ff0000',
    HOTLAND:   '#fbff00',
    SNOWDIN:   '#0099ff',
    WATERFALL: '#15ff00',
    CORE:      '#9080dc',
    zone1:'#cc88ff', zone2:'#cc88ff', zone3:'#cc88ff',
    zone4:'#cc88ff', zone5:'#cc88ff', zone6:'#cc88ff',
    zone7:'#cc88ff', zone8:'#cc88ff', zone9:'#cc88ff', zone10:'#cc88ff',
  };

  const FACTION_COLORS = { RUINS:'#ff0000', HOTLAND:'#fbff00', SNOWDIN:'#0099ff', WATERFALL:'#15ff00' };

  function init(canvasEl, bd) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    boardData = bd;

    bgImage = new Image();
    bgImage.src = 'assets/board/Core_X_Board_source.png';
    bgImage.onload = () => render();

    canvas.addEventListener('click', _handleClick);
    canvas.addEventListener('touchend', _handleTouch);

    _resize();
    window.addEventListener('resize', _resize);
    animFrame = requestAnimationFrame(_loop);
  }

  function destroy() {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('resize', _resize);
  }

  function _resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
    _calcTransform();
  }

  function _calcTransform() {
    if (!bgImage || !bgImage.naturalWidth) return;
    const iw = bgImage.naturalWidth;
    const ih = bgImage.naturalHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    scale = Math.min(cw / iw, ch / ih);
    drawW = iw * scale;
    drawH = ih * scale;
    offsetX = (cw - drawW) / 2;
    offsetY = (ch - drawH) / 2;
  }

  function _loop() {
    render();
    animFrame = requestAnimationFrame(_loop);
  }

  /* ─── Coordinate helpers ─── */
  function nodeToCanvas(node) {
    return {
      x: offsetX + node.x * drawW,
      y: offsetY + node.y * drawH,
    };
  }

  function nodeRadius() {
    return Math.max(8, drawW * 0.018);
  }

  /* ─── Main render ─── */
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgImage && bgImage.complete && bgImage.naturalWidth) {
      _calcTransform();
      ctx.drawImage(bgImage, offsetX, offsetY, drawW, drawH);
    } else {
      ctx.fillStyle = '#1a0030';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    _drawEdges();
    _drawNodes();
    _drawTokens();
  }

  function _drawEdges() {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,150,255,0.35)';
    ctx.lineWidth   = Math.max(1, drawW * 0.005);
    const visited = new Set();
    for (const [id, node] of Object.entries(boardData.nodes)) {
      const a = nodeToCanvas(node);
      for (const adjId of node.adj) {
        const key = [id,adjId].sort().join('-');
        if (visited.has(key)) continue;
        visited.add(key);
        const bn = boardData.nodes[adjId];
        if (!bn) continue;
        const b = nodeToCanvas(bn);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function _drawNodes() {
    const r = nodeRadius();
    const state = (typeof Game !== 'undefined') ? Game.getState() : null;

    for (const [id, node] of Object.entries(boardData.nodes)) {
      const { x, y } = nodeToCanvas(node);
      const zColor = ZONE_COLORS[node.zone] || '#888';
      const isHighlighted = highlightedCells.includes(id);

      ctx.save();

      // Shadow / glow for highlighted
      if (isHighlighted) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur  = 12;
      }

      // Circle fill
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);

      if (node.isCore) {
        ctx.fillStyle = '#9080dc';
        ctx.fill();
        ctx.strokeStyle = '#c0aaff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (node.isFaction) {
        ctx.fillStyle = zColor;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (node.isCoreGate) {
        ctx.fillStyle = '#4a3080';
        ctx.fill();
        ctx.strokeStyle = '#9080dc';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20,0,40,0.75)';
        ctx.fill();
        ctx.strokeStyle = isHighlighted ? '#ffee00' : (zColor + '99');
        ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
        ctx.stroke();
      }

      ctx.restore();

      // Highlight ring
      if (isHighlighted) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4,3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Label
      const label = node.isCore ? 'C' : node.isFaction ? id.slice(0,2) : id;
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(7, r * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.9;
      ctx.fillText(label, x, y);
      ctx.restore();

      // Item dot indicator
      _drawItemDots(id, x, y, r);
    }
  }

  function _drawItemDots(id, cx, cy, r) {
    const state = (typeof Game !== 'undefined') ? Game.getState() : null;
    if (!state) return;
    const items = (state.boardItems[id] || []).filter(i => !i.picked);
    if (!items.length) return;

    const visible = items.filter(i => !i.hidden);
    const hidden  = items.filter(i =>  i.hidden);

    let dotIdx = 0;
    const dotR = Math.max(3, r * 0.28);
    const spacing = dotR * 2.5;
    const total = Math.min(items.length, 4);
    const startX = cx - ((total - 1) * spacing) / 2;

    for (let i = 0; i < Math.min(visible.length, 4); i++) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(startX + dotIdx * spacing, cy - r - dotR - 2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = visible[i].type === 'special' ? '#f5c842' : '#aaffaa';
      ctx.fill();
      ctx.restore();
      dotIdx++;
    }
    for (let i = 0; i < Math.min(hidden.length, 4 - visible.length); i++) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(startX + dotIdx * spacing, cy - r - dotR - 2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#888';
      ctx.fill();
      ctx.restore();
      dotIdx++;
    }
  }

  function _drawTokens() {
    const state = (typeof Game !== 'undefined') ? Game.getState() : null;
    if (!state) return;

    const r = nodeRadius();
    const tokenR = Math.max(6, r * 0.55);
    const factionKeys = Object.keys(FACTION_COLORS);

    // Group players by position for offset
    const byPos = {};
    for (const [key, p] of Object.entries(state.players)) {
      (byPos[p.position] = byPos[p.position] || []).push(key);
    }

    for (const [pos, keys] of Object.entries(byPos)) {
      const node = boardData.nodes[pos];
      if (!node) continue;
      const { x, y } = nodeToCanvas(node);
      const n = keys.length;

      keys.forEach((key, i) => {
        const p = state.players[key];
        const fColor = FACTION_COLORS[p.faction] || '#fff';
        const isCurrent = key === Game.currentKey();

        // Offset tokens if multiple players on same cell
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const dist  = n > 1 ? tokenR * 1.5 : 0;
        const tx = x + Math.cos(angle) * dist;
        const ty = y + Math.sin(angle) * dist;

        ctx.save();

        if (isCurrent) {
          ctx.shadowColor = fColor;
          ctx.shadowBlur  = 14;
        }

        // Token circle
        ctx.beginPath();
        ctx.arc(tx, ty, tokenR, 0, Math.PI * 2);
        ctx.fillStyle = fColor;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.strokeStyle = isCurrent ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = isCurrent ? 2 : 1;
        ctx.globalAlpha = 1;
        ctx.stroke();

        // Character sprite inside token
        const sprite = Sprites.get(Game.CHAR_DEFS[key].tiers[p.charTier]);
        if (sprite) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(tx, ty, tokenR - 1, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(sprite, tx - tokenR, ty - tokenR, tokenR * 2, tokenR * 2);
          ctx.restore();
        }

        ctx.restore();
      });
    }
  }

  /* ─── Highlight API ─── */
  function highlight(cellIds) { highlightedCells = cellIds || []; }
  function clearHighlight()   { highlightedCells = []; }

  /* ─── Click handling ─── */
  function setClickHandler(fn) { onCellClick = fn; }

  function _handleClick(e) {
    const rect = canvas.getBoundingClientRect();
    _processClick(e.clientX - rect.left, e.clientY - rect.top);
  }
  function _handleTouch(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const t = e.changedTouches[0];
    _processClick(t.clientX - rect.left, t.clientY - rect.top);
  }

  function _processClick(cx, cy) {
    if (!highlightedCells.length || !onCellClick) return;
    const r = nodeRadius();
    const hitR = r + 8;
    let best = null, bestDist = Infinity;

    for (const id of highlightedCells) {
      const node = boardData.nodes[id];
      if (!node) continue;
      const { x, y } = nodeToCanvas(node);
      const d = Math.hypot(cx - x, cy - y);
      if (d < hitR && d < bestDist) { best = id; bestDist = d; }
    }
    if (best) onCellClick(best);
  }

  return { init, destroy, highlight, clearHighlight, setClickHandler, render };
})();
