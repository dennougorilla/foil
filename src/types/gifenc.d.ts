// gifenc ships without types; this covers the slice FOIL uses.
declare module 'gifenc' {
  export type Format = 'rgb565' | 'rgb444' | 'rgba4444';
  export type Palette = number[][];

  export interface QuantizeOptions {
    format?: Format;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export interface FrameOptions {
    palette?: Palette;
    /** Milliseconds; stored in GIF's 1/100 s units. */
    delay?: number;
    /** 0 loops forever, -1 plays once. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    colorDepth?: number;
    first?: boolean;
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: QuantizeOptions): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: Format): Uint8Array;
}
