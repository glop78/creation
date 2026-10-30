/* ==========================================================================
   CREATIO — Chronomètre de la cohérence (salle 12, E10)
   Le visiteur parcourt les 1 500 femtosecondes qui suivent l'absorption d'un
   photon et voit la composante électronique s'éteindre tandis que les
   oscillations vibrationnelles persistent. Quatre replis : WGSL, GLSL ES,
   dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : 60 femtosecondes à température ambiante (Duan 2017, S025,
   fait F-071, DÉBATTU), 240 femtosecondes à 77 kelvins (Thyrhaug 2018, S027,
   fait F-072) et l'origine vibrationnelle des battements durables (Cao 2020,
   S026, fait F-073) sont les valeurs publiées. Les courbes tracées sont des
   enveloppes illustratives construites à partir de ces durées, pas des
   données spectroscopiques brutes. L'axe horizontal est non linéaire pour
   rendre visibles les premières femtosecondes. Aucun rendement de la
   photosynthèse n'est publié (point A-019 non vérifié).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-coherence]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-coherence-moteur]');
  var legende = cadre.querySelector('[data-coherence-legende]');
  var curseur = cadre.querySelector('[data-coherence-temps]');
  var sortie = cadre.querySelector('[data-coherence-sortie]');
  var selecteur = cadre.querySelector('[data-coherence-temperature]');
  var boutonZero = cadre.querySelector('[data-coherence-zero]');

  var TMAX = 1500;     // femtosecondes
  var EXPOSANT = 2.5;  // échelle horizontale non linéaire
  var moteur = null;
  var hote = null;

  function fr(n) {
    var s = String(Math.round(n)).replace('-', '−');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }

  function temps() {
    return Math.max(0, Math.min(TMAX,
      Math.round(parseFloat(curseur ? curseur.value : '0') || 0)));
  }
  function tau() { return (selecteur && selecteur.value === '77') ? 240 : 60; }
  function marque() { return Math.pow(temps() / TMAX, 1 / EXPOSANT); }
  function tempsDepuisX(x) { return TMAX * Math.pow(x, EXPOSANT); }

  function majLegende() {
    var t = temps(), seuil = tau();
    if (sortie) {
      sortie.textContent = fr(t) + ' femtoseconde' + (t > 1 ? 's' : '');
    }
    if (!legende) { return; }
    var debut = '<strong>Temps après l’absorption : ' + fr(t) +
      ' femtosecondes.</strong> ';
    var milieu;
    if (t < seuil) {
      milieu = 'La composante électronique est encore présente, mais elle ' +
        's’éteint en environ ' + fr(seuil) + ' femtosecondes' +
        (seuil === 240 ? ' à 77 kelvins (Thyrhaug et ses collègues, 2018, ' +
          'source S027, fait F-072).' : ' à température ambiante (réanalyse ' +
          'de 2017, source S025, fait F-071, DÉBATTU).');
    } else {
      milieu = 'La cohérence électronique a disparu : la décohérence se produit ' +
        'en environ ' + fr(seuil) + ' femtosecondes' +
        (seuil === 240 ? ' même à 77 kelvins (source S027, fait F-072).'
          : ' à température ambiante (source S025, fait F-071, DÉBATTU).') +
        ' Les oscillations qui persistent jusqu’à ' + fr(1500) + ' femtosecondes sont ' +
        'd’origine vibrationnelle (synthèse de 2020, source S026, fait F-073). ' +
        'L’interprétation antérieure y voyait des cohérences électroniques ' +
        '(fait F-152).';
    }
    var suite = ' Le complexe FMO, ou complexe de Fenna, Matthews et Olson, est ' +
      'une antenne collectrice de lumière chez certaines bactéries ' +
      'photosynthétiques.';
    if (moteur && moteur.nom === 'Image JPG statique') {
      suite += ' Repli image : visualisation JPG, sans courbes calculées.';
    }
    legende.innerHTML = debut + milieu + suite;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, marque: f32, tau: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let t = 1500.0 * pow(uv.x, 2.5);',
    '  let envE = exp(-t / u.tau);',
    '  let envV = exp(-t / 950.0);',
    '  let yE = 0.32 + 0.13 * envE * sin(t * 0.075);',
    '  let yV = 0.68 + 0.11 * envV * sin(t * 0.052 + 1.0);',
    '  let eE = exp(-abs(uv.y - yE) * 230.0);',
    '  let eV = exp(-abs(uv.y - yV) * 230.0);',
    '  let repere = exp(-abs(uv.x - u.marque) * 250.0);',
    '  var col = vec3<f32>(0.35, 0.80, 1.0) * eE * envE * 0.95;',
    '  col += vec3<f32>(1.0, 0.76, 0.36) * eV * 0.88;',
    '  col += vec3<f32>(0.90, 0.95, 1.0) * repere * 0.20;',
    '  let alpha = clamp(eE * envE * 0.82 + eV * 0.82 + repere * 0.16, 0.0, 0.95);',
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
          new Float32Array([c.width, c.height, marque(), tau()]));
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
    'uniform vec2 u_res; uniform float u_marque; uniform float u_tau; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float t = 1500.0 * pow(uv.x, 2.5);',
    '  float envE = exp(-t / u_tau);',
    '  float envV = exp(-t / 950.0);',
    '  float yE = 0.32 + 0.13 * envE * sin(t * 0.075);',
    '  float yV = 0.68 + 0.11 * envV * sin(t * 0.052 + 1.0);',
    '  float eE = exp(-abs(uv.y - yE) * 230.0);',
    '  float eV = exp(-abs(uv.y - yV) * 230.0);',
    '  float repere = exp(-abs(uv.x - u_marque) * 250.0);',
    '  vec3 col = vec3(0.35, 0.80, 1.0) * eE * envE * 0.95;',
    '  col += vec3(1.0, 0.76, 0.36) * eV * 0.88;',
    '  col += vec3(0.90, 0.95, 1.0) * repere * 0.20;',
    '  float alpha = clamp(eE * envE * 0.82 + eV * 0.82 + repere * 0.16, 0.0, 0.95);',
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
    var uMarque = gl.getUniformLocation(prog, 'u_marque');
    var uTau = gl.getUniformLocation(prog, 'u_tau');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uMarque, marque());
        gl.uniform1f(uTau, tau());
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
        var W = c.width, H = c.height, seuil = tau(), pas = 320;
        ctx.clearRect(0, 0, W, H);
        var courbes = [
          { couleur: 'rgba(90,205,255,0.85)', base: 0.32, amp: 0.13,
            env: function (t) { return Math.exp(-t / seuil); }, freq: 0.075, dec: 0 },
          { couleur: 'rgba(255,195,90,0.88)', base: 0.68, amp: 0.11,
            env: function (t) { return Math.exp(-t / 950); }, freq: 0.052, dec: 1.0 }
        ];
        for (var k = 0; k < courbes.length; k++) {
          var o = courbes[k];
          ctx.strokeStyle = o.couleur;
          ctx.lineWidth = Math.max(2, W * 0.0022);
          ctx.beginPath();
          for (var i = 0; i <= pas; i++) {
            var x = (i / pas) * W;
            var t = tempsDepuisX(i / pas);
            var y = H * (o.base + o.amp * o.env(t) * Math.sin(t * o.freq + o.dec));
            if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
          }
          ctx.stroke();
        }
        var mx = marque() * W;
        ctx.strokeStyle = 'rgba(235,245,255,0.35)';
        ctx.lineWidth = Math.max(1, W * 0.0014);
        ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, H); ctx.stroke();
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
    cadre.setAttribute('data-temperature', tau() === 240 ? '77' : '293');
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (selecteur) { selecteur.addEventListener('change', rafraichir); }
  if (boutonZero) {
    boutonZero.addEventListener('click', function () {
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
