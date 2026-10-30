/* ==========================================================================
   CREATIO — Ciel profond navigable (salle 04, E06)
   Deux cent mille points sont dessinés, du champ large au zoom serré.
   Quatre replis : calcul graphique (WGSL), interface graphique (GLSL ES),
   dessin en deux dimensions, image JPG. Le clavier pilote le zoom.

   HONNÊTETÉ : ces points sont générés par un procédé pseudo-aléatoire pour
   l'illustration. Ils ne représentent aucune étoile cataloguée. Aucun
   chiffre affiché ici n'est une mesure astronomique.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-ciel]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-ciel-image]');
  var statut = cadre.querySelector('[data-ciel-moteur]');
  var legende = cadre.querySelector('[data-ciel-legende]');
  var curseur = cadre.querySelector('[data-ciel-zoom]');
  var sortieZoom = cadre.querySelector('[data-ciel-sortie]');
  var boutonMoins = cadre.querySelector('[data-ciel-moins]');
  var boutonPlus = cadre.querySelector('[data-ciel-plus]');
  var boutonReset = cadre.querySelector('[data-ciel-reset]');

  var NOMBRE = 200000;
  var zoom = 1;
  var moteur = null;
  var hote = null;

  /* Générateur pseudo-aléatoire déterministe : même ciel pour tous les replis.
     Trois nombres par point : x, y dans [0,1] et une magnitude dans [0,1].
     Une partie des points suit une bande courbe, évoquant un plan galactique. */
  function generer() {
    var donnees = new Float32Array(NOMBRE * 3);
    var etat = 2166136261 >>> 0;
    function suite() {
      etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
      return etat / 4294967296;
    }
    for (var i = 0; i < NOMBRE; i++) {
      var x = suite(), y = suite(), m = suite();
      if (i % 5 === 0) {
        var centre = 0.5 + 0.16 * Math.sin(x * 5.2 + 0.7);
        y = centre + (y - 0.5) * 0.14;
        if (y < 0) { y += 1; }
        if (y > 1) { y -= 1; }
      }
      m = Math.pow(m, 3.2);
      donnees[i * 3] = x;
      donnees[i * 3 + 1] = y;
      donnees[i * 3 + 2] = m;
    }
    return donnees;
  }
  var etoiles = generer();

  function majImage() {
    if (!image) { return; }
    var src = zoom > 4
      ? '../assets/img/salles/04/s04-galaxie-primitive.jpg'
      : '../assets/img/salles/04/s04-champ-profond.jpg';
    if (image.getAttribute('src') !== src) {
      image.setAttribute('src', src);
      image.setAttribute('alt', zoom > 4
        ? 'Galaxie primitive irrégulière dans un champ d’étoiles lointain.'
        : 'Champ profond rempli de galaxies et d’étoiles très lointaines.');
    }
  }

  function majLegende() {
    if (sortieZoom) {
      sortieZoom.textContent = 'Grossissement ' + zoom.toFixed(1).replace('.', ',') + ' fois';
    }
    if (!legende) { return; }
    if (moteur && moteur.nom === 'Image JPG statique') {
      legende.textContent = 'Repli image : un champ profond illustratif en JPG, ' +
        'sans calcul de points. Le parcours au clavier reste disponible.';
      return;
    }
    var visibles = Math.round(NOMBRE / Math.max(1, zoom * zoom));
    var nombre = new Intl.NumberFormat('fr-FR').format(visibles);
    legende.innerHTML = '<strong>' + nombre + ' points environ dans le cadre.</strong> ' +
      'Sur les 200 000 générés, le zoom en laisse sortir une partie. Ces points sont ' +
      'une illustration : ils ne correspondent à aucune étoile cataloguée.';
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { a: vec4<f32>, b: vec4<f32>, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    'struct V { @location(0) pos: vec2<f32>, @location(1) mag: f32, };',
    'struct Out { @builtin(position) p: vec4<f32>, @location(0) mag: f32, };',
    '@vertex fn vs(v: V, @builtin(vertex_index) i: u32) -> Out {',
    '  var coins = array<vec2<f32>, 3>(',
    '    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(0.0, 1.0));',
    '  let p = (v.pos - vec2<f32>(0.5, 0.5)) * u.a.z + vec2<f32>(0.5, 0.5)',
    '        + vec2<f32>(u.a.w, u.b.x);',
    '  let clip = vec2<f32>(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0);',
    '  let e = (0.7 + v.mag * 1.5) * 2.0;',
    '  let taille = vec2<f32>(e / u.a.x, e / u.a.y);',
    '  var o: Out;',
    '  o.p = vec4<f32>(clip + coins[i] * taille, 0.0, 1.0);',
    '  o.mag = v.mag;',
    '  return o;',
    '}',
    '@fragment fn fs(o: Out) -> @location(0) vec4<f32> {',
    '  let col = mix(vec3<f32>(0.55, 0.68, 1.0), vec3<f32>(1.0, 0.93, 0.76), o.mag);',
    '  let a = clamp(0.12 + 0.58 * o.mag, 0.0, 1.0);',
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
      vertex: {
        module: module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 12, stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32' }
          ]
        }]
      },
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
      size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var sommets = device.createBuffer({
      size: etoiles.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(sommets, 0, etoiles);
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, zoom, 0, 0, 0, 0, 0
        ]));
        var enc = device.createCommandEncoder();
        var passe = enc.beginRenderPass({ colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }] });
        passe.setPipeline(pipeline);
        passe.setBindGroup(0, groupe);
        passe.setVertexBuffer(0, sommets);
        passe.draw(3, NOMBRE);
        passe.end();
        device.queue.submit([enc.finish()]);
      },
      arreter: function () {}
    };
  }

  /* --- 2. GLSL ES -------------------------------------------------------- */
  var GVS = ['#version 300 es',
    'layout(location = 0) in vec2 a_pos;',
    'layout(location = 1) in float a_mag;',
    'uniform float u_zoom;',
    'out float v_mag;',
    'void main() {',
    '  vec2 p = (a_pos - 0.5) * u_zoom + 0.5;',
    '  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);',
    '  gl_PointSize = 1.0 + a_mag * 1.5;',
    '  v_mag = a_mag;',
    '}'].join('\n');
  var GFS = ['#version 300 es', 'precision highp float;',
    'in float v_mag; out vec4 outColor;',
    'void main() {',
    '  vec3 col = mix(vec3(0.55, 0.68, 1.0), vec3(1.0, 0.93, 0.76), v_mag);',
    '  float a = clamp(0.12 + 0.58 * v_mag, 0.0, 1.0);',
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
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, etoiles, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    var uZoom = gl.getUniformLocation(prog, 'u_zoom');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uZoom, zoom);
        gl.drawArrays(gl.POINTS, 0, NOMBRE);
      },
      arreter: function () { gl.deleteProgram(prog); gl.deleteBuffer(vbo); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    var petit = document.createElement('canvas');
    petit.width = 960; petit.height = 540;
    var pctx = petit.getContext('2d');
    var donnees = pctx.createImageData(petit.width, petit.height);
    return {
      nom: 'Dessin procédural en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        var W = petit.width, H = petit.height;
        var pix = donnees.data;
        pix.fill(0);
        for (var i = 0; i < NOMBRE; i++) {
          var j = i * 3;
          var x = (etoiles[j] - 0.5) * zoom + 0.5;
          var y = (etoiles[j + 1] - 0.5) * zoom + 0.5;
          if (x < 0 || x >= 1 || y < 0 || y >= 1) { continue; }
          var px = (x * W) | 0, py = (y * H) | 0;
          var m = etoiles[j + 2];
          var r = Math.min(255, (0.55 + 0.45 * m) * 255) | 0;
          var g = Math.min(255, (0.68 + 0.25 * m) * 255) | 0;
          var b = Math.min(255, (1.0 - 0.24 * m) * 255) | 0;
          var a = Math.min(255, (0.12 + 0.58 * m) * 255) | 0;
          var k = (py * W + px) * 4;
          pix[k] = r; pix[k + 1] = g; pix[k + 2] = b; pix[k + 3] = a;
          if (m > 0.75 && px + 1 < W && py + 1 < H) {
            var k2 = k + 4;
            pix[k2] = r; pix[k2 + 1] = g; pix[k2 + 2] = b; pix[k2 + 3] = (a * 0.5) | 0;
          }
        }
        pctx.putImageData(donnees, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(petit, 0, 0, c.width, c.height);
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

  function appliquerZoom() {
    var t = (parseFloat(curseur ? curseur.value : '0') || 0) / 1000;
    zoom = 1 + t * t * 11;
  }

  function rafraichir() {
    appliquerZoom();
    majImage();
    majLegende();
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  function decaler(delta) {
    if (!curseur) { return; }
    var v = Math.max(0, Math.min(1000, (parseFloat(curseur.value) || 0) + delta));
    curseur.value = String(v);
    rafraichir();
  }
  if (boutonMoins) {
    boutonMoins.addEventListener('click', function () { decaler(-90); });
  }
  if (boutonPlus) {
    boutonPlus.addEventListener('click', function () { decaler(90); });
  }
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
      console.warn('[CREATIO] calcul graphique indisponible : ' + e); m = null; }
    if (!m) { c = nouveauCanvas(); try { m = creerWebGL2(c); } catch (e) {
      console.warn('[CREATIO] interface graphique indisponible : ' + e); m = null; } }
    if (!m) { c = nouveauCanvas(); try { m = creerCanvas2D(c); } catch (e) {
      console.warn('[CREATIO] dessin deux dimensions indisponible : ' + e); m = null; } }
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
