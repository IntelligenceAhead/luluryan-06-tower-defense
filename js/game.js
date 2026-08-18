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
// 怪物只需要两个属性：
//   distance — 已经沿路径走了多远（像素）
//   speed    — 每秒钟走多少像素
function create_enemy() {
  return {
    distance: 0,
    speed: 80,   // 每秒 80 像素
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
function create_tower(col, row) {
  return {
    col: col,
    row: row,
    range: 2.2,   // 射程（格子数）——第3步打怪物时才真正派上用场
    damage: 10,   // 攻击力（第3步用）
  };
}

// 找到离塔最近的怪物（直线距离）。
// 第3步实现攻击时会加上"必须在射程内"的条件。
function nearest_enemy(tower) {
  const tx = (tower.col + 0.5) * GRID.cell;
  const ty = (tower.row + 0.5) * GRID.cell;
  let best = null;
  let best_dist = Infinity;
  for (const enemy of game.enemies) {
    const pos = enemy_position(enemy);
    const d = Math.hypot(pos.x - tx, pos.y - ty);
    if (d < best_dist) {
      best_dist = d;
      best = enemy;
    }
  }
  return best;
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
  // 全部通过：建造！（花钱的规则第3步再加）
  game.towers.push(create_tower(col, row));
  return null;
}

// ============ 游戏状态 ============
const game = {
  enemies: [create_enemy()],   // 测试阶段：先放一只怪物
  towers: [],                  // 玩家建造的塔
  hover_cell: null,            // 鼠标悬停的格子（界面预览用，暂存在这）
  last_time: 0,                // 上一帧的时间戳（用来算时间差）
};

// 更新游戏状态（每帧调用一次）
// delta_time：距离上一帧过去了多少毫秒
function update_game(delta_time) {
  for (const enemy of game.enemies) {
    enemy.distance += enemy.speed * (delta_time / 1000);
    // 走完全程后回到起点重新走（临时循环，方便观察效果）
    if (enemy.distance >= path_total_length()) {
      enemy.distance = 0;
    }
  }
}
