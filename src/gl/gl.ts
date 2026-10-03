export type Uniforms = Record<string, WebGLUniformLocation | null>;

export interface Program {
  prog: WebGLProgram;
  u: Uniforms;
  attr: (name: string) => number;
}

/** A program being compiled and linked; with KHR_parallel_shader_compile the driver works on it in the background. */
export interface PendingProgram {
  /** True once the program can be used without stalling (always true without the extension). */
  done(): boolean;
  /** The program, waiting for it if needed. Throws if it failed to compile. */
  get(): Program;
}

/** `attrib0`: an attribute pinned to location 0, so programs built from the same vertex shader share a VAO. */
export function startProgram(gl: WebGL2RenderingContext, vs: string, fs: string, attrib0?: string): PendingProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const v = shader(gl.VERTEX_SHADER, vs);
  const f = shader(gl.FRAGMENT_SHADER, fs);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  if (attrib0) gl.bindAttribLocation(prog, 0, attrib0);
  gl.linkProgram(prog);
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  let built: Program | null = null;
  return {
    done: () => !!built || !parallel || gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR) === true,
    get() {
      if (built) return built;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        for (const s of [v, f]) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
        throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
      }
      const cache: Uniforms = {};
      const u = new Proxy(cache, {
        get(target, key: string) {
          if (!(key in target)) target[key] = gl.getUniformLocation(prog, key);
          return target[key];
        },
      });
      built = { prog, u, attr: (name) => gl.getAttribLocation(prog, name) };
      return built;
    },
  };
}

export const createProgram = (gl: WebGL2RenderingContext, vs: string, fs: string): Program => startProgram(gl, vs, fs).get();

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
