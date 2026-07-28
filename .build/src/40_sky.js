/* ==================================================================
 *  SKY
 *  A full-screen ray-reconstructed dome. No geometry, no seams, and the
 *  exact same cloud field the ground reads for its shadows.
 * ================================================================== */
function makeSky(shared) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new THREE.RawShaderMaterial({
    uniforms: withShared(shared, { uInvVP: { value: new THREE.Matrix4() } }),
    depthTest: false, depthWrite: false,
    glslVersion: THREE.GLSL1,
    vertexShader: /* glsl */`
      precision highp float;
      attribute vec3 position; varying vec2 vNdc;
      void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vNdc;
      uniform mat4 uInvVP; uniform vec3 uCamPos;
      ${GLSL_PALETTE}${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec4 p0 = uInvVP * vec4(vNdc, -1.0, 1.0);
        vec4 p1 = uInvVP * vec4(vNdc,  1.0, 1.0);
        vec3 dir = normalize(p1.xyz/p1.w - p0.xyz/p0.w);
        gl_FragColor = vec4(skyColor(dir, 1.0), 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -1000;
  m.userData.mat = mat;
  return m;
}
