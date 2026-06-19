/* online.js — Firebase Realtime Database integration (stub) */

const Online = (() => {
  // Replace these placeholder values with your Firebase project config
  const FIREBASE_CONFIG = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT.firebaseapp.com",
    databaseURL:       "YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId:         "YOUR_PROJECT",
    storageBucket:     "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID",
  };

  let db = null;
  let roomRef = null;
  let myUid = null;
  let myName = '';
  let currentRoomCode = null;

  function _isConfigured() {
    return FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
  }

  function init() {
    if (!_isConfigured()) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      return false;
    }
  }

  function _genCode() {
    return Math.random().toString(36).substr(2,4).toUpperCase();
  }
  function _genUid() {
    return Math.random().toString(36).substr(2,9);
  }

  function createRoom(name, onUpdate) {
    if (!_isConfigured()) return Promise.reject('firebase-not-configured');
    myName = name;
    myUid  = _genUid();
    const code = _genCode();
    currentRoomCode = code;
    const room = {
      host: myUid,
      players: {
        [myUid]: { name, character: null, gold: 0, ready: false }
      },
      gameState: { phase: 'waiting', currentTurn: 0, round: 1, boardItems: {}, logs: [] },
    };
    roomRef = db.ref(`rooms/${code}`);
    return roomRef.set(room).then(() => {
      roomRef.on('value', snap => onUpdate(code, snap.val()));
      return code;
    });
  }

  function joinRoom(code, name, onUpdate) {
    if (!_isConfigured()) return Promise.reject('firebase-not-configured');
    myName = name;
    myUid  = _genUid();
    currentRoomCode = code;
    roomRef = db.ref(`rooms/${code}`);
    return roomRef.once('value').then(snap => {
      const room = snap.val();
      if (!room) throw new Error('room-not-found');
      const players = Object.values(room.players || {});
      if (players.length >= 4) throw new Error('room-full');
      return roomRef.child(`players/${myUid}`).set({ name, character: null, gold: 0, ready: false });
    }).then(() => {
      roomRef.on('value', snap => onUpdate(code, snap.val()));
    });
  }

  function leaveRoom() {
    if (roomRef && myUid) {
      roomRef.child(`players/${myUid}`).remove();
      roomRef.off();
    }
    roomRef = null;
    currentRoomCode = null;
  }

  function getRoomCode() { return currentRoomCode; }
  function isConfigured() { return _isConfigured(); }

  return { init, createRoom, joinRoom, leaveRoom, getRoomCode, isConfigured };
})();
