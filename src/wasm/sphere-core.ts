// AssemblyScript: 粒子场的核心分布逻辑，编译成 .wasm 后由浏览器加载。
// 外层 JS 只负责缓冲区与 WebGL，不包含这套分布算法。

let state: u32 = 0x9e3779b9;

function rand(): f32 {
  state = state * 1664525 + 1013904223;
  return <f32>(state >>> 8) / 16777216.0;
}

/**
 * 写入 count 个粒子，每个粒子 5 个 f32：
 * dir.x, dir.y, dir.z, seed, radius
 */
export function fillParticles(count: i32, ptr: usize): void {
  for (let i: i32 = 0; i < count; i++) {
    const theta: f64 = <f64>rand() * 6.283185307179586;
    const phi: f64 = Math.acos(2.0 * <f64>rand() - 1.0);
    const sp: f64 = Math.sin(phi);

    const dx: f64 = sp * Math.cos(theta);
    const dy: f64 = sp * Math.sin(theta);
    const dz: f64 = Math.cos(phi);
    const seed: f32 = rand();
    const radius: f64 = 1.65 + Math.pow(<f64>rand(), 1.6) * 0.95;

    const offset: usize = ptr + <usize>i * 20;
    store<f32>(offset, <f32>dx);
    store<f32>(offset + 4, <f32>dy);
    store<f32>(offset + 8, <f32>dz);
    store<f32>(offset + 12, seed);
    store<f32>(offset + 16, <f32>radius);
  }
}
