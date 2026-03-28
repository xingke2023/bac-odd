'use strict';

/**
 * baccarat-enum.js
 * 百家乐精确枚举引擎
 *
 * 核心思路：
 *   - 牌靴用点数计数表示（deck[0..9]），0=10/J/Q/K，1=A，2-9同面值
 *   - 按发牌顺序 P1,B1,P2,B2,[P3],[B3] 枚举所有点数序列
 *   - 每张牌的概率权重 = count/remaining，精确无随机误差
 *   - 调用者通过 `collectors` 数组注入自定义累加逻辑，无需修改引擎本身
 *
 * 用法：
 *   const { enumerate, initDeck, bankerDraws } = require('./baccarat-enum');
 *
 *   // 1. 准备牌靴（可任意修改张数）
 *   const deck = initDeck(8); // 8副牌
 *
 *   // 2. 定义累加器（可定义任意多个投注项）
 *   let evSuperSeven = 0;
 *   const collectors = [
 *     {
 *       // 在每个结局节点调用
 *       // hand: { pCards, bCards, pTotal, bTotal, prob, cardCount }
 *       collect(hand) {
 *         if (hand.pTotal === 7 && hand.bTotal === 6) {
 *           const mul = hand.cardCount === 4 ? 30 : hand.cardCount === 5 ? 40 : 100;
 *           evSuperSeven += hand.prob * mul;
 *         }
 *       }
 *     }
 *   ];
 *
 *   // 3. 运行枚举
 *   enumerate(deck, collectors);
 *
 *   console.log('超级7期望:', evSuperSeven);
 */

// ── 牌靴工具 ────────────────────────────────────────────────

/**
 * 初始化标准牌靴
 * @param {number} numDecks - 副数，默认8副
 * @returns {number[]} deck[0..9]，deck[0]=10/J/Q/K张数，deck[1..9]=各点数张数
 */
function initDeck(numDecks = 8) {
  const deck = new Array(10).fill(0);
  deck[0] = 16 * numDecks;        // 10/J/Q/K 每副16张
  for (let v = 1; v <= 9; v++) {
    deck[v] = 4 * numDecks;       // A-9 每副4张
  }
  return deck;
}

/**
 * 计算牌靴总张数
 */
function totalCards(deck) {
  return deck.reduce((s, c) => s + c, 0);
}

/**
 * 标准百家乐庄家补牌规则（闲有第三张时）
 * @param {number} bTot - 庄家当前点数
 * @param {number} p3   - 闲家第三张点值
 * @returns {boolean}
 */
function bankerDraws(bTot, p3) {
  switch (bTot) {
    case 0: case 1: case 2: return true;
    case 3: return p3 !== 8;
    case 4: return p3 >= 2 && p3 <= 7;
    case 5: return p3 >= 4 && p3 <= 7;
    case 6: return p3 === 6 || p3 === 7;
    case 7: return false;
    default: return false;
  }
}

// ── 精确枚举引擎 ─────────────────────────────────────────────

/**
 * 枚举所有百家乐手牌，对每个结局调用 collectors
 *
 * @param {number[]} deckInput - 牌靴计数数组 deck[0..9]（会被复制，原数组不修改）
 * @param {Array<{collect: function}>} collectors - 累加器数组，每个结局调用一次
 *
 * 每次调用 collector.collect(hand)，hand 包含：
 *   pCards    {number[]} 闲家牌点值数组（长度2或3）
 *   bCards    {number[]} 庄家牌点值数组（长度2或3）
 *   pTotal    {number}   闲家最终点数（0-9）
 *   bTotal    {number}   庄家最终点数（0-9）
 *   pCount    {number}   闲家张数（2或3）
 *   bCount    {number}   庄家张数（2或3）
 *   cardCount {number}   总张数（4、5或6）
 *   prob      {number}   该结局的精确概率权重
 *   winner    {string}   'player' | 'banker' | 'tie'
 */
function enumerate(deckInput, collectors) {
  const d = deckInput.slice(); // 工作副本，枚举过程中实时增减
  const N = totalCards(d);
  if (N < 6) return;

  for (let p1 = 0; p1 <= 9; p1++) {
    if (!d[p1]) continue;
    const w1 = d[p1] / N; d[p1]--;

    for (let b1 = 0; b1 <= 9; b1++) {
      if (!d[b1]) continue;
      const w2 = w1 * d[b1] / (N - 1); d[b1]--;

      for (let p2 = 0; p2 <= 9; p2++) {
        if (!d[p2]) continue;
        const w3 = w2 * d[p2] / (N - 2); d[p2]--;

        for (let b2 = 0; b2 <= 9; b2++) {
          if (!d[b2]) continue;
          const w4 = w3 * d[b2] / (N - 3); d[b2]--;

          const pT = (p1 + p2) % 10;
          const bT = (b1 + b2) % 10;

          if (pT >= 8 || bT >= 8) {
            // ── 天牌，4张结局 ──
            _emit(collectors, [p1, p2], [b1, b2], pT, bT, w4);

          } else if (pT >= 6) {
            // ── 闲站 ──
            if (bT <= 5) {
              // 庄补一张，5张结局
              for (let b3 = 0; b3 <= 9; b3++) {
                if (!d[b3]) continue;
                const w5 = w4 * d[b3] / (N - 4);
                const bT3 = (bT + b3) % 10;
                _emit(collectors, [p1, p2], [b1, b2, b3], pT, bT3, w5);
              }
            } else {
              // 庄站，4张结局
              _emit(collectors, [p1, p2], [b1, b2], pT, bT, w4);
            }

          } else {
            // ── 闲补第三张 ──
            for (let p3 = 0; p3 <= 9; p3++) {
              if (!d[p3]) continue;
              const w5 = w4 * d[p3] / (N - 4); d[p3]--;
              const pT3 = (pT + p3) % 10;

              if (bankerDraws(bT, p3)) {
                // 庄补第三张，6张结局
                for (let b3 = 0; b3 <= 9; b3++) {
                  if (!d[b3]) continue;
                  const w6 = w5 * d[b3] / (N - 5);
                  const bT3 = (bT + b3) % 10;
                  _emit(collectors, [p1, p2, p3], [b1, b2, b3], pT3, bT3, w6);
                }
              } else {
                // 庄站，5张结局
                _emit(collectors, [p1, p2, p3], [b1, b2], pT3, bT, w5);
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
}

/** 内部：构造 hand 对象并调用所有 collectors */
function _emit(collectors, pCards, bCards, pTotal, bTotal, prob) {
  const winner = pTotal > bTotal ? 'player' : bTotal > pTotal ? 'banker' : 'tie';
  const hand = {
    pCards, bCards,
    pTotal, bTotal,
    pCount: pCards.length,
    bCount: bCards.length,
    cardCount: pCards.length + bCards.length,
    prob,
    winner,
  };
  for (let i = 0; i < collectors.length; i++) {
    collectors[i].collect(hand);
  }
}

// ── 内置常用 Collector 工厂 ──────────────────────────────────

/**
 * 创建一个固定赔率投注的 collector
 * @param {function(hand): boolean} condition - 触发条件
 * @param {number} payout - 赔率倍数（赢得 payout 倍，输掉 1 倍）
 * @returns {{ collect, result: function(): {prob, ev} }}
 *
 * 用法：
 *   const c = makeBet(h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 4, 30);
 *   enumerate(deck, [c]);
 *   console.log(c.result()); // { prob: 0.0012, ev: 0.8327 }
 */
function makeBet(condition, payout) {
  let prob = 0;
  let ev = 0;
  return {
    collect(hand) {
      if (condition(hand)) {
        prob += hand.prob;
        ev += hand.prob * payout;
      }
    },
    result() { return { prob, ev }; },
  };
}

/**
 * 创建一个多档赔率投注的 collector（同一注，不同情况赔率不同）
 * @param {Array<{condition: function, payout: number}>} tiers
 * @returns {{ collect, result: function(): {prob, ev} }}
 *
 * 用法（超级7，4张×30，5张×40，6张×100）：
 *   const c = makeMultiTierBet([
 *     { condition: h => h.pTotal===7 && h.bTotal===6 && h.cardCount===4, payout: 30 },
 *     { condition: h => h.pTotal===7 && h.bTotal===6 && h.cardCount===5, payout: 40 },
 *     { condition: h => h.pTotal===7 && h.bTotal===6 && h.cardCount===6, payout: 100 },
 *   ]);
 */
function makeMultiTierBet(tiers) {
  let prob = 0;
  let ev = 0;
  return {
    collect(hand) {
      for (const tier of tiers) {
        if (tier.condition(hand)) {
          prob += hand.prob;
          ev += hand.prob * tier.payout;
          return;
        }
      }
    },
    result() { return { prob, ev }; },
  };
}

// ── 导出 ────────────────────────────────────────────────────

module.exports = {
  initDeck,
  totalCards,
  bankerDraws,
  enumerate,
  makeBet,
  makeMultiTierBet,
};
