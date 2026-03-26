'use strict';

const http = require('http');

// ── 牌靴逻辑（从 lucky7.js 提取）──────────────────────────
function initDeck() {
  const deck = {};
  for (let v = 1; v <= 9; v++) deck[v] = 32;
  deck[0] = 128;
  return deck;
}

function totalCards(deck) {
  return Object.values(deck).reduce((s, c) => s + c, 0);
}

function handTotal(cards) {
  return cards.reduce((s, c) => s + c, 0) % 10;
}

// ── 精确枚举计算（替代蒙特卡洛）────────────────────────────
function calculateProbability(deck) {
  const d = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) d[v] = deck[v] || 0;
  const N = d.reduce((a, b) => a + b, 0);
  if (N < 6) return null;

  let ev4 = 0, ev5 = 0, ev6 = 0;
  let evNatural7 = 0, evThree7 = 0, evCombo = 0;
  let prob4 = 0, prob5 = 0, prob6 = 0;
  let probNatural7 = 0, probThree7 = 0, probCombo = 0;
  let probBanker6Two = 0, evBanker6Two = 0;   // 庄2张6点赢，赔22倍
  let probBanker6Three = 0, evBanker6Three = 0; // 庄3张6点赢，赔50倍
  let evBanker6Combo = 0, probBanker6Combo = 0; // 庄6点赢组合（2张×12 + 3张×20）

  function bankerDraws(bTot, p3) {
    switch (bTot) {
      case 0: case 1: case 2: return true;
      case 3: return p3 !== 8;
      case 4: return p3 >= 2 && p3 <= 7;
      case 5: return p3 >= 4 && p3 <= 7;
      case 6: return p3 === 6 || p3 === 7;
      default: return false;
    }
  }

  // 精确枚举发牌顺序：P1, B1, P2, B2, [P3], [B3]
  // d 数组随枚举实时增减，每层循环末尾还原
  for (let p1 = 0; p1 <= 9; p1++) {
    if (!d[p1]) continue;
    const w1 = d[p1] / N; d[p1]--;

    for (let b1 = 0; b1 <= 9; b1++) {
      if (!d[b1]) continue;
      const w2 = w1 * d[b1] / (N-1); d[b1]--;

      for (let p2 = 0; p2 <= 9; p2++) {
        if (!d[p2]) continue;
        const w3 = w2 * d[p2] / (N-2); d[p2]--;

        for (let b2 = 0; b2 <= 9; b2++) {
          if (!d[b2]) continue;
          const w4 = w3 * d[b2] / (N-3); d[b2]--;

          const pT = (p1 + p2) % 10;
          const bT = (b1 + b2) % 10;

          if (pT >= 8 || bT >= 8) {
            // 天牌，4张结局
            if (pT === 7 && bT === 6) { prob4 += w4; ev4 += w4 * 30; }
            if (pT === 7 && pT > bT)  { probNatural7 += w4; evNatural7 += w4 * 15; probCombo += w4; evCombo += w4 * 6; }
            // 庄2张6点赢（天牌时庄闲都是2张）
            if (bT === 6 && bT > pT)  { probBanker6Two += w4; evBanker6Two += w4 * 22; probBanker6Combo += w4; evBanker6Combo += w4 * 12; }
          } else if (pT >= 6) {
            // 闲站
            if (bT <= 5) {
              // 庄补一张，5张结局
              for (let b3 = 0; b3 <= 9; b3++) {
                if (!d[b3]) continue;
                const w5 = w4 * d[b3] / (N-4);
                const bT3 = (bT + b3) % 10;
                if (pT === 7 && bT3 === 6) { prob5 += w5; ev5 += w5 * 40; }
                if (pT === 7 && pT > bT3)  { probNatural7 += w5; evNatural7 += w5 * 15; probCombo += w5; evCombo += w5 * 6; }
                // 庄3张6点赢（闲2张站，庄3张）
                if (bT3 === 6 && bT3 > pT) { probBanker6Three += w5; evBanker6Three += w5 * 50; probBanker6Combo += w5; evBanker6Combo += w5 * 20; }
              }
            } else {
              // 庄站，4张结局（pT=6或7，bT=6或7）
              if (pT === 7 && bT === 6) { prob4 += w4; ev4 += w4 * 30; }
              if (pT === 7 && pT > bT)  { probNatural7 += w4; evNatural7 += w4 * 15; probCombo += w4; evCombo += w4 * 6; }
              // 庄2张6点赢
              if (bT === 6 && bT > pT)  { probBanker6Two += w4; evBanker6Two += w4 * 22; probBanker6Combo += w4; evBanker6Combo += w4 * 12; }
            }
          } else {
            // 闲补第三张
            for (let p3 = 0; p3 <= 9; p3++) {
              if (!d[p3]) continue;
              const w5 = w4 * d[p3] / (N-4); d[p3]--;
              const pT3 = (pT + p3) % 10;

              if (bankerDraws(bT, p3)) {
                // 庄补第三张，6张结局
                for (let b3 = 0; b3 <= 9; b3++) {
                  if (!d[b3]) continue;
                  const w6 = w5 * d[b3] / (N-5);
                  const bT3 = (bT + b3) % 10;
                  if (pT3 === 7 && bT3 === 6) { prob6 += w6; ev6 += w6 * 100; }
                  if (pT3 === 7 && pT3 > bT3) { probThree7 += w6; evThree7 += w6 * 30; probCombo += w6; evCombo += w6 * 15; }
                  // 庄3张6点赢
                  if (bT3 === 6 && bT3 > pT3) { probBanker6Three += w6; evBanker6Three += w6 * 50; probBanker6Combo += w6; evBanker6Combo += w6 * 20; }
                }
              } else {
                // 庄站，5张结局（闲3张，庄2张）
                if (pT3 === 7 && bT === 6) { prob5 += w5; ev5 += w5 * 40; }
                if (pT3 === 7 && pT3 > bT)  { probThree7 += w5; evThree7 += w5 * 30; probCombo += w5; evCombo += w5 * 15; }
                // 庄2张6点赢
                if (bT === 6 && bT > pT3)   { probBanker6Two += w5; evBanker6Two += w5 * 22; probBanker6Combo += w5; evBanker6Combo += w5 * 12; }
              }

              d[p3]++;
            }
          }

          d[b2]++;
        }
        d[p2]++;
      }
      d[b1]++;
    }
    d[p1]++;
  }

  return {
    prob: prob4 + prob5 + prob6,
    prob4, prob5, prob6,
    ev: ev4 + ev5 + ev6,
    probNatural7, evNatural7,
    probThree7, evThree7,
    probCombo, evCombo,
    probBanker6Two, evBanker6Two,
    probBanker6Three, evBanker6Three,
    probBanker6Combo, evBanker6Combo,
    remaining: N,
  };
}

// ── HTTP 服务器 ────────────────────────────────────────────
const PORT = 3777;

// 启动时预计算新牌靴结果（固定值，避免每次重置重新随机）
console.log('预计算新牌靴概率...');
const FRESH_DECK_RESULT = calculateProbability(initDeck());
console.log('预计算完成，超级闲幸运七期望值:', FRESH_DECK_RESULT.ev.toFixed(4));

// 每个会话维护自己的牌靴（用 sessionId cookie 区分）
const sessions = new Map();

function getOrCreateSession(id) {
  if (!id || !sessions.has(id)) {
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessions.set(newId, { deck: initDeck(), history: [], cachedResult: FRESH_DECK_RESULT });
    return { id: newId, session: sessions.get(newId) };
  }
  return { id, session: sessions.get(id) };
}

function getResult(session) {
  if (!session.cachedResult) {
    session.cachedResult = calculateProbability(session.deck);
  }
  return session.cachedResult;
}

function invalidateCache(session) {
  session.cachedResult = null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getSessionId(req) {
  return req.headers['x-session-id'] || null;
}

function respond(res, status, data, sid) {
  const body = JSON.stringify(data);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
    'Access-Control-Expose-Headers': 'X-Session-Id',
  };
  if (sid) headers['X-Session-Id'] = sid;
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
      'Access-Control-Expose-Headers': 'X-Session-Id',
    });
    return res.end();
  }

  const sid = getSessionId(req);

  // POST /api/remove  { cards: [7, 0, 6, 1] }
  if (req.method === 'POST' && req.url === '/api/remove') {
    const body = await parseBody(req);
    const { id, session } = getOrCreateSession(sid);
    const cards = Array.isArray(body.cards) ? body.cards : [];
    const removed = [];
    const failed = [];

    for (const v of cards) {
      const val = parseInt(v, 10);
      if (isNaN(val) || val < 0 || val > 9 || !session.deck[val]) {
        failed.push(v);
      } else {
        session.deck[val]--;
        removed.push(val);
        session.history.push(val);
      }
    }

    if (removed.length > 0) invalidateCache(session);
    const result = getResult(session);
    return respond(res, 200, {
      removed, failed,
      deck: session.deck,
      result,
      historyCount: session.history.length,
    }, id);
  }

  // POST /api/reset
  if (req.method === 'POST' && req.url === '/api/reset') {
    const { id, session } = getOrCreateSession(sid);
    session.deck = initDeck();
    session.history = [];
    session.cachedResult = FRESH_DECK_RESULT;
    return respond(res, 200, { deck: session.deck, result: FRESH_DECK_RESULT, historyCount: 0 }, id);
  }

  // GET /api/calc
  if (req.method === 'GET' && req.url === '/api/calc') {
    const { id, session } = getOrCreateSession(sid);
    const result = getResult(session);
    return respond(res, 200, { deck: session.deck, result, historyCount: session.history.length }, id);
  }

  // GET /api/status
  if (req.method === 'GET' && req.url === '/api/status') {
    const { id, session } = getOrCreateSession(sid);
    return respond(res, 200, {
      deck: session.deck,
      remaining: totalCards(session.deck),
      historyCount: session.history.length,
    }, id);
  }

  respond(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Lucky7 API running on http://127.0.0.1:${PORT}`);
});
