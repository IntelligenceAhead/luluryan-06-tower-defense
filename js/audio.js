/**
 * audio.js — 音频层（Web Audio API 合成音效）
 *
 * 职责：游戏所有声音都在这里。不需要任何音频文件，全部用代码合成：
 *   振荡器（音调类声音）+ 白噪声（"唰""哐"这类声音）。
 *
 * 三层架构：
 *   game.js   逻辑层（不算数、不画画、不发声）
 *   render.js 美术层（画图 + 界面 + 每帧调用 audio.watch() 检测事件）
 *   audio.js  音频层（本文件：合成 + 播放）
 *
 * 注意：浏览器规定"用户交互后才能播放声音"，
 * 所以音频系统在第一次点击/按键时初始化，这是正常现象。
 */

// ============ 初始化 ============
let audio_ctx = null;   // 音频上下文（首次交互时创建）

function ensure_audio() {
  if (!audio_ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio_ctx = new Ctx();
  }
  if (audio_ctx.state === "suspended") {
    audio_ctx.resume();
  }
}

// 首次点击/按键时初始化（浏览器自动播放策略）
document.addEventListener("pointerdown", ensure_audio);
document.addEventListener("keydown", ensure_audio);

// ============ 合成器 ============
// 音调类声音：一个振荡器，频率从 f0 滑到 f1，持续 duration 秒
function play_tone(f0, f1, duration, type, volume) {
  ensure_audio();
  if (!audio_ctx) return;
  const osc = audio_ctx.createOscillator();
  const gain = audio_ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(f0, audio_ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(f1, audio_ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume || 0.15, audio_ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio_ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio_ctx.destination);
  osc.start();
  osc.stop(audio_ctx.currentTime + duration);
}

// 噪声类声音：一段白噪声 + 带通滤波，用于"唰""哐"这类声音
function play_noise(duration, filter_freq, volume) {
  ensure_audio();
  if (!audio_ctx) return;
  const buffer_size = Math.floor(audio_ctx.sampleRate * duration);
  const buffer = audio_ctx.createBuffer(1, buffer_size, audio_ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < buffer_size; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / buffer_size);   // 音量线性衰减
  }
  const source = audio_ctx.createBufferSource();
  source.buffer = buffer;
  const filter = audio_ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filter_freq || 2000;
  const gain = audio_ctx.createGain();
  gain.gain.value = volume || 0.12;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio_ctx.destination);
  source.start();
}

// ============ 音效库 ============
const SOUNDS = {
  // 打捞成功：清脆"叮"（金币入账）
  salvage: function () { play_tone(880, 1320, 0.18, "sine", 0.12); },
  // 大网收尾："唰"
  net: function () { play_noise(0.18, 2500, 0.15); },
  // 建塔：木桩"咚"
  build: function () { play_tone(150, 70, 0.15, "sine", 0.2); },
  // 维修：金属"咔嗒"两下
  repair: function () {
    play_tone(300, 300, 0.05, "square", 0.08);
    setTimeout(function () { play_tone(360, 360, 0.05, "square", 0.08); }, 60);
  },
  // 设备损坏："哐"
  broken: function () {
    play_tone(220, 60, 0.3, "sawtooth", 0.15);
    play_noise(0.25, 800, 0.12);
  },
  // 小动物溺亡/物资漂走：哀鸣下滑
  leak: function () { play_tone(600, 180, 0.4, "sine", 0.12); },
  // 胜利：上行三音阶（1-3-5）
  victory: function () {
    [523, 659, 784].forEach(function (f, i) {
      setTimeout(function () { play_tone(f, f, 0.22, "triangle", 0.15); }, i * 180);
    });
  },
  // 失败：下行三音阶
  defeat: function () {
    [392, 311, 247].forEach(function (f, i) {
      setTimeout(function () { play_tone(f, f, 0.25, "triangle", 0.15); }, i * 200);
    });
  },
};

// ============ 事件监听 ============
// 渲染层每帧调用 audio.watch()：对比上一帧快照，检测游戏事件并播放音效
let snapshot = null;   // null = 还没有基线（第一次调用时建立）

function watch() {
  if (!audio_ctx) return;   // 用户还没点过页面：不播放
  const now = {
    gold: game.gold,
    towers: game.towers.length,
    broken: game.towers.filter(function (t) { return t.broken; }).length,
    effects: game.effects.length,
    lives: game.lives,
    state: game.state,
  };
  if (snapshot === null) {
    snapshot = now;   // 建立基线，不做对比
    return;
  }
  if (now.gold > snapshot.gold) SOUNDS.salvage();      // 打捞成功，金币入账
  if (now.effects > snapshot.effects) SOUNDS.net();    // 大网收尾特效
  if (now.towers > snapshot.towers) SOUNDS.build();    // 部署设备
  if (now.broken > snapshot.broken) SOUNDS.broken();   // 设备损坏
  if (now.lives < snapshot.lives) SOUNDS.leak();       // 溺亡/漂进漩涡
  if (now.state !== snapshot.state) {
    if (now.state === "won") SOUNDS.victory();
    if (now.state === "lost") SOUNDS.defeat();
  }
  snapshot = now;
}

// 对外接口：渲染层可直接播放指定音效（如维修成功的"咔嗒"）
const audio = {
  watch: watch,
  play: function (name) {
    if (SOUNDS[name]) SOUNDS[name]();
  },
};
