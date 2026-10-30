/* ==========================================================================
   CREATIO — Horloge du corps (salle 18, E14)
   Le visiteur choisit une durée (1 seconde à 24 heures) et une fréquence
   cardiaque (40 à 180 battements par minute). Le compteur calcule ce que le
   corps accomplit pendant ce temps. Quatre replis : WGSL, GLSL ES, dessin 2D,
   image JPG. Clavier inclus ; aucune animation automatique.

   HONNÊTETÉ :
   - CALCUL : battements = fréquence × durée (en minutes). À 70 par minute,
     une journée donne 100 800 battements, cohérent avec F-100 (≈ 100 000).
   - CALCUL : cellules renouvelées = 330 milliards × durée / 86 400 s
     (F-103, S017), dont près de neuf sur dix sont sanguines.
   - CALCUL : part du corps = cellules renouvelées / 3,0 × 10^13 (F-181, S049).
   - VALEUR DE REPOS : 5 litres par minute (F-101). Le débit réel augmente à
     l'effort ; il n'est pas recalculé à partir de la fréquence choisie.
   - Le dessin (particules dans un vaisseau, anneaux de pulsation) est une
     visualisation alignée sur le capillaire de l'image de fond, pas une
     simulation de l'écoulement.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-horloge]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-horloge-moteur]');
  var legende = cadre.querySelector('[data-horloge-legende]');
  var cDuree = cadre.querySelector('[data-horloge-duree]');
  var cFreq = cadre.querySelector('[data-horloge-frequence]');
  var sortie = cadre.querySelector('[data-horloge-sortie]');
  var bJour = cadre.querySelector('[data-horloge-jour]');
  var bRepos = cadre.querySelector('[data-horloge-repos]');

  var DUREES = [
    [1, '1 seconde'], [10, '10 secondes'], [30, '30 secondes'], [60, '1 minute'],
    [300, '5 minutes'], [600, '10 minutes'], [1800, '30 minutes'], [3600, '1 heure'],
    [7200, '2 heures'], [21600, '6 heures'], [43200, '12 heures'], [86400, '24 heures']
  ];
  var CELLULES_JOUR = 330e9;   // F-103, S017
  var CELLULES_CORPS = 3.0e13; // F-181, S049
  var DEBIT_REPOS_L_MIN = 5;   // F-101
  var moteur = null;
  var hote = null;

  function fr(n, dec) {
    var d = dec || 0;
    var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    var parties = s.split('.');
    parties[0] = parties[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return parties.join(',');
  }

  function grand(n) {
    if (n >= 1e9) { return fr(n / 1e9, n >= 1e10 ? 0 : 1) + ' milliard' + (n >= 2e9 ? 's' : ''); }
    if (n >= 1e6) { return fr(n / 1e6, n >= 1e7 ? 0 : 1) + ' million' + (n >= 2e6 ? 's' : ''); }
    return fr(n);
  }

  function lire(c, min, max, def) {
    var v = parseFloat(c ? c.value : String(def));
    if (isNaN(v)) { v = def; }
    return Math.max(min, Math.min(max, Math.round(v)));
  }
  function indiceDuree() { return lire(cDuree, 0, DUREES.length - 1, 3); }
  function frequence() { return lire(cFreq, 40, 180, 70); }

  function calcul() {
    var i = indiceDuree();
    var t = DUREES[i][0];
    var bpm = frequence();
    var cellules = CELLULES_JOUR * t / 86400;
    return {
      indice: i, t: t, libelle: DUREES[i][1], bpm: bpm,
      battements: bpm * t / 60,
      cellules: cellules,
      sanguines: cellules * 0.9,
      part: cellules / CELLULES_CORPS * 100,
      litres: DEBIT_REPOS_L_MIN * t / 60,
      densite: Math.max(0.06, Math.min(1, (Math.log(cellules) / Math.LN10 - 6.4) / 5.2)),
      pulsation: bpm / 180
    };
  }

  function texteSortie() {
    var k = calcul();
    return 'Durée ' + k.libelle + ' · ' + fr(k.bpm) + ' battements par minute';
  }

  function texteBattements(b) {
    if (b < 10) { return fr(b, 1) + ' battement' + (b >= 2 ? 's' : ''); }
    return fr(b) + ' battements';
  }

  function texteSang(l) {
    if (l < 1) { return fr(l * 1000) + ' millilitres'; }
    return fr(l, l < 100 ? 1 : 0) + ' litres';
  }

  function textePart(p) {
    if (p < 0.001) { return 'moins d’un millième de pour cent'; }
    if (p < 0.1) { return fr(p, 3) + ' %'; }
    return fr(p, 2) + ' %';
  }

  function majLegende(k) {
    if (sortie) { sortie.textContent = texteSortie(); }
    if (cDuree) { cDuree.setAttribute('aria-valuetext', k.libelle); }
    if (cFreq) { cFreq.setAttribute('aria-valuetext', fr(k.bpm) + ' battements par minute'); }
    if (!legende) { return; }
    var effort = k.bpm > 100
      ? ' Au-delà de 100 battements par minute, le débit réel augmente : ce volume reste la valeur de repos et n’est pas recalculé.'
      : '';
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : visualisation JPG, sans particules calculées.' : '';
    legende.innerHTML = '<strong>En ' + k.libelle + ' : ' + texteBattements(k.battements) +
      ', environ ' + grand(k.cellules) + ' de cellules renouvelées, dont environ ' +
      grand(k.sanguines) + ' de cellules sanguines.</strong> Cela représente ' + textePart(k.part) +
      ' des quelque 30 000 milliards de cellules du corps (F-181). Au repos, le cœur pompe pendant ce temps environ ' +
      texteSang(k.litres) + ' de sang (F-101).' + effort +
      ' Calcul : 330 milliards de cellules par jour (F-103), soit environ 3,8 millions par seconde.' + repli;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, densite: f32, pulsation: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    'fn h(q: vec2<f32>) -> f32 { return fract(sin(dot(q, vec2<f32>(127.1, 311.7))) * 43758.5453); }',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let echelle = min(u.resolution.x, u.resolution.y);',
    '  let p = (f.xy - 0.5 * u.resolution) / echelle;',
    '  let yc = -0.05 - 0.5 * p.x;',
    '  let d = abs(p.y - yc);',
    '  let g = vec2<f32>(p.x, p.y - yc) * 30.0;',
    '  let id = floor(g);',
    '  let fr = fract(g) - vec2<f32>(0.5, 0.5);',
    '  let r = h(id);',
    '  let dec = (vec2<f32>(h(id + vec2<f32>(1.3, 2.1)), h(id + vec2<f32>(7.1, 3.7))) - vec2<f32>(0.5, 0.5)) * 0.6;',
    '  let pres = step(r, u.densite) * exp(-d * 5.0);',
    '  let dd = length(fr - dec);',
    '  let pt = (smoothstep(0.24, 0.12, dd) * 0.95 + exp(-dd * 6.0) * 0.35) * pres;',
    '  let bande = exp(-d * 12.0) * 0.18;',
    '  let dc = length(p - vec2<f32>(-0.62, 0.0));',
    '  let anneaux = pow(0.5 + 0.5 * cos(dc * (18.0 + 40.0 * u.pulsation)), 28.0) * exp(-dc * 1.6) * 0.6;',
    '  var col = vec3<f32>(0.95, 0.28, 0.22) * pt + vec3<f32>(1.0, 0.72, 0.45) * bande;',
    '  col += vec3<f32>(1.0, 0.55, 0.45) * anneaux;',
    '  let alpha = clamp(pt + bande + anneaux, 0.0, 0.92);',
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
    device.pushErrorScope('validation');
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
    var erreur = await device.popErrorScope();
    if (erreur) { console.warn('[CREATIO] WGSL rejeté : ' + erreur.message); return null; }
    var uniformes = device.createBuffer({
      size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, k.densite, k.pulsation]));
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
    'uniform vec2 u_res; uniform float u_densite; uniform float u_pulsation; out vec4 outColor;',
    'float h(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float echelle = min(u_res.x, u_res.y);',
    '  vec2 p = (f - 0.5 * u_res) / echelle;',
    '  float yc = -0.05 - 0.5 * p.x;',
    '  float d = abs(p.y - yc);',
    '  vec2 g = vec2(p.x, p.y - yc) * 30.0;',
    '  vec2 id = floor(g);',
    '  vec2 fr = fract(g) - 0.5;',
    '  float r = h(id);',
    '  vec2 dec = (vec2(h(id + vec2(1.3, 2.1)), h(id + vec2(7.1, 3.7))) - 0.5) * 0.6;',
    '  float pres = step(r, u_densite) * exp(-d * 5.0);',
    '  float dd = length(fr - dec);',
    '  float pt = (smoothstep(0.24, 0.12, dd) * 0.95 + exp(-dd * 6.0) * 0.35) * pres;',
    '  float bande = exp(-d * 12.0) * 0.18;',
    '  float dc = length(p - vec2(-0.62, 0.0));',
    '  float anneaux = pow(0.5 + 0.5 * cos(dc * (18.0 + 40.0 * u_pulsation)), 28.0) * exp(-dc * 1.6) * 0.6;',
    '  vec3 col = vec3(0.95, 0.28, 0.22) * pt + vec3(1.0, 0.72, 0.45) * bande;',
    '  col += vec3(1.0, 0.55, 0.45) * anneaux;',
    '  float alpha = clamp(pt + bande + anneaux, 0.0, 0.92);',
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
    var loc = {};
    ['u_res', 'u_densite', 'u_pulsation'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (k) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.u_res, c.width, c.height);
        gl.uniform1f(loc.u_densite, k.densite);
        gl.uniform1f(loc.u_pulsation, k.pulsation);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    function alea(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    return {
      nom: 'Dessin en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height, R = Math.min(W, H);
        var cx = W / 2, cy = H / 2;
        ctx.clearRect(0, 0, W, H);
        // Anneaux de pulsation, centrés à gauche.
        var ox = cx - 0.62 * R, pas = R / (3 + 6.4 * k.pulsation);
        ctx.lineWidth = Math.max(1, R * 0.003);
        for (var a = 1; a <= 6; a++) {
          ctx.strokeStyle = 'rgba(255,140,115,' + (0.32 / a).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(ox, cy, a * pas * 0.5, 0, 6.284); ctx.stroke();
        }
        // Particules le long d'un vaisseau sinueux.
        var n = Math.round(30 + 520 * k.densite);
        for (var i = 0; i < n; i++) {
          var x = (alea(i) - 0.5) * W / R;
          var yc = -0.05 - 0.5 * x;
          var y = yc + (alea(i + 1000) - 0.5) * 0.16;
          var r = Math.max(1.5, R * (0.004 + 0.004 * alea(i + 2000)));
          ctx.fillStyle = 'rgba(245,80,60,' + (0.5 + 0.45 * alea(i + 3000)).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(cx + x * R, cy + y * R, r, 0, 6.284); ctx.fill();
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
    var k = calcul();
    majLegende(k);
    cadre.setAttribute('data-duree', String(k.t));
    cadre.setAttribute('data-frequence', String(k.bpm));
    cadre.setAttribute('data-battements', String(Math.round(k.battements)));
    cadre.setAttribute('data-cellules', String(Math.round(k.cellules)));
    if (moteur) { moteur.rendre(k); }
  }

  [cDuree, cFreq].forEach(function (c) {
    if (c) { c.addEventListener('input', rafraichir); }
  });
  if (bJour) {
    bJour.addEventListener('click', function () {
      if (cDuree) { cDuree.value = String(DUREES.length - 1); }
      rafraichir();
    });
  }
  if (bRepos) {
    bRepos.addEventListener('click', function () {
      if (cFreq) { cFreq.value = '70'; }
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
        m.rendre(calcul());
      }).observe(hote);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
