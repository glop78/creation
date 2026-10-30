/* ==========================================================================
   CREATIO — Boussole invisible (salle 15, E12)
   Le visiteur fait tourner un champ magnétique virtuel : les lignes de champ
   pivotent et quatre paires radicalaires changent d'éclat. Quatre replis :
   WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : la boussole magnétique dépendante de la lumière (F-088), la
   magnétosensibilité du cryptochrome 4 en éprouvette (F-089) et les quatre
   paires radicalaires (F-090) sont établies (source S024, 2021). L'éclat
   affiché est une ILLUSTRATION du principe directionnel, pas une mesure :
   aucune valeur de rendement quantique n'est publiée. Le rôle de récepteur
   chez l'oiseau vivant reste DÉBATTU (F-091).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-boussole]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-boussole-moteur]');
  var legende = cadre.querySelector('[data-boussole-legende]');
  var curseur = cadre.querySelector('[data-boussole-angle]');
  var sortie = cadre.querySelector('[data-boussole-sortie]');
  var boutonNord = cadre.querySelector('[data-boussole-nord]');
  var boutonEst = cadre.querySelector('[data-boussole-est]');

  var moteur = null;
  var hote = null;

  function fr(n) {
    var s = String(Math.round(n)).replace('-', '−');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }

  function degres() {
    return Math.max(0, Math.min(360,
      Math.round(parseFloat(curseur ? curseur.value : '0') || 0)));
  }
  function radians() { return degres() * Math.PI / 180; }

  function majLegende() {
    var d = degres();
    if (sortie) { sortie.textContent = fr(d) + ' degrés'; }
    if (!legende) { return; }
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : visualisation JPG, sans lignes de champ calculées.' : '';
    legende.innerHTML = '<strong>Orientation du champ : ' + fr(d) +
      ' degrés.</strong> Les quatre paires radicalaires sont représentées par ' +
      'des points lumineux ; leur éclat varie pour montrer le principe d’une ' +
      'réponse directionnelle. C’est une illustration, pas une mesure : nous ' +
      'ne publions aucune valeur de rendement quantique. Ce qui est ÉTABLI : ' +
      'la boussole magnétique dépendante de la lumière (fait F-088), la ' +
      'magnétosensibilité du cryptochrome 4 en éprouvette (F-089), les quatre ' +
      'paires radicalaires (F-090). Ce qui reste à comprendre : le récepteur ' +
      'chez l’oiseau vivant (F-091, DÉBATTU).' + repli;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, angle: f32, reserve: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let echelle = min(u.resolution.x, u.resolution.y);',
    '  let p = (f.xy - 0.5 * u.resolution) / echelle;',
    '  let ca = cos(u.angle); let sa = sin(u.angle);',
    '  let q = vec2<f32>(p.x * ca - p.y * sa, p.x * sa + p.y * ca);',
    '  let ondes = 0.5 + 0.5 * sin(q.y * 22.0 + 1.2 * sin(q.x * 7.0));',
    '  let champ = pow(ondes, 8.0) * exp(-length(p) * 1.6) * 0.80;',
    '  var paires = 0.0;',
    '  for (var i: i32 = 0; i < 4; i = i + 1) {',
    '    let a = f32(i) * 1.5707963 + 0.4;',
    '    let c1 = vec2<f32>(cos(a) * 0.20, sin(a) * 0.20);',
    '    let c2 = vec2<f32>(cos(a) * 0.30, sin(a) * 0.30);',
    '    let eclat = 0.45 + 0.55 * abs(cos(u.angle - a));',
    '    paires += (exp(-length(p - c1) * 95.0) + exp(-length(p - c2) * 95.0)) * eclat;',
    '  }',
    '  let noyau = exp(-length(p) * 16.0) * 0.50;',
    '  var col = vec3<f32>(0.40, 0.75, 0.95) * champ * 0.70;',
    '  col += vec3<f32>(1.0, 0.80, 0.42) * paires * 0.90;',
    '  col += vec3<f32>(0.55, 0.85, 0.95) * noyau * 0.35;',
    '  let alpha = clamp(champ * 0.60 + paires * 0.80 + noyau * 0.30, 0.0, 0.93);',
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
        device.queue.writeBuffer(uniformes, 0,
          new Float32Array([c.width, c.height, radians(), 0]));
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
    'uniform vec2 u_res; uniform float u_angle; out vec4 outColor;',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float echelle = min(u_res.x, u_res.y);',
    '  vec2 p = (f - 0.5 * u_res) / echelle;',
    '  float ca = cos(u_angle); float sa = sin(u_angle);',
    '  vec2 q = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);',
    '  float ondes = 0.5 + 0.5 * sin(q.y * 22.0 + 1.2 * sin(q.x * 7.0));',
    '  float champ = pow(ondes, 8.0) * exp(-length(p) * 1.6) * 0.80;',
    '  float paires = 0.0;',
    '  for (int i = 0; i < 4; i++) {',
    '    float a = float(i) * 1.5707963 + 0.4;',
    '    vec2 c1 = vec2(cos(a) * 0.20, sin(a) * 0.20);',
    '    vec2 c2 = vec2(cos(a) * 0.30, sin(a) * 0.30);',
    '    float eclat = 0.45 + 0.55 * abs(cos(u_angle - a));',
    '    paires += (exp(-length(p - c1) * 95.0) + exp(-length(p - c2) * 95.0)) * eclat;',
    '  }',
    '  float noyau = exp(-length(p) * 16.0) * 0.50;',
    '  vec3 col = vec3(0.40, 0.75, 0.95) * champ * 0.70;',
    '  col += vec3(1.0, 0.80, 0.42) * paires * 0.90;',
    '  col += vec3(0.55, 0.85, 0.95) * noyau * 0.35;',
    '  float alpha = clamp(champ * 0.60 + paires * 0.80 + noyau * 0.30, 0.0, 0.93);',
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
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uAngle, radians());
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
        var cx = W / 2, cy = H / 2, ang = radians();
        ctx.clearRect(0, 0, W, H);
        // Lignes de champ : courbes douces pivotées.
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        ctx.strokeStyle = 'rgba(105,190,240,0.32)';
        ctx.lineWidth = Math.max(1, R * 0.0018);
        for (var k = -6; k <= 6; k++) {
          ctx.beginPath();
          for (var i = 0; i <= 120; i++) {
            var x = (i / 120 - 0.5) * W * 1.2;
            var y = k * R * 0.07 + Math.sin(i / 120 * 7 + k * 0.3) * R * 0.02;
            if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
          }
          ctx.stroke();
        }
        ctx.restore();
        // Protéine centrale.
        var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.14);
        halo.addColorStop(0, 'rgba(140,215,240,0.35)');
        halo.addColorStop(1, 'rgba(140,215,240,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, 6.284); ctx.fill();
        // Quatre paires radicalaires.
        for (var j = 0; j < 4; j++) {
          var a = j * 1.5707963 + 0.4;
          var eclat = 0.45 + 0.55 * Math.abs(Math.cos(ang - a));
          for (var m = 0; m < 2; m++) {
            var rr = R * (m === 0 ? 0.20 : 0.30);
            ctx.fillStyle = 'rgba(255,205,110,' + (0.35 + 0.6 * eclat).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
              Math.max(2, R * 0.009), 0, 6.284);
            ctx.fill();
          }
        }
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
    cadre.setAttribute('data-orientation', String(degres()));
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (boutonNord) {
    boutonNord.addEventListener('click', function () {
      if (curseur) { curseur.value = '0'; }
      rafraichir();
    });
  }
  if (boutonEst) {
    boutonEst.addEventListener('click', function () {
      if (curseur) { curseur.value = '90'; }
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
    if (statut) { statut.textContent = 'Rendu actif : ' + m.nom + '.'; }
    rafraichir();
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var r = hote.getBoundingClientRect();
        m.redimensionner(Math.max(2, Math.round(r.width * ratio)),
          Math.max(2, Math.round(r.height * ratio)));
        m.rendre();
      }).observe(hote);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
