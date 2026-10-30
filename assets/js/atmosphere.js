/* ==========================================================================
   CREATIO — Curseur d'atmosphère (salle 06, E07)
   Le visiteur fait varier une pression et un repère de gaz à effet de serre,
   et observe une coupe colorée, une courbe et la lumière reçue au sol.
   Quatre replis : calcul graphique (WGSL), interface graphique (GLSL ES),
   dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : toutes les courbes de cet atelier sont des fonctions
   mathématiques simples choisies pour l'illustration. Elles ne calculent ni
   le transfert radiatif, ni l'effet de serre réel, ni le climat. Les seules
   valeurs mesurées publiées ici sont 1 014 mb et 288 K (15 °C), source S035,
   et la composition de l'air sec, source S034.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-atmosphere]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-atmosphere-image]');
  var statut = cadre.querySelector('[data-atmosphere-moteur]');
  var legende = cadre.querySelector('[data-atmosphere-legende]');
  var pression = cadre.querySelector('[data-atmosphere-pression]');
  var serre = cadre.querySelector('[data-atmosphere-serre]');
  var sortiePression = cadre.querySelector('[data-atmosphere-sortie-pression]');
  var sortieSerre = cadre.querySelector('[data-atmosphere-sortie-serre]');
  var boutonReset = cadre.querySelector('[data-atmosphere-reset]');

  var moteur = null;
  var hote = null;

  function valeurs() {
    var p = Math.max(0, Math.min(1, (parseFloat(pression ? pression.value : '500') || 0) / 1000));
    var s = Math.max(0, Math.min(1, (parseFloat(serre ? serre.value : '300') || 0) / 1000));
    var mb = Math.round(1014 * (0.3 + 1.4 * p));
    var lum = Math.round(100 * Math.exp(-0.9 * (p - 0.5) - 0.35 * (s - 0.3)));
    lum = Math.max(5, Math.min(100, lum));
    return { p: p, s: s, mb: mb, lum: lum, ecart: (s - 0.3) * 30 + (p - 0.5) * 8 };
  }

  function fr(n) { return n.toFixed(1).replace('.', ','); }

  // Regroupement des milliers avec une espace insécable, comme dans le HTML.
  function milliers(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  function majLegende() {
    var v = valeurs();
    if (sortiePression) { sortiePression.textContent = 'Pression : ' + milliers(v.mb) + ' mb'; }
    if (sortieSerre) {
      sortieSerre.textContent = 'Repère de gaz : ' + Math.round(v.s * 100) + ' sur 100';
    }
    if (!legende) { return; }
    if (moteur && moteur.nom === 'Image JPG statique') {
      legende.textContent = 'Repli image : une coupe illustrative de l’atmosphère en JPG. ' +
        'Les deux curseurs restent lisibles au clavier.';
      return;
    }
    var temperature;
    if (Math.abs(v.ecart) < 0.05) {
      temperature = 'température à la valeur de référence de 15 °C';
    } else if (v.ecart > 0) {
      temperature = 'augmentation de ' + fr(v.ecart) + ' °C (repère illustratif)';
    } else {
      temperature = 'diminution de ' + fr(-v.ecart) + ' °C (repère illustratif)';
    }
    legende.innerHTML = '<strong>Pression au sol : ' + milliers(v.mb) + ' mb.</strong> ' +
      'Lumière transmise au sol : ' + v.lum + ' %. ' +
      'Température : ' + temperature + '. ' +
      'Références mesurées : 1 014 mb et 288 K, soit environ 15 °C ' +
      '(source S035, faits F-039 et F-138).';
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, pression: f32, serre: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let x = f.x / u.resolution.x;',
    '  let h = 1.0 - f.y / u.resolution.y;',
    '  let ep = 0.40 + 0.42 * u.pression;',
    '  let q = clamp(h / ep, 0.0, 1.0);',
    '  let bandes = 0.5 + 0.5 * sin(q * 26.0 + u.pression * 5.0);',
    '  var col = mix(vec3<f32>(0.96, 0.64, 0.30), vec3<f32>(0.06, 0.12, 0.34), q);',
    '  col += vec3<f32>(0.10, 0.14, 0.22) * bandes * (1.0 - q);',
    '  let courbeX = 0.20 + 0.10 * sin(h * 9.0 + u.serre * 3.0) + 0.14 * u.serre;',
    '  let courbe = exp(-abs(x - courbeX) * 170.0);',
    '  col += vec3<f32>(1.0, 0.86, 0.52) * courbe * 0.9;',
    '  let sol = exp(-h * 32.0) * (1.0 - 0.45 * u.pression - 0.25 * u.serre);',
    '  col += vec3<f32>(1.0, 0.92, 0.75) * sol * 0.6;',
    '  let alpha = clamp(0.22 + 0.55 * exp(-h * 3.0) + courbe * 0.6 + sol * 0.3, 0.0, 0.85);',
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
        var v = valeurs();
        device.queue.writeBuffer(uniformes, 0,
          new Float32Array([c.width, c.height, v.p, v.s]));
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
    'uniform vec2 u_res; uniform float u_pression; uniform float u_serre; out vec4 outColor;',
    'void main() {',
    '  float x = gl_FragCoord.x / u_res.x;',
    '  float h = gl_FragCoord.y / u_res.y;',
    '  float ep = 0.40 + 0.42 * u_pression;',
    '  float q = clamp(h / ep, 0.0, 1.0);',
    '  float bandes = 0.5 + 0.5 * sin(q * 26.0 + u_pression * 5.0);',
    '  vec3 col = mix(vec3(0.96, 0.64, 0.30), vec3(0.06, 0.12, 0.34), q);',
    '  col += vec3(0.10, 0.14, 0.22) * bandes * (1.0 - q);',
    '  float courbeX = 0.20 + 0.10 * sin(h * 9.0 + u_serre * 3.0) + 0.14 * u_serre;',
    '  float courbe = exp(-abs(x - courbeX) * 170.0);',
    '  col += vec3(1.0, 0.86, 0.52) * courbe * 0.9;',
    '  float sol = exp(-h * 32.0) * (1.0 - 0.45 * u_pression - 0.25 * u_serre);',
    '  col += vec3(1.0, 0.92, 0.75) * sol * 0.6;',
    '  float alpha = clamp(0.22 + 0.55 * exp(-h * 3.0) + courbe * 0.6 + sol * 0.3, 0.0, 0.85);',
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
    var uPression = gl.getUniformLocation(prog, 'u_pression');
    var uSerre = gl.getUniformLocation(prog, 'u_serre');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        var v = valeurs();
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uPression, v.p);
        gl.uniform1f(uSerre, v.s);
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
        var W = c.width, H = c.height, v = valeurs();
        ctx.clearRect(0, 0, W, H);
        var ep = (0.40 + 0.42 * v.p) * H;
        var g = ctx.createLinearGradient(0, H, 0, H - ep);
        g.addColorStop(0, 'rgba(245,163,77,0.55)');
        g.addColorStop(0.35, 'rgba(150,170,205,0.40)');
        g.addColorStop(0.75, 'rgba(40,80,160,0.32)');
        g.addColorStop(1, 'rgba(15,30,87,0.18)');
        ctx.fillStyle = g; ctx.fillRect(0, H - ep, W, ep);
        // Bandes illustratives.
        for (var i = 0; i < 14; i++) {
          var y = H - ep + (i / 14) * ep;
          ctx.fillStyle = 'rgba(230,225,255,' + (0.035 + 0.025 * Math.sin(i + v.p * 5)) + ')';
          ctx.fillRect(0, y, W, ep / 14);
        }
        // Lumière reçue au sol.
        var sol = ctx.createLinearGradient(0, H, 0, H - H * 0.10);
        sol.addColorStop(0, 'rgba(255,236,197,' + (v.lum / 180).toFixed(3) + ')');
        sol.addColorStop(1, 'rgba(255,236,197,0)');
        ctx.fillStyle = sol; ctx.fillRect(0, H - H * 0.10, W, H * 0.10);
        // Courbe de température.
        ctx.strokeStyle = 'rgba(255,219,130,0.9)';
        ctx.lineWidth = Math.max(2, W * 0.0022);
        ctx.beginPath();
        for (var j = 0; j <= 100; j++) {
          var h = j / 100;
          var cx = (0.20 + 0.10 * Math.sin(h * 9 + v.s * 3) + 0.14 * v.s) * W;
          var cy = H - h * H;
          if (j === 0) { ctx.moveTo(cx, cy); } else { ctx.lineTo(cx, cy); }
        }
        ctx.stroke();
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

  if (pression) { pression.addEventListener('input', rafraichir); }
  if (serre) { serre.addEventListener('input', rafraichir); }
  if (boutonReset) {
    boutonReset.addEventListener('click', function () {
      if (pression) { pression.value = '500'; }
      if (serre) { serre.value = '300'; }
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
