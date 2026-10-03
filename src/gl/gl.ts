export type Uniforms = Record<string, WebGLUniformLocation | null>;

export interface Program {
  prog: WebGLProgram;
  u: Uniforms;
  attr: (name: string) => number;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`Shader compile failed: ${log}`);
    }
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  const cache: Uniforms = {};
  const u = new Proxy(cache, {
    get(target, key: string) {
      if (!(key in target)) target[key] = gl.getUniformLocation(prog, key);
      return target[key];
    },
  });
  return { prog, u, attr: (name) => gl.getAttribLocation(prog, name) };
}

export function quadBuffer(gl: WebGL2RenderingContext, half = 1): WebGLBuffer {
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-half, -half, half, -half, -half, half, -half, half, half, -half, half, half]),
    gl.STATIC_DRAW,
  );
  return b;
}

export function createTexture(gl: WebGL2RenderingContext, mip: boolean): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  return t;
}

export function uploadTexture(
  gl: WebGL2RenderingContext,
  t: WebGLTexture,
  src: TexImageSource,
  mip: boolean,
): void {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
