/* ==================================================================
 *  SHADOWS + FILM FINISH
 * ================================================================== */

/** One tight ortho map around the rider. Only things worth a shadow are drawn into it. */
class ShadowPass {
  constructor(renderer, shared, size, extent) {
    this.renderer = renderer; this.shared = shared; this.size = size; this.extent = extent;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true,
    });
    this.rt.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    this.rt.depthTexture.minFilter = THREE.NearestFilter;
    this.rt.depthTexture.magFilter = THREE.NearestFilter;
    this.cam = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, extent * 6);
    this.scene = new THREE.Scene();
    this.scene.autoUpdate = false;
    shared.uShadowTex.value = this.rt.depthTexture;
    shared.uShadowTexel.value = 1 / size;
    this.entries = [];
  }
  /** register a mesh whose geometry should also be drawn depth-only */
  register(mesh, depthMat) {
    const proxy = new THREE.Mesh(mesh.geometry, depthMat);
    proxy.frustumCulled = false; proxy.matrixAutoUpdate = false;
    proxy.matrix.copy(mesh.matrixWorld);
    this.scene.add(proxy);
    const e = { mesh, proxy };
    this.entries.push(e);
    return e;
  }
  /** Reconcile the caster set in place — no proxy is allocated on a steady-state frame. */
  sync(wanted) {
    const live = this._live || (this._live = new Set());
    live.clear();
    for (const w of wanted) live.add(w.mesh);
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (!live.has(this.entries[i].mesh)) { this.scene.remove(this.entries[i].proxy); this.entries.splice(i, 1); }
    }
    const have = this._have || (this._have = new Set());
    have.clear();
    for (const e of this.entries) have.add(e.mesh);
    for (const w of wanted) if (!have.has(w.mesh)) this.register(w.mesh, w.depthMat);
  }
  render(sunDir, cx, cz, cy) {
    const e = this.extent, texel = (e * 2) / this.size;
    const tx = Math.round(cx / texel) * texel, tz = Math.round(cz / texel) * texel;
    const d = e * 3;
    this.cam.position.set(tx + sunDir.x * d, cy + sunDir.y * d, tz + sunDir.z * d);
    this.cam.lookAt(tx, cy, tz);
    this.cam.updateMatrixWorld(true);
    this.cam.updateProjectionMatrix();
    for (const en of this.entries) { en.mesh.updateWorldMatrix(true, false); en.proxy.matrix.copy(en.mesh.matrixWorld); }
    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.shared.uShadowMat.value.multiplyMatrices(bias, new THREE.Matrix4().multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse));
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
  }
  clear() { for (const e of this.entries) this.scene.remove(e.proxy); this.entries.length = 0; }
  dispose() { this.clear(); this.rt.dispose(); if (this.rt.depthTexture) this.rt.depthTexture.dispose(); }
}

/* ------------------------------------------------------------------ *
 *  one combined grade / composite pass
 * ------------------------------------------------------------------ */
const FS_QUAD = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
};

class Post {
  constructor(renderer, quality) {
    this.renderer = renderer; this.q = quality;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geo = FS_QUAD();

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
      fragmentShader: `precision highp float; varying vec2 vUv;
        uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uTexel;
        void main(){
          vec2 o = uDir * uTexel;
          vec3 c = texture2D(uTex, vUv).rgb * 0.227;
          c += (texture2D(uTex, vUv + o*1.385).rgb + texture2D(uTex, vUv - o*1.385).rgb) * 0.316;
          c += (texture2D(uTex, vUv + o*3.231).rgb + texture2D(uTex, vUv - o*3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: null }, uSoft: { value: null }, uDepth: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) }, uNearFar: { value: new THREE.Vector2(0.1, 6000) },
        uSunNdc: { value: new THREE.Vector3(0, 0, -1) }, uShaft: { value: 0 },
        uGrain: { value: 0.5 }, uSoften: { value: 0.5 }, uWarm: { value: 0.5 }, uFade: { value: 1 }, uExposure: { value: 0.62 },
      },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uScene, uSoft, uDepth;
        uniform vec2 uRes, uNearFar; uniform vec3 uSunNdc;
        uniform float uShaft, uGrain, uSoften, uWarm, uFade, uExposure;
        ${GLSL_DITHER}
        float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        // smooth low-frequency value drift — a painted wash, never a grid of blocks
        float svn(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y);
        }
        float linZ(float d){
          float n = uNearFar.x, f = uNearFar.y;
          float z = d*2.0-1.0;
          return (2.0*n*f)/(f+n-z*(f-n));
        }
        void main(){
          vec3 c = texture2D(uScene, vUv).rgb;
          vec3 soft = texture2D(uSoft, vUv).rgb;
          float dist = linZ(texture2D(uDepth, vUv).x);

          // --- distance softening: the road-read zone is never touched
          float softAmt = smoothstep(70.0, 900.0, dist) * uSoften;
          c = mix(c, soft, softAmt * 0.55);

          // --- restrained chroma bleed, taken from the soft buffer so it cannot crawl
          vec2 px = 1.0/uRes;
          float rr = texture2D(uSoft, vUv + px*vec2( 1.1, 0.0)).r;
          float bb = texture2D(uSoft, vUv + px*vec2(-1.1, 0.0)).b;
          c.r = mix(c.r, max(c.r, rr*0.9), 0.10);
          c.b = mix(c.b, max(c.b, bb*0.9), 0.10);

          // --- extremely selective bloom: only what is genuinely brighter than paper white
          vec3 hi = max(soft - 0.72, 0.0);
          c += hi * hi * 0.60;

          // --- sun shafts, only when the deck has actually opened
          if (uShaft > 0.002 && uSunNdc.z > 0.0){
            vec2 sp = uSunNdc.xy*0.5+0.5;
            vec2 dir = (sp - vUv) * 0.34;
            vec3 acc = vec3(0.0); float w = 1.0;
            for (int i=0;i<6;i++){
              acc += texture2D(uSoft, vUv + dir*(float(i)/6.0)).rgb * w;
              w *= 0.80;
            }
            float edge = smoothstep(1.35, 0.25, length(sp - vUv));
            c += max(acc/6.0 - 0.55, 0.0) * uShaft * edge * 0.85;
          }

          // --- tone: a soft toe, a long shoulder, no crushed marsh and no blown sky
          c = max(c, 0.0) * uExposure;
          c = c / (c + 0.78);
          c = pow(c, vec3(0.92));
          c *= 1.30;
          // gentle warm/cool split so first light stays cool without going blue
          c.rgb = mix(c.rgb, c.rgb * vec3(1.03,1.0,0.965), uWarm * (0.35 + 0.65*smoothstep(0.35,0.9,dot(c,vec3(0.33)))));
          c.b += (1.0 - smoothstep(0.0,0.45,dot(c,vec3(0.33)))) * 0.014;

          // --- print: a low-frequency painted value drift and a stable paper tooth.
          //     Both are fixed in screen space, so a still camera renders a still image.
          vec2 sp2 = vUv * uRes;
          float paint = svn(vUv*vec2(3.1,2.3))*0.62 + svn(vUv*vec2(6.7,5.1)+7.3)*0.38;
          c *= 0.955 + 0.085*paint;
          float tooth = h12(floor(sp2*0.5)) + h12(floor(sp2*0.5)+vec2(11.0,3.0));
          c *= 1.0 + (tooth*0.5 - 0.5) * uGrain * 0.055;
          float vig = 1.0 - 0.105*pow(length((vUv-0.5)*vec2(1.06,1.0))*1.32, 2.4);
          c *= vig;

          c = clamp(c * uFade, 0.0, 1.0);
          // sRGB out, with ordered dithering so the big flat sky cannot band
          vec3 s = mix(c*12.92, 1.055*pow(max(c,1e-5), vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
          s += ordered(gl_FragCoord.xy) / 255.0;
          gl_FragColor = vec4(s, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(this.geo, this.compMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.rt = null; this.a = null; this.b = null;
  }
  resize(w, h) {
    const mk = (ww, hh, depth) => {
      const t = new THREE.WebGLRenderTarget(Math.max(2, ww), Math.max(2, hh), {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: !!depth,
      });
      if (depth) {
        t.depthTexture = new THREE.DepthTexture(Math.max(2, ww), Math.max(2, hh), THREE.UnsignedIntType);
      }
      return t;
    };
    this.dispose(true);
    this.rt = mk(w, h, true);
    const qw = Math.max(2, Math.floor(w / 4)), qh = Math.max(2, Math.floor(h / 4));
    this.a = mk(qw, qh, false); this.b = mk(qw, qh, false);
    this.compMat.uniforms.uRes.value.set(w, h);
    this.w = w; this.h = h;
  }
  render(camera, opts) {
    const r = this.renderer;
    // blur chain
    this.quad.material = this.blurMat;
    this.blurMat.uniforms.uTex.value = this.rt.texture;
    this.blurMat.uniforms.uTexel.value.set(1 / (this.w / 4), 1 / (this.h / 4));
    this.blurMat.uniforms.uDir.value.set(1, 0);
    r.setRenderTarget(this.a); r.render(this.scene, this.cam);
    this.blurMat.uniforms.uTex.value = this.a.texture;
    this.blurMat.uniforms.uDir.value.set(0, 1);
    r.setRenderTarget(this.b); r.render(this.scene, this.cam);
    // composite
    this.quad.material = this.compMat;
    const u = this.compMat.uniforms;
    u.uScene.value = this.rt.texture; u.uSoft.value = this.b.texture; u.uDepth.value = this.rt.depthTexture;
    u.uNearFar.value.set(camera.near, camera.far);
    Object.assign(u.uShaft, { value: opts.shaft });
    u.uSunNdc.value.copy(opts.sunNdc);
    u.uFade.value = opts.fade;
    r.setRenderTarget(null); r.render(this.scene, this.cam);
  }
  dispose(keepMats) {
    for (const t of [this.rt, this.a, this.b]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    this.rt = this.a = this.b = null;
    if (!keepMats) { this.geo.dispose(); this.blurMat.dispose(); this.compMat.dispose(); }
  }
}
