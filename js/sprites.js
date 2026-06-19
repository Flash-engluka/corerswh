/* sprites.js — Image preloading */
const Sprites = (() => {
  const BASE_CHAR = 'assets/sprites/characters/';
  const BASE_ITEM = 'assets/sprites/items/';
  const BASE_ASR  = 'assets/sprites/asriel/';

  const CHAR_FILES = {
    'Toriel':              BASE_CHAR + 'Toriel.png',
    'Papyrus':             BASE_CHAR + 'Papyrus.png',
    'Undyne':              BASE_CHAR + 'Undyne.png',
    'Pre-Undying':         BASE_CHAR + 'Pre Undying.png',
    'Undyne the Undying':  BASE_CHAR + 'Undyne the Undying.png',
    'Mettaton':            BASE_CHAR + 'Mettaton.png',
    'Mettaton EX':         BASE_CHAR + 'Mettaton EX.png',
    'Mettaton NEO':        BASE_CHAR + 'Mettaton NEO.png',
    'Mettaton NEO + Alphys': BASE_CHAR + 'Mettaton NEO.png',
    'Alphys':              BASE_CHAR + 'Alphys.png',
  };

  const ITEM_FILES = {
    'Froggit':       BASE_ITEM + 'Froggit.png',
    'Final Froggit': BASE_ITEM + 'Final Froggit.png',
    'Whimsun':       BASE_ITEM + 'Whimsun.png',
    'Whimsalot':     BASE_ITEM + 'Whimsalot.png',
    'Lesser Dog':    BASE_ITEM + 'Lesser Dog.png',
    'Greater Dog':   BASE_ITEM + 'Greater Dog.png',
    'Moldsmal':      BASE_ITEM + 'Moldsmal.png',
    'Moldbygg':      BASE_ITEM + 'Moldbygg.png',
    'Napstablook':   BASE_ITEM + 'Napstablook.png',
    'Sans':          BASE_ITEM + 'Sans.png',
    'Flowey':        BASE_ITEM + 'Flowey.png',
    'Asgore':        BASE_ITEM + 'Asgore.png',
    'Monster Kid':   BASE_ITEM + 'Kid.png',
    'Joker':         null,
  };

  const cache = {};
  let loadedCount = 0;
  let totalCount = 0;

  function loadOne(name, src) {
    if (!src) { cache[name] = null; return Promise.resolve(); }
    totalCount++;
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { cache[name] = img; loadedCount++; resolve(); };
      img.onerror = () => { cache[name] = null; loadedCount++; resolve(); };
      img.src = src;
    });
  }

  function preload() {
    const promises = [];
    for (const [name, src] of Object.entries(CHAR_FILES)) promises.push(loadOne(name, src));
    for (const [name, src] of Object.entries(ITEM_FILES)) promises.push(loadOne(name, src));
    // Asriel
    promises.push(loadOne('Asriel_B', BASE_ASR + 'Asriel_B.gif'));
    return Promise.all(promises);
  }

  function get(name) { return cache[name] || null; }

  return { preload, get };
})();
