#!/usr/bin/env node
'use strict';

/**
 * 超级幸运7 (Super Lucky 7) 概率计算器
 * 基于蒙特卡洛模拟，计算百家乐中超级幸运7触发概率
 *
 * 触发条件：
 *   1. 闲家赢
 *   2. 闲家点数 = 7
 *   3. 庄家点数 = 6
 *   4. 赔率：4张牌=30倍，5张牌=40倍，6张牌=100倍
 */

const readline = require('readline');

// ─────────────────────────────────────────────
// 牌靴管理
// ─────────────────────────────────────────────

/**
 * 初始化8副牌的牌靴
 * 牌面值映射：A=1, 2-9=面值, 10/J/Q/K=0
 * 每副牌：A~9各4张，0(10/J/Q/K)共16张
 * 8副牌：值1~9各32张，值0共128张
 */
function initDeck() {
  const deck = {};
  for (let v = 1; v <= 9; v++) {
    deck[v] = 32; // 8副 × 4张
  }
  deck[0] = 128;  // 8副 × 16张（10, J, Q, K）
  return deck;
}

/**
 * 从牌靴中移除一张牌
 * @param {Object} deck - 当前牌靴（值→剩余张数）
 * @param {number} value - 要移除的牌面值（0-9）
 * @returns {boolean} 是否成功移除
 */
function removeCard(deck, value) {
  if (deck[value] === undefined || deck[value] <= 0) {
    return false;
  }
  deck[value]--;
  return true;
}

/**
 * 计算牌靴中的总剩余牌数
 */
function totalCards(deck) {
  return Object.values(deck).reduce((sum, count) => sum + count, 0);
}

/**
 * 构建用于随机抽牌的累积权重数组（提升蒙特卡洛效率）
 * @returns {{ values: number[], weights: number[], total: number }}
 */
function buildWeightedDraw(deck) {
  const values = [];
  const weights = [];
  let total = 0;
  for (let v = 0; v <= 9; v++) {
    const cnt = deck[v] || 0;
    if (cnt > 0) {
      values.push(v);
      total += cnt;
      weights.push(total);
    }
  }
  return { values, weights, total };
}

/**
 * 根据当前牌靴权重随机抽取一张牌（O(log n) 二分查找）
 */
function drawCard(wdraw) {
  const r = Math.random() * wdraw.total;
  // 二分查找
  let lo = 0, hi = wdraw.weights.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wdraw.weights[mid] < r) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return wdraw.values[lo];
}

// ─────────────────────────────────────────────
// 百家乐规则
// ─────────────────────────────────────────────

/**
 * 计算点数（取模10）
 */
function handTotal(cards) {
  return cards.reduce((sum, c) => sum + c, 0) % 10;
}

/**
 * 模拟一局百家乐，从当前牌靴中抽牌
 * 使用局部频次数组模拟（不修改原始牌靴），速度极快
 *
 * @param {number[]} localDeck - 长度10的数组，localDeck[v] = 剩余张数
 * @param {number} deckTotal - 总牌数
 * @returns {{ triggered: boolean, cardCount: number, multiplier: number }}
 */
function simulateHand(localDeck, deckTotal) {
  // 内联随机抽牌函数（避免对象开销）
  function draw() {
    let r = Math.random() * deckTotal;
    for (let v = 0; v <= 9; v++) {
      if (localDeck[v] > 0) {
        r -= localDeck[v];
        if (r < 0) {
          localDeck[v]--;
          deckTotal--;
          return v;
        }
      }
    }
    // 兜底（浮点精度问题）
    for (let v = 9; v >= 0; v--) {
      if (localDeck[v] > 0) {
        localDeck[v]--;
        deckTotal--;
        return v;
      }
    }
    return 0;
  }

  // 发初始4张牌：闲1，庄1，闲2，庄2
  const p = [draw(), draw()];
  const b = [draw(), draw()];

  let pTotal = handTotal(p);
  let bTotal = handTotal(b);

  // 天牌判断（Natural）：8或9不再补牌
  if (pTotal >= 8 || bTotal >= 8) {
    const cardCount = 4;
    const triggered = (pTotal === 7 && bTotal === 6); // 天牌时不可能同时满足此条件，但保留逻辑
    return { triggered, cardCount, multiplier: triggered ? 30 : 0 };
  }

  let pThirdCard = null;

  // 闲家补牌规则：点数 <= 5 补牌
  if (pTotal <= 5) {
    pThirdCard = draw();
    p.push(pThirdCard);
    pTotal = handTotal(p);
  }

  // 庄家补牌规则
  let bDrew = false;
  if (pThirdCard === null) {
    // 闲家未补牌：庄家点数 <= 5 补牌
    if (bTotal <= 5) {
      b.push(draw());
      bTotal = handTotal(b);
      bDrew = true;
    }
  } else {
    // 闲家已补牌：根据庄家点数和闲家第三张牌决定
    const p3 = pThirdCard;
    let bankerDraws = false;
    switch (bTotal) {
      case 0: case 1: case 2:
        bankerDraws = true;
        break;
      case 3:
        bankerDraws = (p3 !== 8);
        break;
      case 4:
        bankerDraws = (p3 >= 2 && p3 <= 7);
        break;
      case 5:
        bankerDraws = (p3 >= 4 && p3 <= 7);
        break;
      case 6:
        bankerDraws = (p3 === 6 || p3 === 7);
        break;
      case 7:
        bankerDraws = false;
        break;
    }
    if (bankerDraws) {
      b.push(draw());
      bTotal = handTotal(b);
      bDrew = true;
    }
  }

  const cardCount = p.length + b.length;

  // 超级幸运7触发条件：闲家赢 且 闲7 且 庄6
  const triggered = (pTotal === 7 && bTotal === 6);

  let multiplier = 0;
  if (triggered) {
    if (cardCount === 4) multiplier = 30;
    else if (cardCount === 5) multiplier = 40;
    else if (cardCount === 6) multiplier = 100;
  }

  return { triggered, cardCount, multiplier };
}

// ─────────────────────────────────────────────
// 蒙特卡洛模拟
// ─────────────────────────────────────────────

/**
 * 运行蒙特卡洛模拟，计算超级幸运7的触发概率
 * @param {Object} deck - 当前牌靴频次表
 * @param {number} iterations - 模拟次数（默认100万）
 * @returns {Object} 模拟结果
 */
function calculateProbability(deck, iterations = 1_000_000) {
  // 将牌靴对象转为局部数组，提升模拟内循环速度
  const baseDeck = new Array(10).fill(0);
  for (let v = 0; v <= 9; v++) {
    baseDeck[v] = deck[v] || 0;
  }
  const baseTotal = baseDeck.reduce((a, b) => a + b, 0);

  if (baseTotal < 4) {
    return null; // 牌不够
  }

  let count4 = 0, count5 = 0, count6 = 0;
  let totalMultiplier = 0;

  for (let i = 0; i < iterations; i++) {
    // 每次模拟复制一份局部牌靴
    const localDeck = baseDeck.slice();
    const result = simulateHand(localDeck, baseTotal);

    if (result.triggered) {
      if (result.cardCount === 4) count4++;
      else if (result.cardCount === 5) count5++;
      else if (result.cardCount === 6) count6++;
      totalMultiplier += result.multiplier;
    }
  }

  const totalTriggered = count4 + count5 + count6;
  const prob = totalTriggered / iterations;
  const prob4 = count4 / iterations;
  const prob5 = count5 / iterations;
  const prob6 = count6 / iterations;
  const ev = totalMultiplier / iterations; // 每注期望收益（不含本金）

  return {
    iterations,
    totalTriggered,
    prob,       // 总触发概率
    prob4,      // 4张触发概率
    prob5,      // 5张触发概率
    prob6,      // 6张触发概率
    ev,         // 期望值（每注1单位）
    count4,
    count5,
    count6,
  };
}

// ─────────────────────────────────────────────
// 输出显示
// ─────────────────────────────────────────────

/**
 * 格式化百分比，保留4位有效小数
 */
function fmtPct(p) {
  return (p * 100).toFixed(4) + '%';
}

/**
 * 显示模拟结果
 */
function displayResults(results, deck) {
  if (!results) {
    console.log('\n  ⚠ 剩余牌数不足，无法模拟。\n');
    return;
  }

  const remaining = totalCards(deck);
  const { prob, prob4, prob5, prob6, ev, iterations } = results;

  console.log('\n' + '═'.repeat(52));
  console.log('         超级幸运7 (Super Lucky 7) 概率分析');
  console.log('═'.repeat(52));
  console.log(`  模拟次数：${iterations.toLocaleString()} 局`);
  console.log(`  剩余牌数：${remaining} 张`);
  console.log('─'.repeat(52));
  console.log(`  触发概率（合计）：${fmtPct(prob)}`);
  console.log(`    ├─ 4张牌（赔率 30x）：${fmtPct(prob4)}`);
  console.log(`    ├─ 5张牌（赔率 40x）：${fmtPct(prob5)}`);
  console.log(`    └─ 6张牌（赔率100x）：${fmtPct(prob6)}`);
  console.log('─'.repeat(52));
  console.log(`  期望值（每注1单位）：${ev.toFixed(4)}`);
  console.log(`  庄家优势（边缘）：${((1 - ev) * 100).toFixed(2)}%`);
  console.log('═'.repeat(52));
  displayDeck(deck);
}

/**
 * 显示当前牌靴剩余牌数
 */
function displayDeck(deck) {
  console.log('\n  【当前牌靴剩余牌数】');
  console.log('  ┌──────────────────────────────────────────────────┐');
  const labels = {
    1: ' A', 2: ' 2', 3: ' 3', 4: ' 4', 5: ' 5',
    6: ' 6', 7: ' 7', 8: ' 8', 9: ' 9', 0: '10/J/Q/K'
  };
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  let line = '  │';
  for (const v of order) {
    line += ` ${labels[v]}:${String(deck[v] || 0).padStart(3)}`;
  }
  line += ' │';
  console.log(line);
  console.log('  └──────────────────────────────────────────────────┘');
  console.log(`  合计：${totalCards(deck)} 张\n`);
}

// ─────────────────────────────────────────────
// 输入解析
// ─────────────────────────────────────────────

/**
 * 解析用户输入的牌面
 * 支持格式：数字1-9, 0, A/a, T/t, J/j, Q/q, K/k, 10
 * 示例："7 6 K A 3" 或 "7,6,K,A,3"
 * @param {string} input
 * @returns {number[]|null} 牌面值数组，解析失败返回null
 */
function parseCardInput(input) {
  // 支持空格、逗号、中文逗号分隔
  const tokens = input.trim().split(/[\s,，]+/).filter(t => t.length > 0);
  if (tokens.length === 0) return [];

  const cards = [];
  for (const token of tokens) {
    const t = token.toUpperCase();
    let value;
    if (t === 'A') {
      value = 1;
    } else if (t === '10' || t === 'T' || t === 'J' || t === 'Q' || t === 'K') {
      value = 0;
    } else if (/^[0-9]$/.test(t)) {
      value = parseInt(t, 10);
    } else {
      console.log(`  ✗ 无法识别的牌面："${token}"（支持：A, 2-9, 10, J, Q, K）`);
      return null;
    }
    cards.push(value);
  }
  return cards;
}

// ─────────────────────────────────────────────
// 主交互循环
// ─────────────────────────────────────────────

function printHelp() {
  console.log('\n  【使用说明】');
  console.log('  输入已发出的牌，用空格或逗号分隔，例如：7 6 K A 3');
  console.log('  支持牌面：A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K');
  console.log('  命令：');
  console.log('    calc / c   - 立即运行模拟并计算概率');
  console.log('    reset / r  - 重置牌靴为8副新牌');
  console.log('    show / s   - 显示当前牌靴剩余牌数');
  console.log('    help / h   - 显示此帮助信息');
  console.log('    quit / q   - 退出程序\n');
}

async function main() {
  console.log('\n' + '█'.repeat(52));
  console.log('   超级幸运7 (Super Lucky 7) 百家乐概率计算器');
  console.log('   8副牌 · 蒙特卡洛模拟 · 100万次迭代');
  console.log('█'.repeat(52));
  printHelp();

  let deck = initDeck();
  let needsCalc = true; // 标记是否需要重新计算

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '  > 输入已发牌或命令: ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    const cmd = input.toLowerCase();

    // 命令处理
    if (cmd === 'quit' || cmd === 'q' || cmd === 'exit') {
      console.log('\n  再见！祝您好运！\n');
      rl.close();
      process.exit(0);
    }

    if (cmd === 'help' || cmd === 'h') {
      printHelp();
      rl.prompt();
      return;
    }

    if (cmd === 'reset' || cmd === 'r') {
      deck = initDeck();
      needsCalc = true;
      console.log('\n  牌靴已重置为8副新牌（共416张）。');
      displayDeck(deck);
      rl.prompt();
      return;
    }

    if (cmd === 'show' || cmd === 's') {
      displayDeck(deck);
      rl.prompt();
      return;
    }

    if (cmd === 'calc' || cmd === 'c') {
      if (!needsCalc) {
        console.log('\n  (牌靴未变化，重新计算...)');
      }
      console.log('\n  正在模拟100万局，请稍候...');
      const start = Date.now();
      const results = calculateProbability(deck);
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      displayResults(results, deck);
      console.log(`  计算耗时：${elapsed} 秒`);
      needsCalc = false;
      rl.prompt();
      return;
    }

    // 否则视为输入牌面
    const cards = parseCardInput(input);
    if (cards === null) {
      // 解析错误，已在parseCardInput中打印
      rl.prompt();
      return;
    }
    if (cards.length === 0) {
      rl.prompt();
      return;
    }

    // 从牌靴中移除这些牌
    let removedCount = 0;
    let failed = false;
    for (const v of cards) {
      if (!removeCard(deck, v)) {
        const label = v === 0 ? '10/J/Q/K' : String(v === 1 ? 'A' : v);
        console.log(`  ✗ 牌靴中已无 "${label}"（剩余0张），操作取消。`);
        // 回滚已移除的牌
        for (let i = 0; i < removedCount; i++) {
          deck[cards[i]]++;
        }
        failed = true;
        break;
      }
      removedCount++;
    }

    if (!failed) {
      const labels = cards.map(v => {
        if (v === 0) return '10/J/Q/K';
        if (v === 1) return 'A';
        return String(v);
      });
      console.log(`  已移除：${labels.join(', ')}（共 ${cards.length} 张）`);
      needsCalc = true;

      // 自动计算
      console.log('\n  正在模拟100万局，请稍候...');
      const start = Date.now();
      const results = calculateProbability(deck);
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      displayResults(results, deck);
      console.log(`  计算耗时：${elapsed} 秒`);
      needsCalc = false;
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch(err => {
  console.error('程序错误:', err);
  process.exit(1);
});
