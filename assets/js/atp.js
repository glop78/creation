/* ==========================================================================
   CREATIO — Le moteur qui tourne (salle 09, E09)
   Le visiteur règle la concentration d'ATP : le rotor à trois lobes tourne,
   les particules affluent, la légende distingue la mesure et le modèle.
   Quatre replis : WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : Vmax = 352 ± 16 tours/s et Km = 31 ± 7 µM sont mesurés in
   vitro à 37 °C sur l'enzyme de Bacillus PS3 (Ueno 2005, source S013 ; faits
   F-050, F-052). La vitesse affichée est déduite d'une relation de
   Michaelis-Menten illustrative, pas mesurée à cette concentration.
   L'animation est ralentie cent fois. Le rendement reste DÉBATTU (F-056) et
   l'extrapolation à 1 600 tours/s à 60 °C n'est pas une mesure (F-147).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-atp]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-atp-moteur]');
  var legende = cadre.querySelector('[data-atp-legende]');
  var curseur = cadre.querySelector('[data-atp-concentration]');
  var sortie = cadre.querySelector('[data-atp-sortie]');
  var boutonZero = cadre.querySelector('[data-atp-zero]');
  var boutonMax = cadre.querySelector('[data-atp-max]');

  var VMAX = 352;   // tours/s, mesure Ueno 2005
  var KM = 31;      // micromolaires, mesure Ueno 2005
  var moteur = null;
  var hote = null;
  var angle = 0;
  var derniere = 0;
  var tourne = true;
  if (window.matchMedia) {
    tourne = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function concentration() {
    return Math.max(0, Math.min(1000, parseFloat(curseur ? curseur.value : '0') || 0));
  }
  function vitesse() { return VMAX * concentration() / (KM + concentration()); }
  function fr(n, d) {
    var s = n.toFixed(d === undefined ? 0 : d).replace('.', ',').replace('-', '−');
    var morceaux = s.split(',');
    morceaux[0] = morceaux[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return morceaux.join(',');
  }

  function majLegende() {
    var c = concentration(), v = vitesse();
    if (sortie) { sortie.textContent = fr(c) + ' micromolaires'; }
    if (!legende) { return; }
    var debut, milieu;
    if (c < 1) {
      debut = '<strong>Concentration d’ATP : 0 micromolaire.</strong> ';
      milieu = 'Sans ATP, le moteur s’arrête : la rotation est couplée à ' +
        'l’hydrolyse de cette molécule.';
    } else if (Math.abs(c - KM) < 1) {
      debut = '<strong>Concentration d’ATP : ' + fr(c) + ' micromolaires.</strong> ';
      milieu = 'C’est la constante de Michaelis : la vitesse atteint la moitié du ' +
        'maximum, soit ' + fr(v) + ' tours par seconde.';
    } else {
      debut = '<strong>Concentration d’ATP : ' + fr(c) + ' micromolaires.</strong> ';
      milieu = 'Vitesse déduite du modèle : ' + fr(v) + ' tours par seconde.';
    }
    legende.innerHTML = debut + milieu +
      ' Le maximum mesuré est 352 ± 16 tours par seconde à 37 °C, avec une ' +
      'constante de Michaelis de 31 ± 7 micromolaires (source S013, faits F-050 ' +
      'et F-052). Animation ralentie cent fois pour rester lisible.';
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, angle: f32, concentration: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let echelle = min(u.resolution.x, u.resolution.y);',
    '  let p = (f.xy - 0.5 * u.resolution) / echelle;',
    '  let r = length(p);',
    '  let a = atan2(p.y, p.x);',
    '  let ar = a - u.angle;',
    '  let lobes = pow(max(0.0, cos(3.0 * ar)), 6.0);',
    '  let pale = lobes * smoothstep(0.07, 0.26, r) * (1.0 - smoothstep(0.34, 0.40, r));',
    '  let noyau = 1.0 - smoothstep(0.065, 0.095, r);',
    '  let anneau = exp(-abs(r - 0.45) * 85.0) * 0.55;',
    '  let grains = 0.5 + 0.5 * sin(26.0 * a - u.angle * 1.6);',
    '  let halo = exp(-abs(r - 0.53) * 38.0) * pow(grains, 8.0) * u.concentration * 0.9;',
    '  var col = vec3<f32>(0.98, 0.74, 0.34) * pale * 0.95;',
    '  col += vec3<f32>(0.45, 0.88, 0.92) * (noyau * 0.9 + anneau);',
    '  col += vec3<f32>(1.0, 0.90, 0.55) * halo;',
    '  let alpha = clamp(pale * 0.75 + noyau * 0.8 + anneau * 0.7 + halo * 0.8, 0.0, 0.92);',
    '  return vec4<f32>(col * alpha, alpha);',
    '}'
  ].join('\n');

  async function creerWebGPU(c) {
    if (!navigator.gpu) { return null; }
    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { return null; }
    var device = await adapter.requestDevice();
    var ctx = c.getContext('webgpu');
    if (!ctx) { return null; }
    var format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: device, format: format, alphaMode: 'premultiplied' });
    var module = device.createShaderModule({ code: WGSL });
    var pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: module, entryPoint: 'vs' },
      fragment: { module: module, entryPoint: 'fs', targets: [{
        format: format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
      }] },
      primitive: { topology: 'triangle-list' }
    });
    var uniformes = device.createBuffer({
      size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, angle, concentration() / 1000
        ]));
        var enc = device.createCommandEncoder();
        var passe = enc.beginRenderPass({ colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }] });
        passe.setPipeline(pipeline); passe.setBindGroup(0, groupe); passe.draw(3); passe.end();
        device.queue.submit([enc.finish()]);
      },
      arreter: function () {}
    };
  }

  /* --- 2. GLSL ES -------------------------------------------------------- */
  var GVS = ['#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}'].join('\n');
  var GFS = ['#version 300 es', 'precision highp float;',
    'uniform vec2 u_res; uniform float u_angle; uniform float u_conc; out vec4 outColor;',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float echelle = min(u_res.x, u_res.y);',
    '  vec2 p = (f - 0.5 * u_res) / echelle;',
    '  float r = length(p);',
    '  float a = atan(p.y, p.x);',
    '  float ar = a - u_angle;',
    '  float lobes = pow(max(0.0, cos(3.0 * ar)), 6.0);',
    '  float pale = lobes * smoothstep(0.07, 0.26, r) * (1.0 - smoothstep(0.34, 0.40, r));',
    '  float noyau = 1.0 - smoothstep(0.065, 0.095, r);',
    '  float anneau = exp(-abs(r - 0.45) * 85.0) * 0.55;',
    '  float grains = 0.5 + 0.5 * sin(26.0 * a - u_angle * 1.6);',
    '  float halo = exp(-abs(r - 0.53) * 38.0) * pow(grains, 8.0) * u_conc * 0.9;',
    '  vec3 col = vec3(0.98, 0.74, 0.34) * pale * 0.95;',
    '  col += vec3(0.45, 0.88, 0.92) * (noyau * 0.9 + anneau);',
    '  col += vec3(1.0, 0.90, 0.55) * halo;',
    '  float alpha = clamp(pale * 0.75 + noyau * 0.8 + anneau * 0.7 + halo * 0.8, 0.0, 0.92);',
    '  outColor = vec4(col * alpha, alpha);',
    '}'].join('\n');

  function compiler(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[CREATIO] nuanceur ignoré : ' + gl.getShaderInfoLog(s));
      gl.deleteShader(s); return null;
    }
    return s;
  }

  function creerWebGL2(c) {
    var gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
    if (!gl) { return null; }
    var vs = compiler(gl, gl.VERTEX_SHADER, GVS);
    var fs = compiler(gl, gl.FRAGMENT_SHADER, GFS);
    if (!vs || !fs) { return null; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { return null; }
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uAngle = gl.getUniformLocation(prog, 'u_angle');
    var uConc = gl.getUniformLocation(prog, 'u_conc');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uAngle, angle);
        gl.uniform1f(uConc, concentration() / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    return {
      nom: 'Dessin en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height, R = Math.min(W, H);
        var cx = W / 2, cy = H / 2, conc = concentration() / 1000;
        ctx.clearRect(0, 0, W, H);
        // Particules d'ATP autour du stator.
        for (var i = 0; i < 26; i++) {
          var a = (i / 26) * Math.PI * 2 - angle * 1.6;
          var rr = R * 0.53;
          ctx.fillStyle = 'rgba(255,225,140,' + (0.12 + 0.55 * conc).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
            R * (0.006 + 0.010 * conc), 0, 6.284);
          ctx.fill();
        }
        // Anneau du stator.
        ctx.strokeStyle = 'rgba(120,220,235,0.55)';
        ctx.lineWidth = R * 0.008;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, 6.284); ctx.stroke();
        // Trois pales arrondies.
        ctx.fillStyle = 'rgba(250,190,90,0.78)';
        for (var k = 0; k < 3; k++) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle + k * 2.0944);
          ctx.beginPath();
          ctx.ellipse(R * 0.21, 0, R * 0.15, R * 0.075, 0, 0, 6.284);
          ctx.fill();
          ctx.restore();
        }
        // Noyau central.
        ctx.fillStyle = 'rgba(130,230,240,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.075, 0, 6.284); ctx.fill();
      },
      arreter: function () {}
    };
  }

  /* --- 4. Image seule ---------------------------------------------------- */
  function creerImageSeule(c) {
    c.style.display = 'none';
    return { nom: 'Image JPG statique', redimensionner: function () {},
      rendre: function () {}, arreter: function () {} };
  }

  function nouveauCanvas() {
    var ancien = cadre.querySelector('canvas');
    var frais = document.createElement('canvas');
    frais.setAttribute('aria-hidden', 'true');
    ancien.replaceWith(frais);
    return frais;
  }

  function rafraichir() {
    majLegende();
    if (moteur) { moteur.rendre(); }
  }

  function boucle(t) {
    if (!moteur) { return; }
    var dt = derniere ? Math.min(0.05, (t - derniere) / 1000) : 0;
    derniere = t;
    angle = (angle + (vitesse() / 100) * 6.2832 * dt) % 6.2832;
    moteur.rendre();
    window.requestAnimationFrame(boucle);
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (boutonZero) {
    boutonZero.addEventListener('click', function () {
      if (curseur) { curseur.value = '0'; }
      rafraichir();
    });
  }
  if (boutonMax) {
    boutonMax.addEventListener('click', function () {
      if (curseur) { curseur.value = '1000'; }
      rafraichir();
    });
  }

  async function demarrer() {
    var c = nouveauCanvas();
    hote = c.parentElement || cadre;
    var rect = hote.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(2, Math.round(rect.width * ratio));
    var h = Math.max(2, Math.round(rect.height * ratio));
    var m = null;
    try { m = await creerWebGPU(c); } catch (e) {
      console.warn('[CREATIO] calcul graphique indisponible : ' + e); m = null;
    }
    if (!m) { c = nouveauCanvas(); try { m = creerWebGL2(c); } catch (e) {
      console.warn('[CREATIO] interface graphique indisponible : ' + e); m = null;
    } }
    if (!m) { c = nouveauCanvas(); try { m = creerCanvas2D(c); } catch (e) {
      console.warn('[CREATIO] dessin deux dimensions indisponible : ' + e); m = null;
    } }
    if (!m) { c = nouveauCanvas(); m = creerImageSeule(c); }
    moteur = m;
    m.redimensionner(w, h);
    cadre.setAttribute('data-moteur', m.nom);
    cadre.setAttribute('data-animation', tourne ? 'active' : 'reduite');
    if (statut) {
      statut.textContent = 'Rendu actif : ' + m.nom +
        (tourne ? '.' : ' Mouvement réduit : rotation fixe.');
    }
    rafraichir();
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var r = hote.getBoundingClientRect();
        m.redimensionner(Math.max(2, Math.round(r.width * ratio)),
          Math.max(2, Math.round(r.height * ratio)));
        m.rendre();
      }).observe(hote);
    }
    if (tourne && m.nom !== 'Image JPG statique') {
      window.requestAnimationFrame(boucle);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
