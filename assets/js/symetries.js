/* ==========================================================================
   CREATIO — Atelier de symétrie (salle 03, E06)
   Le visiteur fait tourner une rosace et choisit son ordre de symétrie.
   Quatre replis : calcul graphique (WGSL), interface graphique (GLSL ES),
   dessin en deux dimensions, image JPG. Le clavier pilote les deux commandes.
   Aucune valeur affichée n'est une mesure : c'est une illustration
   géométrique de la notion d'invariance, en écho à la question de Wigner.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-symetries]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-symetries-image]');
  var statut = cadre.querySelector('[data-symetries-moteur]');
  var legende = cadre.querySelector('[data-symetries-legende]');
  var curseur = cadre.querySelector('[data-symetries-angle]');
  var sortieAngle = cadre.querySelector('[data-symetries-sortie]');
  var ordreSelect = cadre.querySelector('[data-symetries-ordre]');
  var boutonAuto = cadre.querySelector('[data-symetries-auto]');

  var angle = 0;            // degrés
  var ordre = 6;            // nombre de pétales
  var moteur = null;
  var hote = null;

  function radians() { return angle * Math.PI / 180; }

  function majLegende() {
    var pas = 360 / ordre;
    var reste = ((angle % pas) + pas) % pas;
    var proche = Math.min(reste, pas - reste) < 1.2;
    if (sortieAngle) {
      sortieAngle.textContent = 'Rotation de ' + angle.toFixed(0).replace('.', ',') + '°';
    }
    if (legende) {
      var debut = proche
        ? '<strong>La figure se superpose exactement.</strong> '
        : '<strong>Rotation en cours.</strong> ';
      var suite = 'Une rosace d’ordre ' + ordre + ' se retrouve tous les ' +
        (Math.round(pas * 10) / 10).toFixed(1).replace('.', ',') +
        '°. Ce qui ne change pas pendant la rotation, c’est l’équation qui la décrit : ' +
        'une invariance au sens mathématique.';
      legende.innerHTML = debut + suite +
        (proche ? '' : ' Essayez le bouton « Trouver l’angle de symétrie ».');
    }
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, angle: f32, ordre: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = (f.xy - 0.5 * u.resolution) / min(u.resolution.x, u.resolution.y);',
    '  let r = length(uv);',
    '  let a = atan2(uv.y, uv.x) - u.angle;',
    '  let c0 = 0.16 + 0.040 * cos(u.ordre * a);',
    '  let c1 = 0.24 + 0.035 * cos((u.ordre + 1.0) * a + 0.4);',
    '  let c2 = 0.32 + 0.028 * cos((u.ordre + 2.0) * a + 0.8);',
    '  let l = exp(-abs(r - c0) * 150.0) * 0.75',
    '     + exp(-abs(r - c1) * 170.0) * 0.55',
    '     + exp(-abs(r - c2) * 190.0) * 0.38;',
    '  let col = vec3<f32>(0.98 * l, 0.84 * l, 0.52 * l);',
    '  let alpha = clamp(l * 0.85, 0.0, 0.85);',
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
    var tampon = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: tampon } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(tampon, 0,
          new Float32Array([c.width, c.height, radians(), ordre]));
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
    'uniform vec2 u_res; uniform float u_angle; uniform float u_ordre; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);',
    '  float r = length(uv);',
    '  float a = atan(uv.y, uv.x) - u_angle;',
    '  float c0 = 0.16 + 0.040 * cos(u_ordre * a);',
    '  float c1 = 0.24 + 0.035 * cos((u_ordre + 1.0) * a + 0.4);',
    '  float c2 = 0.32 + 0.028 * cos((u_ordre + 2.0) * a + 0.8);',
    '  float l = exp(-abs(r - c0) * 150.0) * 0.75',
    '     + exp(-abs(r - c1) * 170.0) * 0.55',
    '     + exp(-abs(r - c2) * 190.0) * 0.38;',
    '  vec3 col = vec3(0.98 * l, 0.84 * l, 0.52 * l);',
    '  float alpha = clamp(l * 0.85, 0.0, 0.85);',
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
    var uOrdre = gl.getUniformLocation(prog, 'u_ordre');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uAngle, radians());
        gl.uniform1f(uOrdre, ordre);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    var petit = document.createElement('canvas');
    petit.width = 320; petit.height = 180;
    var pctx = petit.getContext('2d');
    var donnees = pctx.createImageData(petit.width, petit.height);
    return {
      nom: 'Dessin procédural en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        var W = petit.width, H = petit.height;
        var pix = donnees.data;
        var m = Math.min(W, H);
        var a0 = radians();
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var ux = (x - W / 2) / m, uy = (y - H / 2) / m;
            var r = Math.sqrt(ux * ux + uy * uy);
            var a = Math.atan2(uy, ux) - a0;
            var c0 = 0.16 + 0.040 * Math.cos(ordre * a);
            var c1 = 0.24 + 0.035 * Math.cos((ordre + 1) * a + 0.4);
            var c2 = 0.32 + 0.028 * Math.cos((ordre + 2) * a + 0.8);
            var l = Math.exp(-Math.abs(r - c0) * 150) * 0.75
              + Math.exp(-Math.abs(r - c1) * 170) * 0.55
              + Math.exp(-Math.abs(r - c2) * 190) * 0.38;
            var alpha = Math.max(0, Math.min(0.85, l * 0.85));
            var i = (y * W + x) * 4;
            pix[i] = Math.min(255, 250 * l);
            pix[i + 1] = Math.min(255, 214 * l);
            pix[i + 2] = Math.min(255, 133 * l);
            pix[i + 3] = Math.round(alpha * 255);
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

  function rafraichir() {
    majLegende();
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) {
    curseur.addEventListener('input', function () {
      angle = parseFloat(curseur.value) || 0;
      rafraichir();
    });
  }
  if (ordreSelect) {
    ordreSelect.addEventListener('change', function () {
      ordre = parseFloat(ordreSelect.value) || 6;
      rafraichir();
    });
  }
  if (boutonAuto) {
    boutonAuto.addEventListener('click', function () {
      angle = Math.round(360 / ordre);
      if (curseur) { curseur.value = String(angle); }
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
