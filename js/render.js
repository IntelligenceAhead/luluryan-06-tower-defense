/**
 * render.js — 美术渲染层（黑白线条版）
 *
 * 职责：所有 Canvas 绘制、鼠标交互都集中在这个文件里。
 * 以后要换剪纸风/皮影风：复制本文件改成 render_papercut.js，
 * 保持函数名不变，游戏逻辑（game.js）一行都不用改。
 *
 * 黑白线条风格约定：
 *   背景：白色
 *   线条：黑色，细线为主
 *   网格：浅灰
 *   造型：几何化，白底黑描边
 */

// ============ 初始化 ============
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const status_text = document.getElementById("statusMessage");

// ============ 绘制总入口 ============
// 每一帧：按图层顺序依次绘制（后画的盖在先画的上面）
function draw() {
  draw_background();
  draw_grid();
  draw_path();
  draw_hover();          // 悬停预览格
  draw_towers();         // 玩家建造的塔
  draw_bullets();        // 飞行中的子弹（画在塔上、怪物下）
  for (const enemy of game.enemies) {
    draw_enemy(enemy);   // 怪物画在最上层，走路时"路过"塔
  }
  draw_hud();            // 顶部信息栏：金币等（永远在最上层）
}

// ============ 图层1：背景 ============
function draw_background() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ============ 图层2：网格 ============
// 浅灰细线画出所有格子，暗示"可以建塔的位置"
function draw_grid() {
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  for (let col = 1; col < GRID.cols; col++) {
    line(col * GRID.cell, 0, col * GRID.cell, canvas.height);
  }
  for (let row = 1; row < GRID.rows; row++) {
    line(0, row * GRID.cell, canvas.width, row * GRID.cell);
  }
}

// ============ 图层3：路径 ============
// 每段路 = 浅灰路面 + 两条黑色路沿，怪物走在路中间
function draw_path() {
  // 把拐点换算成像素坐标
  const points = PATH.map(path_point);

  // 逐段画路面和路沿
  for (let i = 0; i < points.length - 1; i++) {
    draw_road_segment(points[i], points[i + 1]);
  }

  // 入口 / 出口标记
  ctx.fillStyle = "#111111";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("入口", 0.5 * GRID.cell, 3.5 * GRID.cell - 18);
  ctx.fillText("出口", 19.5 * GRID.cell, 11.5 * GRID.cell + 26);
}

// 画一段路：浅灰粗线当路面，两侧各一条黑线当路沿
function draw_road_segment(a, b) {
  const half = GRID.cell * 0.35;            // 路宽的一半
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);           // 这段路的长度
  const ox = (-dy / len) * half;            // 垂直于路方向的偏移量 x
  const oy = (dx / len) * half;             // 垂直于路方向的偏移量 y

  // 路面（浅灰粗线）
  ctx.strokeStyle = "#f2f2f2";
  ctx.lineWidth = half * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // 两条黑色路沿
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x + ox, a.y + oy);
  ctx.lineTo(b.x + ox, b.y + oy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x - ox, a.y - oy);
  ctx.lineTo(b.x - ox, b.y - oy);
  ctx.stroke();
}

// ============ 图层4：悬停预览 ============
// 鼠标指到哪格，那格就亮一下：
//   空格子 = 灰色（可以建塔）
//   道路/已有塔 = 红色（不能建塔）
function draw_hover() {
  const cell = game.hover_cell;
  if (!cell) return;
  const occupied = path_cells.has(cell.col + "," + cell.row)
    || game.towers.some(function (t) { return t.col === cell.col && t.row === cell.row; });
  ctx.fillStyle = occupied ? "rgba(200, 0, 0, 0.15)" : "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(cell.col * GRID.cell, cell.row * GRID.cell, GRID.cell, GRID.cell);
}

// ============ 图层5：塔 ============
function draw_towers() {
  for (const tower of game.towers) {
    draw_tower(tower);
  }
}

// 黑白线条版炮塔：半透明射程圈 + 底座圆 + 内圈 + 炮管
function draw_tower(tower) {
  const cx = (tower.col + 0.5) * GRID.cell;
  const cy = (tower.row + 0.5) * GRID.cell;

  ctx.save();
  ctx.translate(cx, cy);

  // 射程圈：半透明灰圆。怪物走进这个圆才会被打（第3步实现攻击）
  ctx.beginPath();
  ctx.arc(0, 0, tower.range * GRID.cell, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;

  // 底座（大圆）
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 内圈（装饰，暗示这是可旋转的炮座）
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.stroke();

  // 炮管：自动指向最近的怪物。
  // 角度计算：atan2(垂直差, 水平差) —— 两点连线与水平方向的夹角
  const target = nearest_enemy(tower);          // 逻辑层负责找目标
  let barrel_angle = -Math.PI / 4;              // 没有目标时，默认朝右上
  if (target) {
    const tp = enemy_position(target);
    barrel_angle = Math.atan2(tp.y - cy, tp.x - cx);
  }
  ctx.rotate(barrel_angle);                     // 旋转画布，让炮管对准目标

  // 炮管（旋转后沿 +x 方向画）
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(22, 0);
  ctx.stroke();

  // 炮口（小圆）
  ctx.beginPath();
  ctx.arc(22, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// ============ 图层6：子弹 ============
// 黑白线条版子弹：一个小黑点
function draw_bullets() {
  ctx.fillStyle = "#111111";
  for (const bullet of game.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============ 图层7：怪物 ============
// 黑白线条版怪物：一个"小幽灵"——圆头 + 椭圆身体 + 两个眼睛 + 头顶血条
function draw_enemy(enemy) {
  const pos = enemy_position(enemy);
  ctx.save();
  ctx.translate(pos.x, pos.y);

  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;

  // 圆头
  ctx.beginPath();
  ctx.arc(0, -8, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 身体（椭圆）
  ctx.beginPath();
  ctx.ellipse(0, 9, 11, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 眼睛（两个小黑点）
  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(-4, -9, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4, -9, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // 血条：画在头顶。先画黑框，再按剩余血量比例填充黑色
  const bar_w = 24;
  const bar_h = 4;
  const bar_x = pos.x - bar_w / 2;
  const bar_y = pos.y - 24;
  const hp_ratio = Math.max(0, enemy.hp / enemy.max_hp);   // 0~1 的比例
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1;
  ctx.strokeRect(bar_x - 1, bar_y - 1, bar_w + 2, bar_h + 2);
  ctx.fillStyle = "#111111";
  ctx.fillRect(bar_x, bar_y, bar_w * hp_ratio, bar_h);
}

// ============ 图层8：信息栏（HUD） ============
// 顶部信息：金币数量。以后关卡、生命值也会画在这里
function draw_hud() {
  ctx.fillStyle = "#111111";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("💰 金币：" + game.gold, 12, 24);
}

// ============ 工具函数 ============
function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// 把鼠标事件坐标换算成画布内的像素坐标
// （canvas 有边框、以后还可能缩放，用比例换算最稳妥）
function event_to_canvas(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// ============ 鼠标交互 ============

// 移动：记录悬停的格子（供每帧的预览高亮使用）
canvas.addEventListener("mousemove", function (event) {
  const pos = event_to_canvas(event);
  const col = Math.floor(pos.x / GRID.cell);
  const row = Math.floor(pos.y / GRID.cell);
  if (col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows) {
    game.hover_cell = { col: col, row: row };
  } else {
    game.hover_cell = null;
  }
});

// 离开画布：取消预览
canvas.addEventListener("mouseleave", function () {
  game.hover_cell = null;
});

// 点击：尝试建塔，把结果显示在状态栏
canvas.addEventListener("click", function (event) {
  const pos = event_to_canvas(event);
  const col = Math.floor(pos.x / GRID.cell);
  const row = Math.floor(pos.y / GRID.cell);

  const error = place_tower(col, row);   // 逻辑层负责判断能不能建
  if (error === null) {
    status_text.textContent = "✅ 炮塔建造完成（花费 " + TOWER_COST + " 金币，剩余 " + game.gold + "）";
  } else {
    status_text.textContent = "❌ " + error;
  }
});

// ============ 游戏主循环 ============
// requestAnimationFrame：浏览器每秒钟自动调用约 60 次。
// 每次循环：先更新逻辑，再重绘画面。
function game_loop(now) {
  const delta_time = game.last_time === 0 ? 0 : now - game.last_time;
  game.last_time = now;

  update_game(delta_time);   // 先算（逻辑）
  draw();                    // 再画（美术）

  requestAnimationFrame(game_loop);
}
requestAnimationFrame(game_loop);
