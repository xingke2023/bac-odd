# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 运行与部署

```bash
# 启动 / 重启后端（PM2）
pm2 restart lucky7-api

# 查看日志
pm2 logs lucky7-api --lines 20 --nostream

# 直接测试 API
curl -s http://127.0.0.1:3777/api/calc
curl -s http://127.0.0.1:3777/api/dragon-impact
```

前端是纯静态 HTML，修改任意 `.html` 文件后直接刷新浏览器即可，无需构建。

## 访问地址

- 外部访问：`http://<server-ip>:8777`
- Nginx 监听 8777，静态文件根目录为 `/var/www/lucky7/`
- Nginx 将 `/lucky7-api/` 反向代理到 `http://127.0.0.1:3777/api/`

## 架构

### 文件说明

| 文件 | 说明 |
|------|------|
| `baccarat-enum.js` | **核心枚举引擎**（可复用组件，见下） |
| `server.js` | Node.js HTTP API 服务，端口 3777 |
| `index.html` | 幸运6幸运7概率计算器前端 |
| `dragon-bonus.html` | 龙宝（Dragon Bonus）概率计算器前端 |
| `dragon-impact.html` | 龙宝牌值影响分析前端 |
| `simulate.html` | 综合随机发牌模拟器（4种投注项可下注机会统计） |
| `lucky7-sim.html` | 超级幸运7专项模拟统计（可下注机会 + 盈亏追踪） |
| `lucky6-three-sim.html` | 幸运6三张牌专项模拟统计（同上，庄3张=6赔×50） |
| `dragon-sim.html` | 龙宝专项模拟统计（闲/庄龙宝可下注机会 + 盈亏追踪） |
| `lucky7.js` | 早期 CLI 版本，已弃用 |

### baccarat-enum.js — 精确枚举引擎

百家乐概率计算的核心，**可独立复用于任何项目**。

#### 核心算法

**数据结构**：牌靴用 `deck[0..9]` 整数数组表示各点值剩余张数。`0` 代表 10/J/Q/K（4种花色×4张×8副=128张），`1-9` 各 32 张（4张×8副）。

**枚举策略**：按百家乐真实发牌顺序 P1→B1→P2→B2→[P3]→[B3] 做 4~6 层嵌套循环，对每张牌：
1. 检查剩余张数（`if (!d[v]) continue`）
2. 计算该路径概率权重：`w_next = w_prev * d[v] / remaining`，同时 `d[v]--`（原地修改，回溯时 `d[v]++`）
3. 到达叶节点时调用所有 collectors

**概率精确性**：权重连乘体现超几何分布（不放回抽样），无随机误差，所有叶节点权重之和精确等于 1.0。

**分支逻辑**（`enumerate` 函数内，处理完 P1,B1,P2,B2 后）：
```
pT = (p1+p2) % 10,  bT = (b1+b2) % 10

├─ pT≥8 或 bT≥8 → 天牌，直接结局（4张）
├─ pT≥6（闲站）
│   ├─ bT≤5 → 庄补 B3（5张结局）
│   └─ bT≥6 → 庄也站（4张结局）
└─ pT≤5（闲补 P3）
    ├─ bankerDraws(bT, p3)=true → 庄再补 B3（6张结局）
    └─ bankerDraws(bT, p3)=false → 庄站（5张结局）
```

**庄家补牌规则** `bankerDraws(bTot, p3)`：
| 庄点数 | 补牌条件（基于闲第三张 p3） |
|--------|--------------------------|
| 0-2 | 永远补 |
| 3 | p3 ≠ 8 |
| 4 | p3 ∈ [2,7] |
| 5 | p3 ∈ [4,7] |
| 6 | p3 ∈ {6,7} |
| 7 | 永远不补 |

**Collector 接口**：任意对象，只需有 `collect(hand)` 方法。`makeBet` / `makeMultiTierBet` 是内置工厂，返回含 `result()` 的 collector。`result()` 返回 `{ prob, ev }`，其中 `ev` = Σ(prob_i × payout_i)（赢得部分，不含-1本金，使用时需自行减去亏损概率）。

**用法**：
```js
const { enumerate, initDeck, makeBet, makeMultiTierBet } = require('./baccarat-enum');

const deck = initDeck(8); // 8副牌，也可直接传修改过的 deck 数组

// 固定赔率投注
const myBet = makeBet(h => h.bTotal === 9 && h.bCount === 2, 25);

// 多档赔率投注（同一注，不同情况赔率不同）
const superSeven = makeMultiTierBet([
  { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 4, payout: 30 },
  { condition: h => h.pTotal === 7 && h.bTotal === 6 && h.cardCount === 6, payout: 100 },
]);

enumerate(deck, [myBet, superSeven]);
console.log(myBet.result()); // { prob: 0.xxxx, ev: 0.xxxx }
```

**hand 对象字段**（collector 收到的每个结局）：
- `pCards / bCards` — 闲/庄牌点值数组
- `pTotal / bTotal` — 闲/庄最终点数（0-9）
- `pCount / bCount` — 闲/庄张数（2或3）
- `cardCount` — 总张数（4、5或6）
- `prob` — 该结局的精确概率权重
- `winner` — `'player'` | `'banker'` | `'tie'`

**快速验证枚举正确性**：
```bash
node -e "
const { enumerate, initDeck } = require('./baccarat-enum');
let total = 0;
enumerate(initDeck(8), [{ collect: h => total += h.prob }]);
console.log(total); // 应输出 1.0000000000
"
```

### server.js — API 服务与投注项定义

#### baccarat-enum.js 在 server.js 中的使用

server.js 引入枚举引擎后，在 `calculateProbability(deck)` 中**一次 `enumerate` 调用同时计算所有功能的所有投注项**（超级幸运7、幸运6、龙宝共21个 collector 并行累加）：

```js
const { enumerate, initDeck, makeBet, makeMultiTierBet } = require('./baccarat-enum');

// 将 deck 对象转为数组格式
const arr = new Array(10).fill(0);
for (let v = 0; v <= 9; v++) arr[v] = deck[v] || 0;

// 定义所有投注项（collector）
const superSeven = makeMultiTierBet([...]);   // 幸运7
const natural7   = makeBet(...);               // 幸运7
// ... 幸运6、龙宝各档 ...

// 一次枚举，所有 collector 同时收到每个结局
enumerate(arr, [superSeven, natural7, three7, combo7,
                banker6Two, banker6Three, banker6Combo,
                pNatural, pWin9, ..., bNatural, bWin9, ...]);

// 读取各自结果
superSeven.result()  // { prob, ev }
pWin9.result()       // { prob, ev }
```

`calcDragonEV(deck)` 是龙宝专用的精简版枚举函数（仅含龙宝14个 collector），供 `calcCardImpact` 反复调用。

#### 所有投注项的触发条件

| 投注项 | 触发条件 | 赔率 |
|--------|----------|------|
| superSeven | 闲=7且庄=6，按总张数分档 | 4张×30, 5张×40, 6张×100 |
| natural7 | 闲2张点数=7且闲赢 | ×15 |
| three7 | 闲3张点数=7且闲赢 | ×30 |
| combo7 | 闲=7且闲赢，按张数分档 | 2张×6, 3张×15 |
| banker6Two | 庄2张点数=6且庄赢 | ×22 |
| banker6Three | 庄3张点数=6且庄赢 | ×50 |
| banker6Combo | 庄=6且庄赢，按张数分档 | 2张×12, 3张×20 |
| 闲/庄龙宝各档 | 见下表 | 见下表 |

**龙宝投注项触发条件**（闲龙宝，庄龙宝对称）：

| key | 条件 | 赔率 |
|-----|------|------|
| natural | 闲赢 且 isNatural(pCards) | ×1 |
| win9 | 闲赢 且 非例牌 且 pTotal-bTotal=9 | ×30 |
| win8 | 闲赢 且 非例牌 且 差=8 | ×10 |
| win7 | 闲赢 且 非例牌 且 差=7 | ×5 |
| win6 | 闲赢 且 非例牌 且 差=6 | ×3 |
| win5 | 闲赢 且 非例牌 且 差=5 | ×2 |
| win4 | 闲赢 且 非例牌 且 差=4 | ×1 |

`isNatural(cards)` = `(cards[0] + cards[1]) % 10 >= 8`（头两张原始点值之和模10 ≥ 8）

**ev 字段语义**：`result().ev` = Σ(prob_i × payout)，只含赢得部分。**净期望 = ev - (1 - winProb)**，需调用方自己减去未触发时的-1损失。

#### 全部 API 端点

**牌靴管理（有状态，基于会话）：**
- `GET /api/calc` — 返回当前会话牌靴的完整计算结果
- `POST /api/remove` `{ cards: [0,7,3] }` — 移除牌，返回更新后的牌靴和期望值
- `POST /api/reset` — 重置为新牌靴
- `GET /api/status` — 返回牌靴状态（不触发枚举）
- `GET /api/dragon-impact` — 返回每张牌（0-9）移除1张后对龙宝EV的影响值

**随机模拟（无状态，每次独立洗牌）：**
- `POST /api/simulate` `{ hands: N }` — 综合模拟，返回完整 result（21个collector）+ 各投注项可下注统计
- `POST /api/simulate-s7` `{ hands: N }` — 仅超级幸运7，3个collector，约7×快于综合模拟；返回 `{ actualHands, deck, bettable, bettableHands, prob, ev }`
- `POST /api/simulate-l6three` `{ hands: N }` — 仅幸运6三张牌（庄3张=6且庄赢，×50）；返回结构同上
- `POST /api/simulate-dragon` `{ hands: N }` — 闲/庄龙宝；返回 `{ actualHands, deck, bettablePlayer, bettableBanker, bettableHandsPlayer, bettableHandsBanker, playerEV, bankerEV }`

**模拟返回的 `bettableHands` 数组结构**（每项代表一次可下注机会）：
```js
{
  hand: 42,           // 第几局发完后判定为可下注
  edge: -0.3120,      // 庄家优势（负=玩家有利），单位 %
  nextResult: {
    hit: true,        // 下一局是否命中
    payout: 30,       // 命中时赔率（未命中为0）
    cardCount: 6,     // 总牌张数（仅命中时有意义）
    noNextHand: true  // 仅当该局是最后一局时存在
  }
}
```

**盈亏计算**（前端通用）：赔率×100即盈利金额（下注¥100，×30赔率→盈利¥3000拿回¥3100）：
```js
profit += nr.hit ? nr.payout * 100 : -100;
```

**result 对象结构**（`/api/calc` 和 `/api/remove` 返回）：
- 幸运7相关字段：`prob/ev`（超级7）、`probNatural7/evNatural7`、`probThree7/evThree7`、`probCombo/evCombo`
- 幸运6相关字段：`probBanker6Two/evBanker6Two`、`probBanker6Three/evBanker6Three`、`probBanker6Combo/evBanker6Combo`
- 龙宝字段：`dragon.player` / `dragon.banker`，各含 `natural`、`win9`~`win4`，每项为 `{ prob, ev }`

**龙宝净期望计算**（前端通用公式）：
```js
let totalEv = 0, totalWinProb = 0;
for (const key of ['natural','win9','win8','win7','win6','win5','win4']) {
  totalEv += side[key].ev;
  totalWinProb += side[key].prob;
}
const netEV = totalEv - (1 - totalWinProb);
```

#### calcCardImpact — 牌值影响算法

```
对每个牌值 v（0-9）：
  1. 若 deck[v] = 0，跳过（返回 null）
  2. 复制 deck，deck_copy[v]--
  3. 用 calcDragonEV(deck_copy) 重新枚举（独立枚举，非增量）
  4. impact[v] = EV(deck_copy) - EV(base)
```

共触发 **11 次枚举**（1次基准 + 最多10次差值），是最慢的端点，前端异步加载不阻塞主 UI。

#### 模拟函数 — pendingBet 设计模式

所有模拟函数（`simulateSuperSeven`、`simulateLucky6Three`、`simulateDragonBonus`）共用同一模式：

```
Fisher-Yates 洗牌 → 逐局发牌 → 每局结束后：
  1. 若存在 pendingBet，记录本局实际结果到 nextResult，push 进数组
  2. 对剩余牌靴精确枚举，计算净期望
  3. 若净期望 > THRESHOLD（−0.005），生成新 pendingBet
```

`calcSuperSevenEV(arr)` — 仅3个collector，约7×快于 `calculateProbability`，供 simulate-s7 逐局调用。
`calcLucky6ThreeEV(arr)` — 仅1个collector（庄3张=6且庄赢）。
`calcDragonEV(deck)` — 14个collector（闲/庄各7档），返回 `{ player, banker }` 净期望，供 simulate-dragon 和 calcCardImpact 调用。

#### 性能特征

- 新牌靴（416张）完整枚举 **< 1秒**（Node.js 单线程）
- `FRESH_DECK_RESULT` 启动时预计算，reset 零枚举开销
- `cachedResult` 移除牌后置 null，下次 `/api/calc` 才重新枚举（懒计算）
- `dragon-impact` 不缓存，每次请求实时计算

**会话管理**：用 `X-Session-Id` 请求头识别会话（前端存于 `localStorage`），服务端 `sessions` Map 维护每个会话的牌靴状态。

### 前端文件

所有前端文件均为单文件（HTML + CSS + JS 全在一起），共用同一会话 localStorage key `lucky7_dragon_sid`（龙宝两页）和 `lucky7_sid`（幸运7页）。

**页面间导航关系**：
- `index.html` → `dragon-bonus.html` → `dragon-impact.html`
- `index.html` → `simulate.html`（综合模拟器）
- `index.html` → `lucky7-sim.html`（超级幸运7统计）
- `index.html` → `lucky6-three-sim.html`（幸运6三张牌统计）
- `index.html` → `dragon-bonus.html` → `dragon-sim.html`（龙宝统计）
- 龙宝两个页面（`dragon-bonus.html` 和 `dragon-impact.html`）共用 `lucky7_dragon_sid` 会话，牌靴状态互通
- 模拟类页面（`simulate.html`、`lucky7-sim.html`、`lucky6-three-sim.html`、`dragon-sim.html`）不依赖会话，每次独立随机洗牌

**apiFetch 封装**（三个前端文件均有，逻辑相同）：自动读写 localStorage 中的 session key，处理响应头中的 `X-Session-Id`。

**模拟类页面公共设计**（`simulate.html`、`lucky7-sim.html`、`lucky6-three-sim.html`、`dragon-sim.html`）：
- 输入：局数（1-10000）+ 重复次数（1-100）
- 流式渲染：每次 fetch 完成立即 `renderResult()` + `renderHistory()`，不等全部完成
- 可下注阈值：净期望 > −0.005（庄家优势 < 0.5%）
- 基准期望（满牌靴）：超级幸运7 = −14.83%，幸运6三张 = −15.25%，闲龙宝 = −9.06%，庄龙宝 = −15.14%

## 牌值编码

`0` = 10/J/Q/K（点数为0），`1` = A，`2-9` = 面值。新牌靴：`deck[0]=128`，`deck[1..9]=32`。

## lucky7.js — 早期蒙特卡洛版本（已弃用）

> 保留作算法演进参考，不再维护，不被 server.js 引用。

### 算法：蒙特卡洛模拟

与 `baccarat-enum.js` 的精确枚举完全不同，`lucky7.js` 用随机模拟估算概率：

```
重复 N 次（默认100万）：
  1. 复制当前牌靴为局部数组 localDeck
  2. 按权重随机抽牌（O(n) 线性扫描），模拟一局百家乐
  3. 统计超级幸运7的触发次数和赔率档
概率 = 触发次数 / N
EV   = Σ(赔率 × 触发次数) / N
```

**随机抽牌**：`simulateHand` 内联 `draw()` 函数，每次 `Math.random() * remaining`，线性扫描 `localDeck[0..9]` 找到对应点值，并原地修改 `localDeck[v]--`。（外部 `buildWeightedDraw` 提供了二分查找版本但未在模拟热循环中使用。）

**与精确枚举的对比**：

| 维度 | lucky7.js（蒙特卡洛） | baccarat-enum.js（精确枚举） |
|------|----------------------|------------------------------|
| 结果 | 近似值，有统计误差（±0.01% 量级） | 精确到浮点精度，误差=0 |
| 速度 | 100万次迭代约 2-5 秒 | 一次枚举 < 1 秒 |
| 扩展性 | 新投注项只需改统计逻辑 | 新投注项加一个 collector |
| 牌靴变化 | 每次重新模拟 | 移除牌后下次枚举（懒计算） |
| 适用场景 | 快速原型验证 | 生产精确计算 |

**为何废弃**：精确枚举不仅更准确，速度也更快，且天然支持同时计算多个投注项（所有 collector 在一次遍历中并行累加），无需为每个新投注项单独跑一遍模拟。
