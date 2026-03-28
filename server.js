'use strict';

const http = require('http');
const { enumerate, initDeck: enumInitDeck, makeBet, makeMultiTierBet } = require('./baccarat-enum');

// ── 牌靴工具 ────────────────────────────────────────────────
function initDeck() {
  const deck = {};
  for (let v = 1; v <= 9; v++) deck[v] = 32;
  deck[0] = 128;
  return deck;
}

function totalCards(deck) {
  return Object.values(deck).reduce((s, c) => s + c, 0);
}

// ── 辅助函数 ──────────────────────────────────────────────────
// 判断头两张是否为例牌（天牌，8或9点）
function isNatural(cards) {
  return (cards[0] + cards[1]) % 10 >= 8;
}

// ── 精确枚举计算 ─────────────────────────────────────────────
function calculateProbability(deck) {
  // 转为数组格式供枚举引擎使用
  const arr = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) arr[v] = deck[v] || 0;
  const N = arr.reduce((a, b) => a + b, 0);
  if (N < 6) return null;

  // ── 龙宝投注项（分档单独追踪）──
  // 闲龙宝各档
  const pNatural  = makeBet(h => h.winner === 'player' && isNatural(h.pCards), 1);
  const pWin9     = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 9, 30);
  const pWin8     = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 8, 10);
  const pWin7     = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 7, 5);
  const pWin6     = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 6, 3);
  const pWin5     = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 5, 2);
  const pWin4     = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 4, 1);
  // 庄龙宝各档
  const bNatural  = makeBet(h => h.winner === 'banker' && isNatural(h.bCards), 1);
  const bWin9     = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 9, 30);
  const bWin8     = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 8, 10);
  const bWin7     = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 7, 5);
  const bWin6     = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 6, 3);
  const bWin5     = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 5, 2);
  const bWin4     = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 4, 1);

  // 定义所有投注项
  const superSeven = makeMultiTierBet([
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 4, payout: 30 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 5, payout: 40 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 6, payout: 100 },
  ]);
  const natural7    = makeBet(h => h.pCount === 2 && h.pTotal === 7 && h.winner === 'player', 15);
  const three7      = makeBet(h => h.pCount === 3 && h.pTotal === 7 && h.winner === 'player', 30);
  const combo7      = makeMultiTierBet([
    { condition: h => h.pCount === 2 && h.pTotal === 7 && h.winner === 'player', payout: 6 },
    { condition: h => h.pCount === 3 && h.pTotal === 7 && h.winner === 'player', payout: 15 },
  ]);
  const banker6Two   = makeBet(h => h.bCount === 2 && h.bTotal === 6 && h.winner === 'banker', 22);
  const banker6Three = makeBet(h => h.bCount === 3 && h.bTotal === 6 && h.winner === 'banker', 50);
  const banker6Combo = makeMultiTierBet([
    { condition: h => h.bCount === 2 && h.bTotal === 6 && h.winner === 'banker', payout: 12 },
    { condition: h => h.bCount === 3 && h.bTotal === 6 && h.winner === 'banker', payout: 20 },
  ]);

  enumerate(arr, [superSeven, natural7, three7, combo7, banker6Two, banker6Three, banker6Combo,
    pNatural, pWin9, pWin8, pWin7, pWin6, pWin5, pWin4,
    bNatural, bWin9, bWin8, bWin7, bWin6, bWin5, bWin4]);

  const s7 = superSeven.result();
  return {
    prob:  s7.prob,
    ev:    s7.ev,
    probNatural7:   natural7.result().prob,
    evNatural7:     natural7.result().ev,
    probThree7:     three7.result().prob,
    evThree7:       three7.result().ev,
    probCombo:      combo7.result().prob,
    evCombo:        combo7.result().ev,
    probBanker6Two:   banker6Two.result().prob,
    evBanker6Two:     banker6Two.result().ev,
    probBanker6Three: banker6Three.result().prob,
    evBanker6Three:   banker6Three.result().ev,
    probBanker6Combo: banker6Combo.result().prob,
    evBanker6Combo:   banker6Combo.result().ev,
    // 龙宝（分档明细）
    dragon: {
      player: {
        natural: pNatural.result(),
        win9: pWin9.result(), win8: pWin8.result(), win7: pWin7.result(),
        win6: pWin6.result(), win5: pWin5.result(), win4: pWin4.result(),
      },
      banker: {
        natural: bNatural.result(),
        win9: bWin9.result(), win8: bWin8.result(), win7: bWin7.result(),
        win6: bWin6.result(), win5: bWin5.result(), win4: bWin4.result(),
      },
    },
    remaining: N,
  };
}

// 计算龙宝期望（仅闲/庄）
function calcDragonEV(deck) {
  const arr = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) arr[v] = deck[v] || 0;
  const N = arr.reduce((a, b) => a + b, 0);
  if (N < 6) return null;

  const pNatural = makeBet(h => h.winner === 'player' && isNatural(h.pCards), 1);
  const pWin9    = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 9, 30);
  const pWin8    = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 8, 10);
  const pWin7    = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 7, 5);
  const pWin6    = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 6, 3);
  const pWin5    = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 5, 2);
  const pWin4    = makeBet(h => h.winner === 'player' && !isNatural(h.pCards) && (h.pTotal - h.bTotal) === 4, 1);
  const bNatural = makeBet(h => h.winner === 'banker' && isNatural(h.bCards), 1);
  const bWin9    = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 9, 30);
  const bWin8    = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 8, 10);
  const bWin7    = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 7, 5);
  const bWin6    = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 6, 3);
  const bWin5    = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 5, 2);
  const bWin4    = makeBet(h => h.winner === 'banker' && !isNatural(h.bCards) && (h.bTotal - h.pTotal) === 4, 1);

  enumerate(arr, [pNatural, pWin9, pWin8, pWin7, pWin6, pWin5, pWin4,
                  bNatural, bWin9, bWin8, bWin7, bWin6, bWin5, bWin4]);

  function net(bets) {
    let ev = 0, prob = 0;
    for (const b of bets) { const r = b.result(); ev += r.ev; prob += r.prob; }
    return ev - (1 - prob);
  }
  return {
    player: net([pNatural, pWin9, pWin8, pWin7, pWin6, pWin5, pWin4]),
    banker: net([bNatural, bWin9, bWin8, bWin7, bWin6, bWin5, bWin4]),
  };
}

// 计算每张牌（0-9）移除一张后对龙宝EV的影响（单位：1，即实际差值）
function calcCardImpact(deck) {
  const base = calcDragonEV(deck);
  if (!base) return null;
  const impact = [];
  for (let v = 0; v <= 9; v++) {
    if (!deck[v]) {
      impact.push({ v, player: null, banker: null });
      continue;
    }
    const d2 = Object.assign({}, deck);
    d2[v]--;
    const ev2 = calcDragonEV(d2);
    if (!ev2) {
      impact.push({ v, player: null, banker: null });
    } else {
      impact.push({
        v,
        player: ev2.player - base.player,
        banker: ev2.banker - base.banker,
      });
    }
  }
  return impact;
}

// 计算超级幸运7净期望（闲=7且庄=6，按总张数分档 4张×30 5张×40 6张×100）
function calcSuperSevenEV2(arr) {
  const N = arr.reduce((a, b) => a + b, 0);
  if (N < 6) return null;
  const s7 = makeMultiTierBet([
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 4, payout: 30 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 5, payout: 40 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 6, payout: 100 },
  ]);
  enumerate(arr, [s7]);
  const r = s7.result();
  return r.ev - (1 - r.prob);
}

// 计算移除1张牌后对超级幸运7 EV的影响
function calcSuperSevenImpact(deck) {
  const arr0 = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) arr0[v] = deck[v] || 0;
  const N = arr0.reduce((a, b) => a + b, 0);
  if (N < 6) return null;

  const base = calcSuperSevenEV2(arr0);
  const impact = [];
  for (let v = 0; v <= 9; v++) {
    if (!arr0[v]) {
      impact.push({ v, delta: null });
      continue;
    }
    const arr2 = arr0.slice();
    arr2[v]--;
    const ev2 = calcSuperSevenEV2(arr2);
    impact.push({ v, delta: ev2 !== null ? ev2 - base : null });
  }
  return impact;
}

// 计算移除1张牌后对两张/三张幸运6 EV的影响
function calcLucky6Impact(deck) {
  // 基准期望
  const arr0 = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) arr0[v] = deck[v] || 0;
  const N = arr0.reduce((a, b) => a + b, 0);
  if (N < 6) return null;

  function calcEVs(arr) {
    const l6two   = makeBet(h => h.bCount === 2 && h.bTotal === 6 && h.winner === 'banker', 22);
    const l6three = makeBet(h => h.bCount === 3 && h.bTotal === 6 && h.winner === 'banker', 50);
    enumerate(arr, [l6two, l6three]);
    const r2 = l6two.result(), r3 = l6three.result();
    return {
      two:   r2.ev - (1 - r2.prob),
      three: r3.ev - (1 - r3.prob),
    };
  }

  const base = calcEVs(arr0);
  const impact = [];
  for (let v = 0; v <= 9; v++) {
    if (!arr0[v]) {
      impact.push({ v, two: null, three: null });
      continue;
    }
    const arr2 = arr0.slice();
    arr2[v]--;
    const ev2 = calcEVs(arr2);
    impact.push({
      v,
      two:   ev2.two   - base.two,
      three: ev2.three - base.three,
    });
  }
  return impact;
}

// 从 deck 对象快速计算四项净期望（复用 calculateProbability）
function calcNetEVs(deck) {
  const result = calculateProbability(deck);
  if (!result) return null;
  const keys = ['natural','win9','win8','win7','win6','win5','win4'];
  function dragonNet(side) {
    let ev = 0, prob = 0;
    for (const k of keys) { ev += side[k].ev; prob += side[k].prob; }
    return ev - (1 - prob);
  }
  return {
    playerDragon: dragonNet(result.dragon.player),
    bankerDragon: dragonNet(result.dragon.banker),
    superSeven:   result.ev - (1 - result.prob),
    lucky6:       result.evBanker6Combo - (1 - result.probBanker6Combo),
  };
}

// 随机模拟发牌 N 局，逐局记录期望值，返回剩余牌靴 + 逐局EV + 可下注统计
function simulateDealing(hands) {
  // 构建完整牌靴数组（每张牌展开为独立元素）
  const shoe = [];
  for (let v = 0; v <= 9; v++) {
    const cnt = v === 0 ? 128 : 32;
    for (let i = 0; i < cnt; i++) shoe.push(v);
  }
  // Fisher-Yates 洗牌
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  let pos = 0;
  function draw() { return shoe[pos++]; }
  function remaining() { return shoe.length - pos; }

  // 统计可下注局数（庄家优势 < 0.5%，即净期望 > -0.005）
  const THRESHOLD = -0.005;
  const bettable = { playerDragon: 0, bankerDragon: 0, superSeven: 0, lucky6: 0 };
  let actualHands = 0;

  for (let h = 0; h < hands; h++) {
    if (remaining() < 6) break;
    actualHands++;

    // 发一局牌
    const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
    const pT = (p1 + p2) % 10;
    const bT = (b1 + b2) % 10;

    let p3 = null;
    if (pT < 8 && bT < 8) { // 非天牌才可能补牌
      if (pT <= 5) {
        if (remaining() < 1) break;
        p3 = draw();
      }
      let bankerDraw = false;
      if (p3 === null) {
        bankerDraw = bT <= 5;
      } else {
        switch (bT) {
          case 0: case 1: case 2: bankerDraw = true; break;
          case 3: bankerDraw = p3 !== 8; break;
          case 4: bankerDraw = p3 >= 2 && p3 <= 7; break;
          case 5: bankerDraw = p3 >= 4 && p3 <= 7; break;
          case 6: bankerDraw = p3 === 6 || p3 === 7; break;
          case 7: bankerDraw = false; break;
        }
      }
      if (bankerDraw) {
        if (remaining() < 1) break;
        draw();
      }
    }

    // 每局发完后计算剩余牌靴的期望值
    const deck = {};
    for (let v = 0; v <= 9; v++) deck[v] = 0;
    for (let i = pos; i < shoe.length; i++) deck[shoe[i]]++;

    const evs = calcNetEVs(deck);
    if (evs) {
      if (evs.playerDragon > THRESHOLD) bettable.playerDragon++;
      if (evs.bankerDragon > THRESHOLD) bettable.bankerDragon++;
      if (evs.superSeven   > THRESHOLD) bettable.superSeven++;
      if (evs.lucky6       > THRESHOLD) bettable.lucky6++;
    }
  }

  // 最终剩余牌靴
  const deck = {};
  for (let v = 0; v <= 9; v++) deck[v] = 0;
  for (let i = pos; i < shoe.length; i++) deck[shoe[i]]++;
  return { deck, bettable, actualHands };
}

// 只计算超级幸运7净期望（3个collector，比calcNetEVs快约7倍）
function calcSuperSevenEV(arr) {
  const N = arr.reduce((a, b) => a + b, 0);
  if (N < 6) return null;
  const s7 = makeMultiTierBet([
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 4, payout: 30 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 5, payout: 40 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 6, payout: 100 },
  ]);
  enumerate(arr, [s7]);
  const r = s7.result();
  return r.ev - (1 - r.prob);
}

// 随机模拟发牌，仅统计超级幸运7可下注局数
function simulateSuperSeven(hands) {
  const shoe = [];
  for (let v = 0; v <= 9; v++) {
    const cnt = v === 0 ? 128 : 32;
    for (let i = 0; i < cnt; i++) shoe.push(v);
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  let pos = 0;
  function draw() { return shoe[pos++]; }
  function remaining() { return shoe.length - pos; }

  const THRESHOLD = -0.005;
  const S7_PAYOUTS = { 4: 30, 5: 40, 6: 100 };
  let bettable = 0;
  let actualHands = 0;
  const bettableHands = []; // 记录每个可下注局：{ hand, edge, nextResult }
  let pendingBet = null; // 上局发完后判为可下注，等本局结果

  for (let h = 0; h < hands; h++) {
    if (remaining() < 6) break;
    actualHands++;

    const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
    const pT = (p1 + p2) % 10;
    const bT = (b1 + b2) % 10;

    let p3 = null, b3 = null;
    let cardCount = 4;
    if (pT < 8 && bT < 8) {
      if (pT <= 5) {
        if (remaining() < 1) break;
        p3 = draw();
        cardCount++;
      }
      let bankerDraw = false;
      if (p3 === null) {
        bankerDraw = bT <= 5;
      } else {
        switch (bT) {
          case 0: case 1: case 2: bankerDraw = true; break;
          case 3: bankerDraw = p3 !== 8; break;
          case 4: bankerDraw = p3 >= 2 && p3 <= 7; break;
          case 5: bankerDraw = p3 >= 4 && p3 <= 7; break;
          case 6: bankerDraw = p3 === 6 || p3 === 7; break;
          case 7: bankerDraw = false; break;
        }
      }
      if (bankerDraw) {
        if (remaining() < 1) break;
        b3 = draw();
        cardCount++;
      }
    }

    // 若上局判为可下注，记录本局实际结果（闲=7且庄=6才中出）
    if (pendingBet !== null) {
      const finalPT = p3 !== null ? (p1 + p2 + p3) % 10 : pT;
      const finalBT = b3 !== null ? (b1 + b2 + b3) % 10 : bT;
      const hit = finalPT === 7 && finalBT === 6;
      const payout = hit ? (S7_PAYOUTS[cardCount] || 0) : 0;
      pendingBet.nextResult = { hit, payout, cardCount: hit ? cardCount : null };
      bettableHands.push(pendingBet);
      pendingBet = null;
    }

    // 枚举剩余牌靴，判断下一局是否值得下注（剩余<104张时牌靴过薄，跳过）
    const arr = new Array(10).fill(0);
    for (let i = pos; i < shoe.length; i++) arr[shoe[i]]++;
    if (remaining() >= 104) {
      const ev = calcSuperSevenEV(arr);
      if (ev !== null && ev > THRESHOLD) {
        bettable++;
        pendingBet = { hand: actualHands, edge: parseFloat((-ev * 100).toFixed(4)) };
      }
    }
  }

  // 最后一局判为可下注但牌靴已结束
  if (pendingBet !== null) {
    pendingBet.nextResult = { hit: false, payout: 0, cardCount: null, noNextHand: true };
    bettableHands.push(pendingBet);
    pendingBet = null;
  }
  const deck = {};
  for (let v = 0; v <= 9; v++) deck[v] = 0;
  for (let i = pos; i < shoe.length; i++) deck[shoe[i]]++;

  // 最终牌靴的超级幸运7完整结果（用于前端展示EV/概率）
  const finalArr = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) finalArr[v] = deck[v];
  const s7Final = makeMultiTierBet([
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 4, payout: 30 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 5, payout: 40 },
    { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 6, payout: 100 },
  ]);
  enumerate(finalArr, [s7Final]);
  const finalR = s7Final.result();

  return { deck, bettable, actualHands, bettableHands, prob: finalR.prob, ev: finalR.ev };
}

// 只计算幸运6三张牌净期望（1个collector）
function calcLucky6ThreeEV(arr) {
  const N = arr.reduce((a, b) => a + b, 0);
  if (N < 6) return null;
  const l6 = makeBet(h => h.bCount === 3 && h.bTotal === 6 && h.winner === 'banker', 50);
  enumerate(arr, [l6]);
  const r = l6.result();
  return r.ev - (1 - r.prob);
}

// 随机模拟发牌，仅统计幸运6三张牌可下注局数
function simulateLucky6Three(hands) {
  const shoe = [];
  for (let v = 0; v <= 9; v++) {
    const cnt = v === 0 ? 128 : 32;
    for (let i = 0; i < cnt; i++) shoe.push(v);
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  let pos = 0;
  function draw() { return shoe[pos++]; }
  function remaining() { return shoe.length - pos; }

  const THRESHOLD = -0.005;
  let bettable = 0;
  let actualHands = 0;
  const bettableHands = [];
  let pendingBet = null;

  for (let h = 0; h < hands; h++) {
    if (remaining() < 6) break;
    actualHands++;

    const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
    const pT = (p1 + p2) % 10;
    const bT = (b1 + b2) % 10;

    let p3 = null, b3 = null;
    let bCount = 2;
    if (pT < 8 && bT < 8) {
      if (pT <= 5) {
        if (remaining() < 1) break;
        p3 = draw();
      }
      let bankerDraw = false;
      if (p3 === null) {
        bankerDraw = bT <= 5;
      } else {
        switch (bT) {
          case 0: case 1: case 2: bankerDraw = true; break;
          case 3: bankerDraw = p3 !== 8; break;
          case 4: bankerDraw = p3 >= 2 && p3 <= 7; break;
          case 5: bankerDraw = p3 >= 4 && p3 <= 7; break;
          case 6: bankerDraw = p3 === 6 || p3 === 7; break;
          case 7: bankerDraw = false; break;
        }
      }
      if (bankerDraw) {
        if (remaining() < 1) break;
        b3 = draw();
        bCount = 3;
      }
    }

    // 若上局判为可下注，记录本局实际结果（庄3张=6且庄赢才中出）
    if (pendingBet !== null) {
      const finalBT = b3 !== null ? (b1 + b2 + b3) % 10 : bT;
      const finalPT = p3 !== null ? (p1 + p2 + p3) % 10 : pT;
      const hit = bCount === 3 && finalBT === 6 && finalBT > finalPT;
      pendingBet.nextResult = { hit, payout: hit ? 50 : 0 };
      bettableHands.push(pendingBet);
      pendingBet = null;
    }

    // 枚举剩余牌靴，判断下一局是否值得下注（剩余<104张时牌靴过薄，跳过）
    const arr = new Array(10).fill(0);
    for (let i = pos; i < shoe.length; i++) arr[shoe[i]]++;
    if (remaining() >= 104) {
      const ev = calcLucky6ThreeEV(arr);
      if (ev !== null && ev > THRESHOLD) {
        bettable++;
        pendingBet = { hand: actualHands, edge: parseFloat((-ev * 100).toFixed(4)) };
      }
    }
  }

  if (pendingBet !== null) {
    pendingBet.nextResult = { hit: false, payout: 0, noNextHand: true };
    bettableHands.push(pendingBet);
    pendingBet = null;
  }

  const deck = {};
  for (let v = 0; v <= 9; v++) deck[v] = 0;
  for (let i = pos; i < shoe.length; i++) deck[shoe[i]]++;

  const finalArr = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) finalArr[v] = deck[v];
  const l6Final = makeBet(h => h.bCount === 3 && h.bTotal === 6 && h.winner === 'banker', 50);
  enumerate(finalArr, [l6Final]);
  const finalR = l6Final.result();

  return { deck, bettable, actualHands, bettableHands, prob: finalR.prob, ev: finalR.ev };
}


// 计算两张幸运6期望（庄2张=6且庄赢，赔×22）
function calcLucky6TwoEV(arr) {
  const N = arr.reduce((a, b) => a + b, 0);
  if (N < 6) return null;
  const l6 = makeBet(h => h.bCount === 2 && h.bTotal === 6 && h.winner === 'banker', 22);
  enumerate(arr, [l6]);
  const r = l6.result();
  return r.ev - (1 - r.prob);
}

// 随机模拟发牌，仅统计两张幸运6可下注局数
function simulateLucky6Two(hands) {
  const shoe = [];
  for (let v = 0; v <= 9; v++) {
    const cnt = v === 0 ? 128 : 32;
    for (let i = 0; i < cnt; i++) shoe.push(v);
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  let pos = 0;
  function draw() { return shoe[pos++]; }
  function remaining() { return shoe.length - pos; }

  const THRESHOLD = -0.005;
  let bettable = 0;
  let actualHands = 0;
  const bettableHands = [];
  let pendingBet = null;

  for (let h = 0; h < hands; h++) {
    if (remaining() < 6) break;
    actualHands++;

    const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
    const pT = (p1 + p2) % 10;
    const bT = (b1 + b2) % 10;

    let p3 = null, b3 = null;
    let bCount = 2;
    if (pT < 8 && bT < 8) {
      if (pT <= 5) {
        if (remaining() < 1) break;
        p3 = draw();
      }
      let bankerDraw = false;
      if (p3 === null) {
        bankerDraw = bT <= 5;
      } else {
        switch (bT) {
          case 0: case 1: case 2: bankerDraw = true; break;
          case 3: bankerDraw = p3 !== 8; break;
          case 4: bankerDraw = p3 >= 2 && p3 <= 7; break;
          case 5: bankerDraw = p3 >= 4 && p3 <= 7; break;
          case 6: bankerDraw = p3 === 6 || p3 === 7; break;
          case 7: bankerDraw = false; break;
        }
      }
      if (bankerDraw) {
        if (remaining() < 1) break;
        b3 = draw();
        bCount = 3;
      }
    }

    // 若上局判为可下注，记录本局实际结果（庄2张=6且庄赢才中出）
    if (pendingBet !== null) {
      const finalBT = b3 !== null ? (b1 + b2 + b3) % 10 : bT;
      const finalPT = p3 !== null ? (p1 + p2 + p3) % 10 : pT;
      const hit = bCount === 2 && finalBT === 6 && finalBT > finalPT;
      pendingBet.nextResult = { hit, payout: hit ? 22 : 0 };
      bettableHands.push(pendingBet);
      pendingBet = null;
    }

    // 枚举剩余牌靴，判断下一局是否值得下注（剩余<104张时牌靴过薄，跳过）
    const arr = new Array(10).fill(0);
    for (let i = pos; i < shoe.length; i++) arr[shoe[i]]++;
    if (remaining() >= 104) {
      const ev = calcLucky6TwoEV(arr);
      if (ev !== null && ev > THRESHOLD) {
        bettable++;
        pendingBet = { hand: actualHands, edge: parseFloat((-ev * 100).toFixed(4)) };
      }
    }
  }

  if (pendingBet !== null) {
    pendingBet.nextResult = { hit: false, payout: 0, noNextHand: true };
    bettableHands.push(pendingBet);
    pendingBet = null;
  }

  const deck = {};
  for (let v = 0; v <= 9; v++) deck[v] = 0;
  for (let i = pos; i < shoe.length; i++) deck[shoe[i]]++;

  const finalArr = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) finalArr[v] = deck[v];
  const l6Final = makeBet(h => h.bCount === 2 && h.bTotal === 6 && h.winner === 'banker', 22);
  enumerate(finalArr, [l6Final]);
  const finalR = l6Final.result();

  return { deck, bettable, actualHands, bettableHands, prob: finalR.prob, ev: finalR.ev };
}

// 随机模拟发牌，同时统计闲龙宝和庄龙宝可下注局数
function simulateDragonBonus(hands) {
  const shoe = [];
  for (let v = 0; v <= 9; v++) {
    const cnt = v === 0 ? 128 : 32;
    for (let i = 0; i < cnt; i++) shoe.push(v);
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  let pos = 0;
  function draw() { return shoe[pos++]; }
  function remaining() { return shoe.length - pos; }

  const THRESHOLD = -0.005;
  let bettablePlayer = 0, bettableBanker = 0;
  let actualHands = 0;
  const bettableHandsPlayer = [];
  const bettableHandsBanker = [];
  let pendingPlayer = null, pendingBanker = null;

  for (let h = 0; h < hands; h++) {
    if (remaining() < 6) break;
    actualHands++;

    const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
    const pT = (p1 + p2) % 10;
    const bT = (b1 + b2) % 10;

    let p3 = null, b3 = null;
    if (pT < 8 && bT < 8) {
      if (pT <= 5) {
        if (remaining() < 1) break;
        p3 = draw();
      }
      let bankerDraw = false;
      if (p3 === null) {
        bankerDraw = bT <= 5;
      } else {
        switch (bT) {
          case 0: case 1: case 2: bankerDraw = true; break;
          case 3: bankerDraw = p3 !== 8; break;
          case 4: bankerDraw = p3 >= 2 && p3 <= 7; break;
          case 5: bankerDraw = p3 >= 4 && p3 <= 7; break;
          case 6: bankerDraw = p3 === 6 || p3 === 7; break;
          case 7: bankerDraw = false; break;
        }
      }
      if (bankerDraw) {
        if (remaining() < 1) break;
        b3 = draw();
      }
    }

    const finalPT = p3 !== null ? (p1 + p2 + p3) % 10 : pT;
    const finalBT = b3 !== null ? (b1 + b2 + b3) % 10 : bT;
    const pCards = p3 !== null ? [p1, p2, p3] : [p1, p2];
    const bCards = b3 !== null ? [b1, b2, b3] : [b1, b2];
    const naturalP = (p1 + p2) % 10 >= 8;
    const naturalB = (b1 + b2) % 10 >= 8;
    const winner = finalPT > finalBT ? 'player' : finalBT > finalPT ? 'banker' : 'tie';

    // 记录上一局下注结果 — 闲龙宝
    if (pendingPlayer !== null) {
      let hit = false, payout = 0;
      if (winner === 'player') {
        if (naturalP) { hit = true; payout = 1; }
        else {
          const diff = finalPT - finalBT;
          if (diff === 9) { hit = true; payout = 30; }
          else if (diff === 8) { hit = true; payout = 10; }
          else if (diff === 7) { hit = true; payout = 5; }
          else if (diff === 6) { hit = true; payout = 3; }
          else if (diff === 5) { hit = true; payout = 2; }
          else if (diff === 4) { hit = true; payout = 1; }
        }
      }
      pendingPlayer.nextResult = { hit, payout, cardCount: pCards.length + bCards.length };
      bettableHandsPlayer.push(pendingPlayer);
      pendingPlayer = null;
    }

    // 记录上一局下注结果 — 庄龙宝
    if (pendingBanker !== null) {
      let hit = false, payout = 0;
      if (winner === 'banker') {
        if (naturalB) { hit = true; payout = 1; }
        else {
          const diff = finalBT - finalPT;
          if (diff === 9) { hit = true; payout = 30; }
          else if (diff === 8) { hit = true; payout = 10; }
          else if (diff === 7) { hit = true; payout = 5; }
          else if (diff === 6) { hit = true; payout = 3; }
          else if (diff === 5) { hit = true; payout = 2; }
          else if (diff === 4) { hit = true; payout = 1; }
        }
      }
      pendingBanker.nextResult = { hit, payout, cardCount: pCards.length + bCards.length };
      bettableHandsBanker.push(pendingBanker);
      pendingBanker = null;
    }

    // 枚举剩余牌靴，计算下一局龙宝EV（剩余<104张时牌靴过薄，跳过）
    const arr = new Array(10).fill(0);
    for (let i = pos; i < shoe.length; i++) arr[shoe[i]]++;
    if (remaining() >= 104) {
      const dragonEV = calcDragonEV({ ...arr });
      if (dragonEV) {
        if (dragonEV.player > THRESHOLD) {
          bettablePlayer++;
          pendingPlayer = { hand: actualHands, edge: parseFloat((-dragonEV.player * 100).toFixed(4)) };
        }
        if (dragonEV.banker > THRESHOLD) {
          bettableBanker++;
          pendingBanker = { hand: actualHands, edge: parseFloat((-dragonEV.banker * 100).toFixed(4)) };
        }
      }
    }
  }

  if (pendingPlayer !== null) {
    pendingPlayer.nextResult = { hit: false, payout: 0, noNextHand: true };
    bettableHandsPlayer.push(pendingPlayer);
    pendingPlayer = null;
  }
  if (pendingBanker !== null) {
    pendingBanker.nextResult = { hit: false, payout: 0, noNextHand: true };
    bettableHandsBanker.push(pendingBanker);
    pendingBanker = null;
  }

  const deck = {};
  for (let v = 0; v <= 9; v++) deck[v] = 0;
  for (let i = pos; i < shoe.length; i++) deck[shoe[i]]++;

  // 最终剩余牌靴的龙宝期望（用于EV摘要展示）
  const finalEV = calcDragonEV(deck) || { player: null, banker: null };

  return {
    deck, actualHands,
    bettablePlayer, bettableBanker,
    bettableHandsPlayer, bettableHandsBanker,
    playerEV: finalEV.player,
    bankerEV: finalEV.banker,
  };
}

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

  // GET /api/dragon-impact
  if (req.method === 'GET' && req.url === '/api/dragon-impact') {
    const { id, session } = getOrCreateSession(sid);
    const impact = calcCardImpact(session.deck);
    return respond(res, 200, { impact }, id);
  }

  // GET /api/lucky6-impact  移除1张牌后对两张/三张幸运6 EV的影响
  if (req.method === 'GET' && req.url === '/api/lucky6-impact') {
    const { id, session } = getOrCreateSession(sid);
    const impact = calcLucky6Impact(session.deck);
    return respond(res, 200, { impact }, id);
  }

  // GET /api/s7-impact  移除1张牌后对超级幸运7 EV的影响
  if (req.method === 'GET' && req.url === '/api/s7-impact') {
    const { id, session } = getOrCreateSession(sid);
    const impact = calcSuperSevenImpact(session.deck);
    return respond(res, 200, { impact }, id);
  }

  // POST /api/simulate  { hands: N }
  if (req.method === 'POST' && req.url === '/api/simulate') {
    const body = await parseBody(req);
    const hands = Math.max(1, Math.min(10000, parseInt(body.hands, 10) || 100));
    const { deck, bettable, actualHands } = simulateDealing(hands);
    const result = calculateProbability(deck);
    return respond(res, 200, { hands, actualHands, deck, result, bettable }, null);
  }

  // POST /api/simulate-s7  { hands: N }  仅超级幸运7，运算量约为simulate的1/7
  if (req.method === 'POST' && req.url === '/api/simulate-s7') {
    const body = await parseBody(req);
    const hands = Math.max(1, Math.min(10000, parseInt(body.hands, 10) || 100));
    const { deck, bettable, actualHands, bettableHands, prob, ev } = simulateSuperSeven(hands);
    return respond(res, 200, { hands, actualHands, deck, bettable, bettableHands, prob, ev }, null);
  }

  // POST /api/simulate-dragon  { hands: N }  闲龙宝+庄龙宝
  if (req.method === 'POST' && req.url === '/api/simulate-dragon') {
    const body = await parseBody(req);
    const hands = Math.max(1, Math.min(10000, parseInt(body.hands, 10) || 100));
    const result = simulateDragonBonus(hands);
    return respond(res, 200, result, null);
  }

  // POST /api/simulate-l6two  { hands: N }  仅两张幸运6
  if (req.method === 'POST' && req.url === '/api/simulate-l6two') {
    const body = await parseBody(req);
    const hands = Math.max(1, Math.min(10000, parseInt(body.hands, 10) || 100));
    const { deck, bettable, actualHands, bettableHands, prob, ev } = simulateLucky6Two(hands);
    return respond(res, 200, { hands, actualHands, deck, bettable, bettableHands, prob, ev }, null);
  }

  // POST /api/simulate-l6three  { hands: N }  仅幸运6三张牌
  if (req.method === 'POST' && req.url === '/api/simulate-l6three') {
    const body = await parseBody(req);
    const hands = Math.max(1, Math.min(10000, parseInt(body.hands, 10) || 100));
    const { deck, bettable, actualHands, bettableHands, prob, ev } = simulateLucky6Three(hands);
    return respond(res, 200, { hands, actualHands, deck, bettable, bettableHands, prob, ev }, null);
  }

  respond(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Lucky7 API running on http://127.0.0.1:${PORT}`);
});
