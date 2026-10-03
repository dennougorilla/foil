// Three procedurally painted pixel-art samples, so the first card looks good before any upload.

const W = 72;
const H = 96;
const SCALE = 8;

type Painter = (x: number, y: number) => [number, number, number];

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number) => (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const pick = (ramp: string[], v: number, x: number, y: number) => {
  const f = Math.max(0, Math.min(0.9999, v)) * (ramp.length - 1);
  const i = Math.floor(f);
  const k = f - i > dither(x, y) ? 1 : 0;
  return hex(ramp[Math.min(i + k, ramp.length - 1)]);
};
const rand = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const dusk: Painter = (x, y) => {
  const sky = ['#2a1748', '#55235e', '#8e2f5f', '#d24c4a', '#f2833d', '#ffc35a'];
  const sunX = 36;
  const sunY = 50;
  const d = Math.hypot(x - sunX, (y - sunY) * 1.05);
  const ridge1 = 62 + Math.sin(x * 0.19) * 5 + Math.sin(x * 0.53 + 1) * 2.5;
  const ridge2 = 72 + Math.sin(x * 0.13 + 2) * 6 + Math.sin(x * 0.41) * 2;
  const ridge3 = 84 + Math.sin(x * 0.09 + 4) * 3;
  if (y > ridge3) return pick(['#160c22', '#1f1030'], (y - ridge3) / 20, x, y);
  if (y > ridge2) return pick(['#2b1238', '#3a1846'], 0.5 - (y - ridge2) / 30, x, y);
  if (y > ridge1) return pick(['#4a1d4f', '#6b2a57'], 0.6 - (y - ridge1) / 24, x, y);
  if (d < 15) {
    const stripe = y > sunY && (y - sunY) % 4 < 1 + (y - sunY) / 8;
    if (stripe) return pick(sky, 1 - y / 80, x, y);
    return pick(['#ff9a3d', '#ffd166', '#fff1b0'], 1 - d / 15 + (sunY - y) / 40, x, y);
  }
  if (y < 30 && rand(x, y) > 0.985) return hex('#ffe9c4');
  return pick(sky, y / 66 + Math.max(0, 0.3 - d / 70), x, y);
};

const tide: Painter = (x, y) => {
  const sea = 58;
  const mx = 46;
  const my = 26;
  const dm = Math.hypot(x - mx, y - my);
  if (y < sea) {
    if (dm < 12) {
      const crater = Math.hypot(x - mx + 3, y - my - 2) < 3 || Math.hypot(x - mx - 4, y - my + 4) < 2;
      return hex(crater ? '#c9cbd8' : dm > 10.5 ? '#d9dcea' : '#f2f1ea');
    }
    if (dm < 17) return pick(['#16213f', '#2b3a6a'], 1 - (dm - 12) / 5, x, y);
    if (rand(x, y) > 0.975) return hex(rand(y, x) > 0.5 ? '#fdf6d8' : '#9fb6ff');
    return pick(['#0b1028', '#121a3c', '#1b2752'], y / sea, x, y);
  }
  const ry = y - sea;
  const wave = Math.sin(x * 0.4 + ry * 0.9) + Math.sin(x * 0.17 - ry * 0.5);
  const inPath = Math.abs(x - mx) < 3 + ry * 0.35 && wave > -0.2;
  if (inPath && (ry % 3 < 1 || wave > 1)) return pick(['#9fb6ff', '#e6ecff', '#ffffff'], 1 - ry / 40, x, y);
  return pick(['#0a1530', '#13285a', '#1d3d7a', '#2e5ba0'], 0.25 + wave * 0.15 + ry / 80, x, y);
};

const ace: Painter = (x, y) => {
  const u = (x - 36) / 22;
  const v = -(y - 50) / 22;
  const heart = Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v;
  const checker = (Math.floor(x / 6) + Math.floor(y / 6)) % 2;
  if (heart < 0) {
    const shine = u < -0.2 && v > 0.15 && u > -0.6 && v < 0.6 && (x + y) % 5 < 2;
    if (shine) return hex('#ffd1cc');
    return pick(['#7e1220', '#c4282f', '#ff5a4f'], 0.8 - v * 0.3 - u * 0.2, x, y);
  }
  if (heart < 0.06) return hex('#1a0d14');
  const letter =
    (y >= 8 && y <= 20 && x >= 6 && x <= 14 && (x === 6 || x === 14 || y === 8 || y === 14)) ||
    (y >= 76 && y <= 88 && x >= 57 && x <= 65 && (x === 57 || x === 65 || y === 88 || y === 82));
  if (letter) return hex('#fbe7a6');
  return pick(checker ? ['#1d1a2e', '#2a2342'] : ['#26213b', '#332a4f'], y / H, x, y);
};

const PAINTERS = [dusk, tide, ace];

export function paintSample(index: number): HTMLCanvasElement {
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const ctx = small.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const painter = PAINTERS[index % PAINTERS.length];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = painter(x, y);
      const o = (y * W + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const big = document.createElement('canvas');
  big.width = W * SCALE;
  big.height = H * SCALE;
  const b = big.getContext('2d')!;
  b.imageSmoothingEnabled = false;
  b.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

export const SAMPLE_COUNT = PAINTERS.length;
