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
  draw_river();          // 河流（含漩涡、水纹）
  draw_hover();          // 悬停预览格
  draw_towers();         // 玩家部署的打捞设备
  draw_bullets();        // 飞行中的子弹（画在设备上、物资下）
  draw_effects();        // 视觉特效：扩散圆环等
  for (const enemy of game.enemies) {
    draw_enemy(enemy);   // 物资画在最上层，漂流时"路过"设备
  }
  draw_hud();            // 顶部信息栏：金币等（永远在最上层）
  draw_game_over();      // 胜负结算画面（游戏结束时显示）
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

// ============ 图层3：河流 ============
// 每段河 = 浅色水面 + 两条黑色河岸 + 流动的水纹，物资漂在水面中央
function draw_river() {
  // 把拐点换算成像素坐标
  const points = PATH.map(path_point);

  // 逐段画水面、河岸和水纹
  for (let i = 0; i < points.length - 1; i++) {
    draw_river_segment(points[i], points[i + 1]);
  }

  // 上游标记：动态跟随当前河道的入口（入口拐点在屏幕外，往回取一点进画面）
  const entry = river_entry_position();
  ctx.fillStyle = "#111111";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("上游", entry.x, entry.y - 18);

  // 下游漩涡：动态跟随当前河道的出口，物资漂到这里就被吞掉
  const exit_pos = whirlpool_position();
  draw_whirlpool(exit_pos.x, exit_pos.y);
  ctx.fillText("漩涡", exit_pos.x, exit_pos.y + 28);
}

// 上游标记位置：取第一段河上、距入口 30 像素的点（确保在画面内）
function river_entry_position() {
  const a = path_point(PATH[0]);
  const b = path_point(PATH[1]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const t = Math.min(1, 30 / len);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// 漩涡位置：取最后一段河上、距出口 26 像素的点（让漩涡完整落在画面内）
function whirlpool_position() {
  const a = path_point(PATH[PATH.length - 2]);
  const b = path_point(PATH[PATH.length - 1]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const t = Math.max(0, len - 26) / len;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// 画一段河：浅色水面 + 两条河岸 + 沿流向漂移的水纹（动画）
function draw_river_segment(a, b) {
  const half = GRID.cell * 0.35;            // 河宽的一半
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);           // 这段河的长度
  const ox = (-dy / len) * half;            // 垂直于流向的偏移量 x
  const oy = (dx / len) * half;             // 垂直于流向的偏移量 y
  const ux = dx / len;                      // 流向单位向量 x
  const uy = dy / len;                      // 流向单位向量 y
  const nx = ox / half;                     // 垂直河向单位向量 x（长 1 像素）
  const ny = oy / half;                     // 垂直河向单位向量 y（长 1 像素）

  // 水面（浅灰蓝底）
  ctx.strokeStyle = "#eef3f6";
  ctx.lineWidth = half * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // 两条黑色河岸
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

  // 水纹：沿流向均匀分布的小波浪线，随时间向下游漂移
  // offset 用游戏时间计算并取余，让波纹周而复始地流动
  const spacing = 22;                       // 波纹间距（像素）
  const offset = (game.last_time / 400) % spacing;
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 1;
  const wave_count = Math.floor((len + spacing) / spacing);
  for (let i = 0; i < wave_count; i++) {
    const t = ((i * spacing + offset) % len) / len;   // 波纹在河段上的位置（0~1）
    const px = a.x + ux * len * t;
    const py = a.y + uy * len * t;
    // 画一条横跨河面的小弧线，弧顶朝下游弯曲（水的流动感）
    // 波纹宽度用单位向量（nx, ny）× 7 像素，控制在河面以内
    ctx.beginPath();
    ctx.moveTo(px + nx * 7, py + ny * 7);
    ctx.quadraticCurveTo(px + ux * 4, py + uy * 4, px - nx * 7, py - ny * 7);
    ctx.stroke();
  }
}

// 漩涡：三层错开相位的圆弧持续旋转，形成"吸水"的视觉效果
function draw_whirlpool(cx, cy) {
  const phase = (game.last_time / 300) % (Math.PI * 2);   // 持续旋转的相位
  ctx.strokeStyle = "#111111";
  for (let i = 0; i < 3; i++) {
    const radius = 6 + i * 7;               // 由内到外三层
    ctx.lineWidth = i === 0 ? 1.5 : 2;
    const start = phase + i * 2.1;          // 每层错开相位
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + Math.PI * 1.5);
    ctx.stroke();
  }
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

// 黑白线条版打捞设备：射程圈 + 岸桩底座 + 按设备类型画不同的打捞装置 + 耐久条
function draw_tower(tower) {
  const type = tower_type(tower);
  const cx = (tower.col + 0.5) * GRID.cell;
  const cy = (tower.row + 0.5) * GRID.cell;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;

  // 岸桩底座（小圆）——所有设备都装在岸桩上
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 损坏的设备：只画底座 + 大叉叉，没有射程圈
  if (tower.broken) {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(6, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(6, -6);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 作业范围圈：半透明灰圆。物资漂进这个圆才会被打捞/被减速
  ctx.beginPath();
  ctx.arc(0, 0, type.range * GRID.cell, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;

  if (type.id === "frost") {
    // 水栅：两根栅柱 + 三根横档，静止（不需要瞄准）
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, -12);
    ctx.lineTo(10, 12);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const y of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(10, y);
      ctx.stroke();
    }
    // 栅栏上方的小雪花（减速符号）
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 2, Math.sin(angle) * 2 - 14);
      ctx.lineTo(Math.cos(angle) * 5, Math.sin(angle) * 5 - 14);
      ctx.stroke();
    }
  } else {
    // 有机械臂的设备：自动伸向最近的物资。
    // 角度计算：atan2(垂直差, 水平差) —— 两点连线与水平方向的夹角
    const target = nearest_enemy(tower);
    let arm_angle = -Math.PI / 4;                 // 没有目标时，默认朝右上
    if (target) {
      const tp = enemy_position(target);
      arm_angle = Math.atan2(tp.y - cy, tp.x - cx);
    }
    ctx.rotate(arm_angle);

    if (type.id === "rapid") {
      // 快速打捞器：三根短臂张开，每根末端一个小抓钩
      ctx.lineWidth = 1.5;
      for (const spread of [-0.35, 0, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(15, spread * 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(15, spread * 15, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (type.id === "sniper") {
      // 精准抓取臂：一根超长机械臂 + 末端张开的两爪
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(28, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(28, 0);
      ctx.lineTo(33, -4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(28, 0);
      ctx.lineTo(33, 4);
      ctx.stroke();
    } else if (type.id === "splash") {
      // 大网：短臂 + 网圈 + 网眼格线
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(19, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, -5);
      ctx.lineTo(24, 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, -5);
      ctx.lineTo(14, 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(19, -7);
      ctx.lineTo(19, 7);
      ctx.stroke();
    } else {
      // 基础打捞钩：长臂 + 末端弯钩
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(19, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(22, 0, 4, Math.PI * 0.25, Math.PI * 1.75);
      ctx.stroke();
    }
  }

  ctx.restore();

  // 耐久条：画在底座下方（耐久不满时才显示，提示"该维修了"）
  if (tower.durability < TOWER_DURABILITY) {
    const bar_w = 24;
    const bar_h = 3;
    const bar_x = cx - bar_w / 2;
    const bar_y = cy + 12;
    const ratio = Math.max(0, tower.durability / TOWER_DURABILITY);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1;
    ctx.strokeRect(bar_x - 1, bar_y - 1, bar_w + 2, bar_h + 2);
    ctx.fillStyle = "#111111";
    ctx.fillRect(bar_x, bar_y, bar_w * ratio, bar_h);
  }
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

// ============ 图层7：视觉特效 ============
// 大网收尾时的扩散圆环：0.5 秒内从半径 6 扩散到 26，逐渐淡出
function draw_effects() {
  for (const effect of game.effects) {
    const progress = effect.age / 0.5;          // 0 → 1
    const radius = 6 + progress * 20;           // 扩散
    const alpha = 1 - progress;                 // 淡出
    ctx.strokeStyle = "rgba(17, 17, 17, " + alpha.toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============ 图层8：物资（漂流物） ============
// 黑白线条版，5 种物资各有特征造型，一眼可辨：
//   粮袋 = 圆角布袋 + 扎口
//   小动物 = 圆头 + 耳朵 + 身后水花
//   工具箱 = 大方箱 + 提手
//   书卷 = 横卷 + 两端卷轴
//   宝箱 = 箱体 + 盖线 + 锁
function draw_enemy(enemy) {
  const pos = enemy_position(enemy);
  ctx.save();
  ctx.translate(pos.x, pos.y);

  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;

  if (enemy.type_id === "grain") {
    // 粮袋：圆角布袋 + 顶部扎口
    round_rect(-10, -9, 20, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, -9);
    ctx.lineTo(-4, -13);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, -9);
    ctx.lineTo(4, -13);
    ctx.stroke();
  } else if (enemy.type_id === "animal") {
    // 小动物：身后水花 + 圆头 + 耳朵 + 眼睛
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.lineTo(-18, -4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, 4);
    ctx.lineTo(-18, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-8, -13);
    ctx.lineTo(-2, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.lineTo(8, -13);
    ctx.lineTo(2, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(-3, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type_id === "toolbox") {
    // 工具箱：大方箱 + 半圆提手
    round_rect(-12, -8, 24, 16, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -8, 5, Math.PI, 0);
    ctx.stroke();
  } else if (enemy.type_id === "scroll") {
    // 书卷：横卷 + 两端卷轴
    round_rect(-10, -4, 20, 8, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-10, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (enemy.type_id === "chest") {
    // 宝箱：箱体 + 盖线 + 锁
    round_rect(-10, -6, 20, 14, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, -1);
    ctx.lineTo(10, -1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  // 工作量条：画在头顶。黑框 + 按剩余工作量比例填充黑色（填满 = 还没捞，清空 = 捞完了）
  const bar_w = 24;
  const bar_h = 4;
  const bar_x = pos.x - bar_w / 2;
  const bar_y = pos.y - 22;
  const hp_ratio = Math.max(0, enemy.hp / enemy.max_hp);   // 0~1 的比例
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1;
  ctx.strokeRect(bar_x - 1, bar_y - 1, bar_w + 2, bar_h + 2);
  ctx.fillStyle = "#111111";
  ctx.fillRect(bar_x, bar_y, bar_w * hp_ratio, bar_h);

  // 状态标记：
  //   书卷（regen>0）："+"，表示打捞成果被水浸倒扣
  //   小动物（regen<0）："!"，表示生命在衰亡，抓紧救援
  //   被水栅减速："❄"
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  if (enemy.regen > 0) {
    ctx.fillText("+", pos.x + 12, pos.y - 12);
  } else if (enemy.regen < 0) {
    ctx.fillText("!", pos.x + 12, pos.y - 12);
  }
  if (enemy.slow_factor < 1) {
    ctx.font = "14px sans-serif";
    ctx.fillText("❄", pos.x, pos.y - 30);
  }
}

// 圆角矩形路径（供物资造型使用）
function round_rect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============ 图层8：信息栏（HUD） ============
// 顶部信息：生命值、关卡、批次进度（金币在右侧塔仓面板）
function draw_hud() {
  const level = LEVELS[game.level_index];

  ctx.fillStyle = "#111111";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("❤️ 生命：" + game.lives, 12, 24);
  ctx.fillText("🏞 关卡：" + (game.level_index + 1), 150, 24);
  ctx.fillText("🌊 批次：" + (game.wave_index + 1) + "/" + level.waves.length, 290, 24);

  // 波次之间的休息倒计时提示
  const between_waves =
    game.state === "playing"
    && game.wave_index < level.waves.length
    && game.squad_index >= level.waves[game.wave_index].squads.length
    && game.enemies.length === 0;
  if (between_waves) {
    const seconds_left = Math.ceil(WAVE_BREAK_SECONDS - game.wave_break_timer);
    ctx.textAlign = "center";
    ctx.fillText("⏳ 下一波 " + seconds_left + " 秒后开始", canvas.width / 2, 40);
  }
}

// ============ 图层9：胜负结算画面 ============
// 游戏结束时：半透明遮罩 + 大字结果 + 星级 + 下一步提示
function draw_game_over() {
  if (game.state === "playing") return;

  // 半透明白色遮罩（盖住战场，突出文字）
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#111111";

  if (game.state === "won") {
    // 救援成功：大字 + 星级（★★☆ 形式，实心星 = 得到，空心星 = 失去）
    ctx.font = "bold 48px sans-serif";
    ctx.fillText("🎉 第 " + (game.level_index + 1) + " 关救援成功！", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "36px sans-serif";
    ctx.fillText(
      "★★★".slice(0, game.stars) + "☆☆☆".slice(0, 3 - game.stars),
      canvas.width / 2,
      canvas.height / 2 + 25
    );
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#555555";
    if (game.level_index + 1 < LEVELS.length) {
      ctx.fillText("点击进入第 " + (game.level_index + 2) + " 关", canvas.width / 2, canvas.height / 2 + 65);
    } else {
      ctx.fillText("🏆 全部通关！点击回到第 1 关", canvas.width / 2, canvas.height / 2 + 65);
    }
  } else {
    ctx.font = "bold 48px sans-serif";
    ctx.fillText("💀 救援失败", canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText("点击重试第 " + (game.level_index + 1) + " 关", canvas.width / 2, canvas.height / 2 + 30);
  }
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

// ============ 塔仓面板（DOM 界面） ============
// 游戏区外的"仓库"：显示 5 种塔，鼠标点选，再回地图上建造。
const shop_cards_container = document.getElementById("towerCards");
const gold_display = document.getElementById("goldDisplay");

// 启动时按 TOWER_TYPES 表生成 5 张卡片。
// 数据驱动：以后加第 6 种塔 = 表里加一行，卡片自动出现。
function build_shop() {
  TOWER_TYPES.forEach(function (type) {
    const card = document.createElement("div");
    card.className = "tower-card";
    card.id = "card-" + type.id;
    card.innerHTML =
      '<div class="card-icon">' + type.icon + "</div>" +
      '<div class="card-name">' + type.name + "</div>" +
      '<div class="card-cost">💰 ' + type.cost + " 金币</div>" +
      '<div class="card-desc">' + type.desc + "</div>";
    card.addEventListener("click", function () {
      game.selected_tower_type = type.id;
      refresh_shop();
      status_text.textContent = "🖱️ 已选择「" + type.name + "」，点击地图空地建造";
    });
    shop_cards_container.appendChild(card);
  });
  refresh_shop();
}

// 刷新面板：选中态高亮、金币显示、买不起的卡片变灰
function refresh_shop() {
  gold_display.textContent = "💰 金币：" + game.gold;
  TOWER_TYPES.forEach(function (type) {
    const card = document.getElementById("card-" + type.id);
    card.classList.toggle("selected", type.id === game.selected_tower_type);
    card.classList.toggle("disabled", game.gold < type.cost);
  });
}
build_shop();

// 键盘快捷键：1~5 直接选择对应塔型
document.addEventListener("keydown", function (event) {
  const index = parseInt(event.key, 10) - 1;   // 1~5 → 0~4
  if (index >= 0 && index < TOWER_TYPES.length) {
    game.selected_tower_type = TOWER_TYPES[index].id;
    refresh_shop();
    status_text.textContent = "⌨️ 已选择「" + TOWER_TYPES[index].name + "」";
  }
});

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

// 点击：游戏结束时点击 = 进下一关/重试本关；游戏中点击 = 尝试部署设备
canvas.addEventListener("click", function (event) {
  if (game.state !== "playing") {
    const was_won = game.state === "won";
    const has_next = game.level_index + 1 < LEVELS.length;
    if (was_won && has_next) {
      start_level(game.level_index + 1);
      status_text.textContent = "🚣 进入第 " + (game.level_index + 1) + " 关！";
    } else if (was_won && !has_next) {
      start_level(0);   // 全部通关：回到第 1 关，开始新的旅程
      status_text.textContent = "🏆 全部通关！从第 1 关开始新的旅程";
    } else {
      start_level(game.level_index);
      status_text.textContent = "🔄 重试第 " + (game.level_index + 1) + " 关";
    }
    return;
  }

  const pos = event_to_canvas(event);
  const col = Math.floor(pos.x / GRID.cell);
  const row = Math.floor(pos.y / GRID.cell);

  // 点中已有设备 → 进入维修流程（而不是报"这里已经有塔了"）
  const existing = game.towers.find(function (t) { return t.col === col && t.row === row; });
  if (existing) {
    const err = repair_tower(existing);
    const type = tower_type(existing);
    if (err === null) {
      status_text.textContent = "🔧 " + type.name + "维修完成（剩余 " + game.gold + " 金币）";
    } else {
      status_text.textContent = "❌ " + err;
    }
    return;
  }

  const error = place_tower(col, row);   // 逻辑层负责判断能不能建
  const type = TOWER_TYPES.find(function (t) { return t.id === game.selected_tower_type; });
  if (error === null) {
    status_text.textContent = "✅ " + type.name + "已部署（花费 " + type.cost + " 金币，剩余 " + game.gold + "）";
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
  refresh_shop();            // 再刷新塔仓面板（金币变了、卡片选中态）

  requestAnimationFrame(game_loop);
}
requestAnimationFrame(game_loop);
