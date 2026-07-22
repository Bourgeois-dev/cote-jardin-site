// Générateur de QR code autonome (aucune dépendance).
// Mode octet (UTF-8), niveau de correction d'erreur M, versions 1..10.
// Suffisant pour des URLs jusqu'à ~270 caractères.

const GAL = new Uint8Array(512);
const GLOG = new Uint8Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GAL[i] = x;
    GLOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GAL[i] = GAL[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : GAL[GLOG[a] + GLOG[b]]);

function polyGen(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], GAL[i]);
    }
    poly = next;
  }
  return poly;
}

function reedSolomon(data: number[], ecLen: number): number[] {
  const gen = polyGen(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

// [totalCodewords, ecPerBlock, blocksG1, dataPerBlockG1, blocksG2, dataPerBlockG2] pour niveau M
const VERSIONS: Record<number, number[]> = {
  1: [26, 10, 1, 16, 0, 0],
  2: [44, 16, 1, 28, 0, 0],
  3: [70, 26, 1, 44, 0, 0],
  4: [100, 18, 2, 32, 0, 0],
  5: [134, 24, 2, 43, 0, 0],
  6: [172, 16, 4, 27, 0, 0],
  7: [196, 18, 4, 31, 0, 0],
  8: [242, 22, 2, 38, 2, 39],
  9: [292, 22, 3, 36, 2, 37],
  10: [346, 26, 4, 43, 1, 44],
};

const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function versionInfoBits(v: number): number {
  let d = v << 12;
  for (let i = 0; i < 6; i++) if (d >> (17 - i) & 1) d ^= 0x1f25 << (5 - i);
  return (v << 12) | d;
}

function formatBits(mask: number): number {
  // Niveau M = 0b00
  const data = (0b00 << 3) | mask;
  let d = data << 10;
  for (let i = 0; i < 5; i++) if (d >> (14 - i) & 1) d ^= 0x537 << (4 - i);
  return ((data << 10) | d) ^ 0x5412;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));

  // Choix de la version
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const [total, ec, b1, d1, b2, d2] = VERSIONS[v];
    const capacity = b1 * d1 + b2 * d2;
    const header = 4 + (v < 10 ? 8 : 16);
    if (bytes.length * 8 + header <= capacity * 8) { version = v; break; }
  }
  if (!version) throw new Error("Contenu trop long pour un QR code (max ~270 caractères).");

  const [, ecLen, blocks1, data1, blocks2, data2] = VERSIONS[version];
  const totalData = blocks1 * data1 + blocks2 * data2;

  // Flux binaire : mode octet (0100) + longueur + données
  const bits: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  // Terminateur + alignement octet + remplissage
  for (let i = 0; i < 4 && bits.length < totalData * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const pads = [0xec, 0x11];
  let pi = 0;
  while (bits.length < totalData * 8) { push(pads[pi++ % 2], 8); }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  // Découpage en blocs + correction d'erreur
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blocks1 + blocks2; i++) {
    const size = i < blocks1 ? data1 : data2;
    const blk = codewords.slice(offset, offset + size);
    offset += size;
    dataBlocks.push(blk);
    ecBlocks.push(reedSolomon(blk, ecLen));
  }

  // Entrelacement
  const final: number[] = [];
  const maxData = Math.max(data1, data2);
  for (let i = 0; i < maxData; i++)
    for (const blk of dataBlocks) if (i < blk.length) final.push(blk[i]);
  for (let i = 0; i < ecLen; i++)
    for (const blk of ecBlocks) final.push(blk[i]);

  // Construction de la matrice
  const size = version * 4 + 17;
  const m: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));

  const setFinder = (r: number, c: number) => {
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const rr = r + i, cc = c + j;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = (i >= 0 && i <= 6 && (j === 0 || j === 6)) || (j >= 0 && j <= 6 && (i === 0 || i === 6));
        const inCore = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        m[rr][cc] = inRing || inCore;
      }
  };
  setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

  // Motifs d'alignement
  const centers = ALIGN[version];
  for (const r of centers)
    for (const c of centers) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++)
          m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1;
    }

  // Motifs de synchronisation
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0;
  }
  m[size - 8][8] = true; // module noir fixe

  // Réservation des zones d'information
  const reserved: [number, number][] = [];
  for (let i = 0; i < 9; i++) { if (m[8][i] === null) reserved.push([8, i]); if (m[i][8] === null) reserved.push([i, 8]); }
  for (let i = 0; i < 8; i++) { if (m[8][size - 1 - i] === null) reserved.push([8, size - 1 - i]); if (m[size - 1 - i][8] === null) reserved.push([size - 1 - i, 8]); }
  if (version >= 7)
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) { reserved.push([i, size - 11 + j]); reserved.push([size - 11 + j, i]); }
  for (const [r, c] of reserved) m[r][c] = false;

  // Placement des données en zigzag
  let bitIdx = 0;
  const totalBits = final.length * 8;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const row = upward ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (m[row][c] !== null) continue;
        let bit = false;
        if (bitIdx < totalBits) bit = ((final[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
        bitIdx++;
        m[row][c] = bit;
      }
    }
    upward = !upward;
  }

  // Masque 0 : (row + col) % 2 === 0 — appliqué aux seuls modules de données
  const isFunction = (r: number, c: number): boolean => {
    if (r <= 8 && c <= 8) return true;
    if (r <= 8 && c >= size - 8) return true;
    if (r >= size - 8 && c <= 8) return true;
    if (r === 6 || c === 6) return true;
    for (const cr of centers)
      for (const cc of centers) {
        if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 9) || (cr >= size - 9 && cc <= 8)) continue;
        if (Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2) return true;
      }
    if (version >= 7 && ((r < 6 && c >= size - 11) || (c < 6 && r >= size - 11))) return true;
    return false;
  };
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!isFunction(r, c) && (r + c) % 2 === 0) m[r][c] = !m[r][c];

  // Information de format (masque 0)
  const fmt = formatBits(0);
  // Copie 1 (autour du finder haut-gauche) et copie 2 (haut-droit + bas-gauche).
  // Le bit 0 est le moins significatif ; l'ordre de parcours diffère entre les
  // deux copies — d'où les deux boucles distinctes ci-dessous.
  for (let i = 0; i < 15; i++) {
    const bit = ((fmt >> i) & 1) === 1;
    // Copie 1 : colonne 8 de bas en haut, puis ligne 8 de droite à gauche
    if (i < 6) m[i][8] = bit;
    else if (i === 6) m[7][8] = bit;
    else if (i === 7) m[8][8] = bit;
    else if (i === 8) m[8][7] = bit;
    else m[8][14 - i] = bit;
    // Copie 2
    if (i < 8) m[8][size - 1 - i] = bit;
    else m[size - 15 + i][8] = bit;
  }
  m[size - 8][8] = true;

  // Information de version (>= 7)
  if (version >= 7) {
    const vi = versionInfoBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vi >> i) & 1) === 1;
      const r = Math.floor(i / 3), c = i % 3;
      m[r][size - 11 + c] = bit;
      m[size - 11 + c][r] = bit;
    }
  }

  return m.map((row) => row.map((v) => v === true));
}
