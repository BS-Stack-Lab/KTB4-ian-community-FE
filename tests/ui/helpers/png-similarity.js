import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(path) {
  const source = readFileSync(path);
  const signature = source.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${path}: PNG 아님`);

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const compressed = [];
  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.subarray(offset + 4, offset + 8).toString("ascii");
    const data = source.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType))
    throw new Error(`${path}: 지원하지 않는 PNG 형식`);

  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const filtered = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = y * (rowBytes + 1);
    const targetRow = y * rowBytes;
    const filter = filtered[sourceRow];
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[sourceRow + 1 + x];
      const left = x >= channels ? pixels[targetRow + x - channels] : 0;
      const above = y > 0 ? pixels[targetRow - rowBytes + x] : 0;
      const upperLeft =
        y > 0 && x >= channels
          ? pixels[targetRow - rowBytes + x - channels]
          : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paeth(left, above, upperLeft);
      else throw new Error(`${path}: 알 수 없는 PNG filter ${filter}`);
      pixels[targetRow + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

export function normalizedRgbSimilarity(actualPath, expectedPath, region) {
  const actual = decodePng(actualPath);
  const expected = decodePng(expectedPath);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new Error("비교 이미지 크기가 다릅니다.");
  const {
    x = 0,
    y = 0,
    width = actual.width,
    height = actual.height,
  } = region ?? {};
  let difference = 0;
  let samples = 0;
  for (let row = y; row < Math.min(y + height, actual.height); row += 1) {
    for (
      let column = x;
      column < Math.min(x + width, actual.width);
      column += 1
    ) {
      const actualOffset = (row * actual.width + column) * actual.channels;
      const expectedOffset =
        (row * expected.width + column) * expected.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        difference += Math.abs(
          actual.pixels[actualOffset + channel] -
            expected.pixels[expectedOffset + channel],
        );
        samples += 1;
      }
    }
  }
  return 1 - difference / (samples * 255);
}
