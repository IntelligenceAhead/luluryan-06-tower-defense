/**
 * game.js — 游戏逻辑层
 *
 * 职责：地图数据、路径、怪物移动、建塔规则等所有"数学计算"。
 * 铁律：本文件不出现任何 Canvas 绘图代码（不画任何东西）。
 * 美术全部在 render.js 里完成 —— 以后换剪纸风/皮影风时，
 * 只重写 render.js，本文件一行都不用改。
 *
 * 概念回顾（对应植物大战僵尸）：
 *   PATH   = 僵尸走的那条路
 *   enemy  = 一只僵尸，只需要知道"走了多远"和"速度"
 *   tower  = 一座炮塔，记录"在哪个格子"和"射程"等属性
 */

// ============ 地图配置 ============
// 地图是 20列 × 12行 的网格，每格 48 像素
const GRID = {
  cols: 20,
  rows: 12,
  cell: 48,
};

// ============ 路径定义 ============
// 怪物沿"拐点列表"走：从入口开始，依次走向下一个拐点，最后从出口离开。
// 坐标为 (列, 行)。-1 和 20 表示在屏幕外（入口/出口）。
//
// 路径走向示意：
//   入口(-1,3) → 右走到 (16,3) → 下走到 (16,8) → 左走到 (3,8)
//   → 下走到 (3,11) → 右走到 出口(20,11)
const PATH = [
  { col: -1, row: 3 },   // 入口（屏幕外左侧）
  { col: 16, row: 3 },   // 右转往下
  { col: 16, row: 8 },   // 左转
  { col: 3, row: 8 },    // 往下
  { col: 3, row: 11 },   // 右转
  { col: 20, row: 11 },  // 出口（屏幕外右侧）
];

// ============ 路径占用格子 ============
// 建塔规则里有一句"不能建在道路上"。
// 所以我们先算一遍：哪些格子的中心离路太近（算作"在道路上"）。
// 启动时算一次存进 Set，之后每次查询都是"瞬间完成"。
const path_cells = compute_path_cells();

function compute_path_cells() {
  const cells = new Set();
  const half = GRID.cell * 0.35;   // 路宽的一半（和 render.js 保持一致）
  for (let col = 0; col < GRID.cols; col++) {
    for (let row = 0; row < GRID.rows; row++) {
      const cx = (col + 0.5) * GRID.cell;
      const cy = (row + 0.5) * GRID.cell;
      if (distance_to_path(cx, cy) <= half + 1) {
        cells.add(col + "," + row);
      }
    }
  }
  return cells;
}

// 一个点到整条路径的最短距离（逐段取最小值）
function distance_to_path(x, y) {
  let min = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = path_point(PATH[i]);
    const b = path_point(PATH[i + 1]);
    min = Math.min(min, distance_to_segment(x, y, a, b));
  }
  return min;
}

// 一个点到一条线段的距离（数学：垂足投影 + 勾股定理）
function distance_to_segment(px, py, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = px - a.x;
  const apy = py - a.y;
  const len2 = abx * abx + aby * aby;
  // t = 垂足在这条线段上的位置（0 在 a 点，1 在 b 点）
  let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));   // 夹在 0~1 之间
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(px - cx, py - cy);
}

// 拐点 (列, 行) → 像素坐标 (格子中心)
function path_point(p) {
  return {
    x: (p.col + 0.5) * GRID.cell,
    y: (p.row + 0.5) * GRID.cell,
  };
}

// ============ 怪物 ============
// 怪物属性：
//   distance — 已经沿路径走了多远（像素）
//   speed    — 每秒钟走多少像素
//   hp       — 当前血量（≤0 表示死亡）
//   max_hp   — 最大血量（画血条时用来算比例）
//   reward   — 击杀后奖励的金币
//
// stats 参数由波次配置提供（见 WAVES），这样每波可以有不同的怪物强度
function create_enemy(stats) {
  return {
    distance: 0,
    speed: stats.speed,
    hp: stats.hp,
    max_hp: stats.hp,
    reward: stats.reward,
  };
}

// 把"走了多远"换算成屏幕上的 (x, y) 坐标。
// 思路：沿着拐点逐段走，distance 足够跨过当前段，就减去该段长度进入下一段。
function enemy_position(enemy) {
  let remaining = enemy.distance;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const seg_len = segment_length(a, b);   // 这一段（a → b）的长度
    if (remaining <= seg_len) {
      // 落在这段路上：按比例算出坐标
      const t = remaining / seg_len;
      return {
        x: (a.col + (b.col - a.col) * t) * GRID.cell + GRID.cell / 2,
        y: (a.row + (b.row - a.row) * t) * GRID.cell + GRID.cell / 2,
      };
    }
    remaining -= seg_len;   // 走完这一整段，继续下一段
  }
  // 走完全程：停在出口
  const last = PATH[PATH.length - 1];
  return {
    x: last.col * GRID.cell + GRID.cell / 2,
    y: last.row * GRID.cell + GRID.cell / 2,
  };
}

// 勾股定理求两点间距离（顺便把"格"换算成"像素"）
function segment_length(a, b) {
  const dx = (b.col - a.col) * GRID.cell;
  const dy = (b.row - a.row) * GRID.cell;
  return Math.hypot(dx, dy);
}

// 路径总长度（走到终点一共多少像素）
function path_total_length() {
  let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    total += segment_length(PATH[i], PATH[i + 1]);
  }
  return total;
}

// ============ 塔 ============
const TOWER_COST = 100;   // 建造一座塔要花 100 金币

function create_tower(col, row) {
  return {
    col: col,
    row: row,
    range: 2.2,           // 射程（格子数）
    damage: 20,           // 每发子弹的伤害
    fire_interval: 0.5,   // 两次开火的间隔（秒）→ 每秒 2 发
    cooldown: 0,          // 距离下次开火还剩多少秒（≤0 表示可以开火）
  };
}

// 塔的像素坐标（格子中心）
function tower_position(tower) {
  return {
    x: (tower.col + 0.5) * GRID.cell,
    y: (tower.row + 0.5) * GRID.cell,
  };
}

// 找到离塔最近的怪物（直线距离），用于炮管瞄准。
function nearest_enemy(tower) {
  const pos = tower_position(tower);
  let best = null;
  let best_dist = Infinity;
  for (const enemy of game.enemies) {
    const ep = enemy_position(enemy);
    const d = Math.hypot(ep.x - pos.x, ep.y - pos.y);
    if (d < best_dist) {
      best_dist = d;
      best = enemy;
    }
  }
  return best;
}

// 找到"射程内"离塔最近的怪物，用于开火。
// 关键：射程判断用像素距离（勾股定理），和画出来的圆形射程圈一致。
// 如果只按格子数近似，就会出现"圈外挨打"或"圈内不打"的视觉矛盾。
function enemy_in_range(tower) {
  const pos = tower_position(tower);
  const range_px = tower.range * GRID.cell;
  let best = null;
  let best_dist = Infinity;
  for (const enemy of game.enemies) {
    const ep = enemy_position(enemy);
    const d = Math.hypot(ep.x - pos.x, ep.y - pos.y);
    if (d <= range_px && d < best_dist) {
      best_dist = d;
      best = enemy;
    }
  }
  return best;
}

// ============ 子弹 ============
// 子弹是"追踪弹"：记下目标怪物，每帧朝它的当前位置飞。
function create_bullet(tower, target) {
  const pos = tower_position(tower);
  return {
    x: pos.x,
    y: pos.y,
    target: target,      // 追踪哪只怪物
    speed: 260,          // 每秒 260 像素
    damage: tower.damage,// 命中时造成的伤害（由塔决定）
    hit: false,          // 是否已命中（命中后子弹消失）
  };
}

// 尝试在 (col, row) 建塔。
// 成功：返回 null
// 失败：返回错误原因（中文，供界面显示）
function place_tower(col, row) {
  // 规则1：位置必须在地图内
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) {
    return "点击位置在地图外";
  }
  // 规则2：不能建在道路上（怪物要走路）
  if (path_cells.has(col + "," + row)) {
    return "不能建在道路上，会挡住怪物";
  }
  // 规则3：一格只能建一座塔
  if (game.towers.some(function (t) { return t.col === col && t.row === row; })) {
    return "这里已经有塔了";
  }
  // 规则4：钱要够（经济系统的第一条规则）
  if (game.gold < TOWER_COST) {
    return "金币不足：建塔需要 " + TOWER_COST + " 金币，当前只有 " + game.gold;
  }
  // 全部通过：扣钱 + 建造！
  game.gold -= TOWER_COST;
  game.towers.push(create_tower(col, row));
  return null;
}

// ============ 波次配置 ============
// 每波一条记录：怪物数量、出怪节奏（gaps）、怪物属性。
//
// gaps = "出怪节奏表"：出完一只怪后，等多少秒出下一只。
// 一个数字 = 均匀节奏（无聊）；一串数字 = 有起伏的节奏（有趣）。
// 如 [1.2, 0.3, 0.3] 表示：等 1.2 秒 → 两只连着冲出来（间隔仅 0.3 秒）→ 循环。
// 这样敌人会结成"小团伙"进攻，玩家要应对突发压力。
//
// 难度设计：逐波小步增强（数量↑、团伙变大、血量↑、速度↑），不突变。
const WAVES = [
  { enemies: 3,  gaps: [1.5],                          hp: 100, speed: 80, reward: 50 },   // 第1波：热身，均匀出怪
  { enemies: 5,  gaps: [1.2, 0.4, 0.4],                hp: 100, speed: 80, reward: 50 },   // 第2波：双人小团伙
  { enemies: 8,  gaps: [1.2, 0.3, 0.3, 1.2],           hp: 120, speed: 85, reward: 50 },   // 第3波：双人团伙，循环
  { enemies: 10, gaps: [1.0, 0.25, 0.25, 0.25, 1.5],   hp: 150, speed: 90, reward: 55 },   // 第4波：三人团伙
  { enemies: 12, gaps: [0.8, 0.2, 0.2, 0.2, 0.2, 1.4], hp: 180, speed: 95, reward: 60 },   // 第5波：四人长队突击
];
const WAVE_BREAK_SECONDS = 3;   // 波次之间的休息秒数

// ============ 游戏状态 ============
const game = {
  enemies: [],                 // 场上的怪物
  towers: [],                  // 玩家建造的塔
  bullets: [],                 // 飞行中的子弹
  gold: 300,                   // 初始金币：够建 3 座塔
  lives: 10,                   // 基地生命值：漏一只怪扣 1 点
  state: "playing",            // 游戏状态：playing / won / lost
  wave_index: 0,               // 当前第几波（0 开始）
  spawn_remaining: 0,          // 本波还剩几只没出场
  spawn_timer: 0,              // 距离下一次出怪还剩多少秒
  spawn_gap_index: 0,          // 现在轮到节奏表（gaps）里的第几个间隔
  wave_break_timer: 0,         // 波次间休息计时
  hover_cell: null,            // 鼠标悬停的格子（界面预览用，暂存在这）
  last_time: 0,                // 上一帧的时间戳（用来算时间差）
};

// 开始一波：设定本波要出多少只怪
function start_wave(wave) {
  game.spawn_remaining = wave.enemies;
  game.spawn_timer = 0;         // 第一只立刻出场
  game.spawn_gap_index = 0;     // 从节奏表的第一个间隔开始
}

// 重置游戏（重新开始一局）
function restart_game() {
  game.enemies = [];
  game.towers = [];
  game.bullets = [];
  game.gold = 300;
  game.lives = 10;
  game.state = "playing";
  game.wave_index = 0;
  game.spawn_remaining = 0;
  game.spawn_timer = 0;
  game.spawn_gap_index = 0;
  game.wave_break_timer = 0;
  start_wave(WAVES[0]);
}

// 更新游戏状态（每帧调用一次）
// delta_time：距离上一帧过去了多少毫秒
function update_game(delta_time) {
  const dt = delta_time / 1000;   // 换算成秒，方便计算

  // 0. 游戏已结束：冻结世界，什么都不更新
  if (game.state !== "playing") {
    return;
  }

  // 1. 波次管理：出怪 + 推进波次
  if (game.wave_index < WAVES.length) {
    const wave = WAVES[game.wave_index];
    if (game.spawn_remaining > 0) {
      // 本波还有怪没出场：按节奏表（gaps）计时出怪
      game.spawn_timer -= dt;
      if (game.spawn_timer <= 0) {
        game.enemies.push(create_enemy(wave));
        game.spawn_remaining--;
        // 取节奏表里"下一个"间隔，取完一轮回到开头（用 % 取余实现循环）
        const gap = wave.gaps[game.spawn_gap_index % wave.gaps.length];
        game.spawn_gap_index++;
        game.spawn_timer = gap;
      }
    } else if (game.enemies.length === 0) {
      // 本波出完且场上清空：休息几秒，然后进下一波
      game.wave_break_timer += dt;
      if (game.wave_break_timer >= WAVE_BREAK_SECONDS) {
        game.wave_index++;
        game.wave_break_timer = 0;
        if (game.wave_index < WAVES.length) {
          start_wave(WAVES[game.wave_index]);
        } else {
          game.state = "won";   // 所有波次打完：胜利！
        }
      }
    }
  }

  // 2. 怪物移动。走到出口 = 漏怪：扣生命值，怪物消失
  const alive = [];
  for (const enemy of game.enemies) {
    enemy.distance += enemy.speed * dt;
    if (enemy.distance >= path_total_length()) {
      game.lives -= 1;
      if (game.lives <= 0) {
        game.state = "lost";   // 生命值归零：失败！
      }
    } else {
      alive.push(enemy);
    }
  }
  game.enemies = alive;

  // 3. 塔自动开火
  //    每个塔有一个"冷却计时器"：时间一到，只要射程内有怪物就射一发
  for (const tower of game.towers) {
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;              // 还没到开火时间
    const target = enemy_in_range(tower);          // 射程内最近的怪物
    if (!target) continue;                         // 没有目标，继续等
    game.bullets.push(create_bullet(tower, target));
    tower.cooldown = tower.fire_interval;          // 重置冷却
  }

  // 4. 子弹飞行（追踪弹：每帧朝目标的当前位置飞）
  for (const bullet of game.bullets) {
    const tp = enemy_position(bullet.target);
    const dx = tp.x - bullet.x;
    const dy = tp.y - bullet.y;
    const dist = Math.hypot(dx, dy);
    const step = bullet.speed * dt;                // 这一帧能飞多远
    if (dist <= step) {
      // 足够飞到了：命中！
      bullet.target.hp -= bullet.damage;
      bullet.hit = true;
    } else {
      // 还没到：朝目标方向移动 step 距离
      bullet.x += (dx / dist) * step;
      bullet.y += (dy / dist) * step;
    }
  }

  // 5. 移除已命中的子弹
  game.bullets = game.bullets.filter(function (b) { return !b.hit; });

  // 6. 击杀结算：血量归零的怪物移除，发放击杀奖励
  const survivors = [];
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) {
      game.gold += enemy.reward;
    } else {
      survivors.push(enemy);
    }
  }
  game.enemies = survivors;
}

// 游戏启动：开始第 1 波
restart_game();
