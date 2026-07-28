/* ==================================================================
 *  WATER
 *  One tide plane. Depth bands and foam come from the same baked field the
 *  ground uses; roughness, drift and glitter come from the same wind
 *  authority the reeds use. Sheltered water goes to glass, exposed water
 *  breaks to silver, and the tide wheel is reflected by an actual ray
 *  bounce off the surface rather than a painted-on circle.
 * ================================================================== */
function makeWaterMaterial(shared) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, side: THREE.FrontSide,
    uniforms: withShared(shared, {
      uCenter: { value: new THREE.Vector2() },
      uWheelC: { value: new THREE.Vector3() },      // hub centre
      uWheelN: { value: new THREE.Vector3(1, 0, 0) }, // wheel plane normal (its axle)
      uWheelP: { value: new THREE.Vector4(0, 0, 0, 0) }, // radius, rimWidth, paddles, angle
      uWheelOn: { value: 0 },
      uFlow: { value: [new THREE.Vector4(), new THREE.Vector4()] },   // xz, radius, strength
      uRefl: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uStill: { value: 0 },
    }),
    vertexShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_WIND}
      uniform vec2 uCenter;
      varying vec3 vWorld; varying float vDist; varying vec4 vFld; varying float vEx;
      void main(){
        vec2 wp = position.xz + uCenter;
        vFld = sampleFieldFar(wp);
        vEx = vFld.y;
        vec3 w = windAt(wp, vEx);
        float amp = 0.010 + 0.028 * smoothstep(1.0, 8.0, w.z);
        float ph = dot(wp, w.xy);
        float y = uTideY + amp * (sin(ph*0.55 - uTime*1.7) + 0.6*sin(ph*1.31 + uTime*2.4));
        vWorld = vec3(wp.x, y, wp.y);
        vDist = distance(vWorld, uCamPos);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_WIND}${GLSL_SKY}${GLSL_SHADOW}${GLSL_AIR}
      uniform vec3 uWheelC; uniform vec3 uWheelN; uniform vec4 uWheelP; uniform float uWheelOn;
      uniform vec4 uFlow[2]; uniform vec4 uRefl[6]; uniform float uStill;
      varying vec3 vWorld; varying float vDist; varying vec4 vFld; varying float vEx;

      // ripple normal: three scrolling octaves, all travelling with the wind
      vec3 rippleNormal(vec2 p, vec2 dir, float strength, float detail){
        float e = 0.35;
        vec2 d1 = dir * uTime * 0.55, d2 = dir * uTime * 0.31, d3 = dir * uTime * 1.15;
        float s = 0.0;
        s += fbm2(p*0.55 + d1, 3) * 1.0;
        s += fbm2(p*1.90 - d2, 2) * 0.55 * detail;
        s += fbm2(p*6.10 + d3, 2) * 0.22 * detail;
        float sx = 0.0, sz = 0.0;
        sx += fbm2((p+vec2(e,0.0))*0.55 + d1, 3) - fbm2((p-vec2(e,0.0))*0.55 + d1, 3);
        sz += fbm2((p+vec2(0.0,e))*0.55 + d1, 3) - fbm2((p-vec2(0.0,e))*0.55 + d1, 3);
        sx += (fbm2((p+vec2(e,0.0))*1.90 - d2, 2) - fbm2((p-vec2(e,0.0))*1.90 - d2, 2)) * 0.6 * detail;
        sz += (fbm2((p+vec2(0.0,e))*1.90 - d2, 2) - fbm2((p-vec2(0.0,e))*1.90 - d2, 2)) * 0.6 * detail;
        return normalize(vec3(-sx * strength, 0.30, -sz * strength));
      }

      void main(){
        vec3 V = normalize(vWorld - uCamPos);
        float depth = max(0.0, uTideY - vFld.x);
        float shore = smoothstep(-0.02, 0.12, depth);
        if (shore <= 0.001) discard;

        vec3 w = windAt(vWorld.xz, vEx);
        float ws = w.z;
        float detail = 1.0 - smoothstep(90.0, 420.0, vDist);      // no shimmering at range
        float rough = smoothstep(1.2, 7.0, ws) * (0.25 + 0.75*vEx);

        // local acceleration where water is squeezed through the gates or past the wheel
        float accel = 0.0; vec2 flowDir = w.xy;
        for (int i=0;i<2;i++){
          vec4 f = uFlow[i]; if (f.w <= 0.0) continue;
          float d = distance(vWorld.xz, f.xy);
          float a = f.w * smoothstep(f.z, f.z*0.18, d);
          accel += a;
        }
        vec2 rp = vWorld.xz + flowDir * accel * uTime * 2.6;
        vec3 N = rippleNormal(rp, flowDir, 0.28 + 1.55*rough + accel*1.4, detail);
        /* Distant water is one sheet, not a field of separate ripples. Flattening the
           normal with range is the analytic equivalent of a mip: without it the grazing
           fresnel term swings between body colour and bright overcast from pixel to
           pixel, and a calm tide reads as salt-and-pepper glitter. */
        N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(22.0, 130.0, vDist)));

        // --- colour: shallow olive silt through to deep slate
        vec3 shallow = s2l(vec3(0.353,0.361,0.259));
        vec3 mid     = s2l(vec3(0.196,0.263,0.251));
        vec3 deep    = s2l(vec3(0.086,0.129,0.157));
        vec3 body = mix(shallow, mid, smoothstep(0.05, 0.55, depth));
        body = mix(body, deep, smoothstep(0.55, 1.9, depth));
        body *= 0.85 + 0.3*fbm2(vWorld.xz*0.045, 3);

        // --- reflected sky. Sheltered water mirrors hard; broken water scatters it.
        vec3 R = reflect(V, N);
        R.y = abs(R.y) * mix(1.0, 0.55, rough) + 0.012;
        vec3 sky = skyColor(normalize(R), 1.0);
        float fres = pow(1.0 - max(dot(-V, N), 0.0), 3.2);
        // and settle the grazing term itself, so a far tide is a value, not a stipple
        fres = mix(fres, 0.52, smoothstep(28.0, 190.0, vDist));
        float mirror = mix(0.90, 0.34, rough);
        vec3 col = mix(body, sky, clamp(fres*mirror + 0.10*mirror, 0.0, 0.95));

        // --- vertical smears from things standing at the edge (willows, posts, masonry)
        for (int i=0;i<6;i++){
          vec4 r = uRefl[i]; if (r.w <= 0.0) continue;
          vec2 toC = vWorld.xz - r.xy;
          vec2 view = normalize(vWorld.xz - uCamPos.xz);
          float along = dot(toC, view);
          float side = length(toC - view*along);
          float smear = smoothstep(r.z, r.z*0.25, side) * smoothstep(0.0, -r.z*2.2, along);
          smear *= (1.0 - rough*0.75) * (0.4 + 0.6*uStill);
          smear *= 0.6 + 0.4*fbm2(vWorld.xz*1.6 + w.xy*uTime*0.4, 2);
          col = mix(col, col * (0.30 + 0.25*r.w), smear * 0.8);
        }

        // --- the tide wheel, reflected by bouncing the view ray off this fragment
        if (uWheelOn > 0.5){
          float den = dot(R, uWheelN);
          if (abs(den) > 0.0025){
            float t = dot(uWheelC - vWorld, uWheelN) / den;
            if (t > 0.0){
              vec3 hit = vWorld + R * t;
              if (hit.y > 0.02){
                vec3 rel = hit - uWheelC;
                float rr = length(rel - uWheelN*dot(rel,uWheelN));
                float rim = smoothstep(uWheelP.x, uWheelP.x - uWheelP.y, rr) * step(uWheelP.x - uWheelP.y*2.6, rr);
                float ang = atan(rel.y, dot(rel, normalize(cross(uWheelN, vec3(0.0,1.0,0.0)))));
                float sp = smoothstep(0.80, 0.99, abs(cos((ang - uWheelP.w) * uWheelP.z * 0.5)));
                float mask = clamp(rim + sp * step(rr, uWheelP.x) * 0.75, 0.0, 1.0);
                mask *= (1.0 - rough*0.8) * smoothstep(120.0, 25.0, vDist);
                col = mix(col, s2l(C_WOOD) * 0.28, mask * 0.88);
              }
            }
          }
        }

        // --- glitter: only when the sun lines up, and never a permanent sheet
        vec3 sunR = reflect(-uSunDir, N);
        float spec = pow(max(dot(sunR, -V), 0.0), 260.0);
        float align = smoothstep(0.35, 0.92, dot(normalize(vec2(-V.x,-V.z)), normalize(uSunDir.xz)));
        float sparkle = smoothstep(0.55, 0.85, fbm2(vWorld.xz*7.0 + w.xy*uTime*1.3, 2)) * detail;
        col += uSunCol * spec * align * (0.35 + 0.65*sparkle) * (0.4 + 1.5*rough) * cloudShadow(vWorld.xz) * 1.45;

        // --- foam: at the waterline, and wherever the flow is forced
        float bankFoam = smoothstep(0.30, 0.05, depth) * (0.35 + 0.65*rough);
        float lace = smoothstep(0.45, 0.80, fbm2(vWorld.xz*2.2 + w.xy*uTime*0.6, 3));
        float foam = bankFoam * lace + accel * smoothstep(0.42, 0.85, fbm2(rp*1.5, 3)) * 1.4;
        col = mix(col, s2l(vec3(0.847,0.855,0.820)), clamp(foam,0.0,0.78) * 0.75);

        col *= mix(1.0, cloudShadow(vWorld.xz), 0.55);
        float alpha = mix(0.60, 0.985, smoothstep(0.02, 0.85, depth)) * shore;
        gl_FragColor = vec4(applyAir(col, vWorld, V), alpha);
      }`,
  });
}

class Water {
  constructor(shared, quality) {
    const r = radialGeometry(quality.waterA, quality.waterN, 1.1, 4400, 0.0);
    this.mat = makeWaterMaterial(shared);
    this.mesh = new THREE.Mesh(r.geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 6;
    this.tris = quality.waterA * quality.waterN * 2;
  }
  update(cx, cz) { this.mat.uniforms.uCenter.value.set(Math.round(cx * 2) / 2, Math.round(cz * 2) / 2); }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
