/* ==========================================================================
   CREATIO — Loupe sur le sol (salle 08, E08)
   Quatre échelles, du paysage aux micro-organismes. Le visiteur déplace un
   curseur : l'image JPG change, les particules grossissent, la légende
   publie le fait vérifié correspondant. Quatre replis : WGSL, GLSL ES,
   dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : les particules dessinées sont générées pour l'illustration,
   elles ne représentent aucune cellule réelle. Les chiffres du sol sont des
   ordres de grandeur (sources S037, S038 ; faits F-045 à F-049, F-142,
   F-143). L'estimation de 10 000 à 50 000 taxons est DÉBATTUE (F-047).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-sol]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-sol-image]');
  var statut = cadre.querySelector('[data-sol-moteur]');
  var legende = cadre.querySelector('[data-sol-legende]');
  var curseur = cadre.querySelector('[data-sol-zoom]');
  var sortie = cadre.querySelector('[data-sol-sortie]');
  var boutonMoins = cadre.querySelector('[data-sol-moins]');
  var boutonPlus = cadre.querySelector('[data-sol-plus]');
  var boutonReset = cadre.querySelector('[data-sol-reset]');

  var moteur = null;
  var hote = null;

  var ECHELLES = [
    {
      titre: 'Échelle 1 — le paysage',
      image: 's08-paysage-sol.jpg',
      alt: 'Paysage cultivé au lever du Soleil, sillons de terre brune.',
      texte: 'Le sol n’est pas un décor inerte : il abrite une communauté vivante ' +
        'qui transforme la matière en humus.'
    },
    {
      titre: 'Échelle 2 — une cuillère à café',
      image: 's08-cuillere-terre.jpg',
      alt: 'Cuillère de terre sombre avec grains et fines racines.',
      texte: 'Une cuillère à café de sol contient plus de micro-organismes qu’il n’y a ' +
        'd’êtres humains sur la Terre (fait F-045, source S037).'
    },
    {
      titre: 'Échelle 3 — un gramme de sol',
      image: 's08-grain-sol.jpg',
      alt: 'Grain de sol entouré de filaments fongiques lumineux.',
      texte: 'Un gramme de sol peut contenir un milliard de cellules bactériennes et ' +
        'plusieurs kilomètres de filaments fongiques (fait F-046, source S038).'
    },
    {
      titre: 'Échelle 4 — les micro-organismes',
      image: 's08-bacteries-sol.jpg',
      alt: 'Cellules microbiennes arrondies et filaments fongiques dans un sol humide.',
      texte: 'Ils ne représentent qu’environ un demi-pour-cent de la masse du sol, mais ' +
        'assurent l’essentiel de la transformation en humus (fait F-048). Le nombre de ' +
        'taxons, estimé entre 10 000 et 50 000, reste DÉBATTU (fait F-047).'
    }
  ];

  function palier() {
    var v = Math.round(parseFloat(curseur ? curseur.value : '0') || 0);
    return Math.max(0, Math.min(ECHELLES.length - 1, v));
  }

  function majImage() {
    var p = palier(), e = ECHELLES[p];
    if (image) {
      var src = '../assets/img/salles/08/' + e.image;
      if (image.getAttribute('src') !== src) {
        image.setAttribute('src', src);
        image.setAttribute('alt', e.alt);
      }
    }
    cadre.setAttribute('data-echelle', String(p));
  }

  function majLegende() {
    var p = palier(), e = ECHELLES[p];
    if (sortie) { sortie.textContent = e.titre; }
    if (!legende) { return; }
    if (moteur && moteur.nom === 'Image JPG statique') {
      legende.innerHTML = '<strong>' + e.titre + '.</strong> ' + e.texte +
        ' Repli image : visualisation JPG, sans particules calculées.';
      return;
    }
    legende.innerHTML = '<strong>' + e.titre + '.</strong> ' + e.texte +
      ' Les particules dessinées sont une illustration, pas des cellules réelles.';
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, zoom: f32, palier: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let cell = vec2<f32>(14.0 - 2.4 * u.zoom, 8.0 - 1.3 * u.zoom);',
    '  let g = uv * cell;',
    '  let id = floor(g);',
    '  let local = fract(g) - vec2<f32>(0.5, 0.5);',
    '  let hach = fract(sin(dot(id, vec2<f32>(12.9898, 78.233))) * 43758.5453);',
    '  let rayon = 0.04 + 0.10 * hach + 0.055 * u.zoom;',
    '  let d = length(local);',
    '  let point = 1.0 - smoothstep(rayon * 0.55, rayon, d);',
    '  let col = mix(vec3<f32>(0.55, 0.85, 0.75), vec3<f32>(1.0, 0.78, 0.42), hach);',
    '  let alpha = clamp(point * 0.42, 0.0, 0.6);',
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
        var p = palier();
        device.queue.writeBuffer(uniformes, 0,
          new Float32Array([c.width, c.height, p, p]));
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
    'uniform vec2 u_res; uniform float u_zoom; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  vec2 cell = vec2(14.0 - 2.4 * u_zoom, 8.0 - 1.3 * u_zoom);',
    '  vec2 g = uv * cell;',
    '  vec2 id = floor(g);',
    '  vec2 local = fract(g) - vec2(0.5);',
    '  float hach = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);',
    '  float rayon = 0.04 + 0.10 * hach + 0.055 * u_zoom;',
    '  float d = length(local);',
    '  float point = 1.0 - smoothstep(rayon * 0.55, rayon, d);',
    '  vec3 col = mix(vec3(0.55, 0.85, 0.75), vec3(1.0, 0.78, 0.42), hach);',
    '  float alpha = clamp(point * 0.42, 0.0, 0.6);',
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
    var uZoom = gl.getUniformLocation(prog, 'u_zoom');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        var p = palier();
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uZoom, p);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function hash2(i, j) {
    var x = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    return {
      nom: 'Dessin en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height, p = palier();
        ctx.clearRect(0, 0, W, H);
        var cx = Math.ceil(14 - 2.4 * p), cy = Math.ceil(8 - 1.3 * p);
        for (var i = 0; i < cx; i++) {
          for (var j = 0; j < cy; j++) {
            var hach = hash2(i, j);
            var rayon = (0.04 + 0.10 * hach + 0.055 * p) * Math.min(W / cx, H / cy);
            var x = (i + 0.5) * W / cx, y = (j + 0.5) * H / cy;
            var r = Math.round(140 + 115 * hach), g = Math.round(200 - 20 * hach);
            var b = Math.round(190 - 90 * hach);
            ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.40)';
            ctx.beginPath(); ctx.arc(x, y, rayon, 0, 6.284); ctx.fill();
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
    majImage();
    majLegende();
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  function decaler(d) {
    if (!curseur) { return; }
    var v = Math.max(0, Math.min(ECHELLES.length - 1, palier() + d));
    curseur.value = String(v);
    rafraichir();
  }
  if (boutonMoins) { boutonMoins.addEventListener('click', function () { decaler(-1); }); }
  if (boutonPlus) { boutonPlus.addEventListener('click', function () { decaler(1); }); }
  if (boutonReset) {
    boutonReset.addEventListener('click', function () {
      if (curseur) { curseur.value = '0'; }
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
