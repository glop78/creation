/* ==========================================================================
   CREATIO — Frise cosmique (salle 01, E05)
   Le visiteur parcourt 13,787 milliards d'années, du fond diffus cosmologique
   à aujourd'hui. Bascule entre échelle linéaire et échelle logarithmique.
   Quatre replis : calcul graphique (WGSL), interface graphique (GLSL ES),
   dessin en deux dimensions, image JPG. Le clavier pilote le curseur.
   Les jalons sont tous rattachés à des faits vérifiés du corpus E02.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-frise]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-frise-image]');
  var statut = cadre.querySelector('[data-frise-moteur]');
  var legende = cadre.querySelector('[data-frise-legende]');
  var curseur = cadre.querySelector('[data-frise-curseur]');
  var boutonEchelle = cadre.querySelector('[data-frise-echelle]');
  var sortieTemps = cadre.querySelector('[data-frise-temps]');
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var AGE = 13.787; // milliards d'années, Planck 2018 (F-001)
  var log = false;
  var avancement = 0; // 0 → 1, proportion du temps écoulé

  // Temps en milliards d'années après le début de l'expansion.
  var JALONS = [
    { t: 0.000, titre: 'Le fond diffus cosmologique', fait: 'F-001',
      texte: 'L’ajustement du modèle de référence donne un âge de 13,787 ± 0,020 milliards d’années.' },
    { t: 0.280, titre: 'La galaxie MoM-z14', fait: 'F-006',
      texte: 'Lumière émise environ 280 millions d’années après le début de l’expansion, à z = 14,44.' },
    { t: 1.000, titre: 'Les premières galaxies brillantes', fait: 'F-009',
      texte: 'Le relevé « Mirage or Miracle » estime leur densité plus de 100 fois supérieure aux modèles antérieurs.' },
    { t: 9.000, titre: 'Le Soleil et son énergie', fait: 'F-013',
      texte: 'Chaque seconde, notre étoile convertit environ quatre millions de tonnes de matière en énergie.' },
    { t: AGE, titre: 'Aujourd’hui', fait: 'F-004',
      texte: 'En 2025, DESI a publié un indice à 3,1 σ en faveur d’une énergie sombre variable : recherche en cours.' }
  ];

  function tempsCourant() {
    if (!log) { return avancement * AGE; }
    // Échelle logarithmique : on part de 0,001 milliard d'années.
    var min = Math.log10(0.001);
    var max = Math.log10(AGE);
    return Math.pow(10, min + avancement * (max - min));
  }

  function formater(t) {
    if (t < 0.001) { return 'Le commencement (0 année)'; }
    if (t < 1) {
      var millions = Math.round(t * 1000);
      return millions + (millions > 1 ? ' millions d’années' : ' million d’années');
    }
    var texte = t.toFixed(3).replace('.', ',');
    if (texte === '1,000') { return '1 milliard d’années'; }
    return texte + ' milliards d’années';
  }

  function jalonCourant() {
    var t = tempsCourant();
    var meilleur = JALONS[0];
    for (var i = 0; i < JALONS.length; i++) {
      if (JALONS[i].t <= t + 0.0001) { meilleur = JALONS[i]; }
    }
    return meilleur;
  }

  function majLegende() {
    var j = jalonCourant();
    if (sortieTemps) { sortieTemps.textContent = formater(tempsCourant()); }
    if (legende) {
      legende.innerHTML = '<strong>' + j.titre + '</strong> — <span>' + j.texte +
        ' <em>Fait ' + j.fait + '.</em></span>';
    }
    if (image) {
      var src = tempsCourant() < 1 ? '../assets/img/salles/01/s01-aube-cosmique.jpg' :
        (tempsCourant() < 9 ? '../assets/img/salles/01/s01-toile-galaxies.jpg' :
          '../assets/img/salles/01/s01-champ-profond.jpg');
      if (image.getAttribute('src') !== src) { image.setAttribute('src', src); }
    }
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, avancement: f32, log: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let bande = exp(-abs(uv.y - 0.5) * 9.0);',
    '  let progression = smoothstep(uv.x - 0.02, uv.x + 0.02, u.avancement);',
    '  let lueur = bande * mix(0.25, 0.85, progression);',
    '  let onde = 0.5 + 0.5 * sin(uv.x * 42.0 + u.avancement * 12.0);',
    '  let col = vec3<f32>(0.90 * lueur, 0.77 * lueur * onde, 0.42 * lueur * 0.6);',
    '  let a = clamp(lueur * 0.6, 0.0, 0.7);',
    '  return vec4<f32>(col * a, a);',
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
    var tampon = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: tampon } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(tampon, 0,
          new Float32Array([c.width, c.height, avancement, log ? 1 : 0]));
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
    'uniform vec2 u_res; uniform float u_av; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float bande = exp(-abs(uv.y - 0.5) * 9.0);',
    '  float progression = smoothstep(uv.x - 0.02, uv.x + 0.02, u_av);',
    '  float lueur = bande * mix(0.25, 0.85, progression);',
    '  float onde = 0.5 + 0.5 * sin(uv.x * 42.0 + u_av * 12.0);',
    '  vec3 col = vec3(0.90 * lueur, 0.77 * lueur * onde, 0.42 * lueur * 0.6);',
    '  float a = clamp(lueur * 0.6, 0.0, 0.7);',
    '  outColor = vec4(col * a, a);',
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
    var uAv = gl.getUniformLocation(prog, 'u_av');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height); gl.uniform1f(uAv, avancement);
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
      nom: 'Dessin procédural en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        var w = c.width, h = c.height;
        ctx.clearRect(0, 0, w, h);
        var y = h * 0.5;
        var degrade = ctx.createLinearGradient(0, 0, w, 0);
        degrade.addColorStop(0, 'rgba(107, 127, 216, 0.75)');
        degrade.addColorStop(Math.max(0.001, avancement), 'rgba(230, 196, 106, 0.95)');
        degrade.addColorStop(Math.min(1, avancement + 0.001), 'rgba(230, 196, 106, 0.18)');
        degrade.addColorStop(1, 'rgba(107, 127, 216, 0.18)');
        ctx.strokeStyle = degrade; ctx.lineWidth = Math.max(3, h * 0.035);
        ctx.beginPath(); ctx.moveTo(w * 0.04, y); ctx.lineTo(w * 0.96, y); ctx.stroke();
        JALONS.forEach(function (j) {
          var pos = log ? (Math.log10(Math.max(0.001, j.t)) - Math.log10(0.001)) /
            (Math.log10(AGE) - Math.log10(0.001)) : j.t / AGE;
          var x = w * (0.04 + 0.92 * pos);
          ctx.beginPath(); ctx.arc(x, y, Math.max(3, h * 0.022), 0, Math.PI * 2);
          ctx.fillStyle = pos <= avancement + 0.001 ? '#F6E4B0' : '#6B7FD8';
          ctx.fill();
        });
      },
      arreter: function () {}
    };
  }

  /* --- 4. Image seule ---------------------------------------------------- */
  function creerImageSeule(c) {
    c.style.display = 'none';
    return {
      nom: 'Image JPG statique',
      redimensionner: function () {}, rendre: function () {}, arreter: function () {}
    };
  }

  function nouveauCanvas() {
    var ancien = cadre.querySelector('canvas');
    var frais = document.createElement('canvas');
    frais.setAttribute('aria-hidden', 'true');
    ancien.replaceWith(frais);
    return frais;
  }

  var moteur = null;
  function rafraichir() {
    majLegende();
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) {
    curseur.addEventListener('input', function () {
      avancement = parseFloat(curseur.value) / 1000;
      rafraichir();
    });
  }
  if (boutonEchelle) {
    boutonEchelle.addEventListener('click', function () {
      log = !log;
      boutonEchelle.setAttribute('aria-pressed', log ? 'true' : 'false');
      boutonEchelle.textContent = log ? 'Échelle logarithmique — activer l’échelle linéaire' :
        'Échelle linéaire — activer l’échelle logarithmique';
      rafraichir();
    });
  }

  async function demarrer() {
    var c = nouveauCanvas();
    // Le canvas occupe la figure (16:9), pas le cadre entier qui contient
    // aussi le curseur et la légende : mesurer le cadre étirerait la frise.
    var hote = c.parentElement || cadre;
    var rect = hote.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(2, Math.round(rect.width * ratio));
    var h = Math.max(2, Math.round(rect.height * ratio));
    var m = null;
    try { m = await creerWebGPU(c); } catch (e) { m = null; }
    if (!m) { c = nouveauCanvas(); try { m = creerWebGL2(c); } catch (e) { m = null; } }
    if (!m) { c = nouveauCanvas(); try { m = creerCanvas2D(c); } catch (e) { m = null; } }
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
