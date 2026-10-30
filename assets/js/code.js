/* ==========================================================================
   CREATIO — Atelier de densité d'information (salle 10, E09)
   Le visiteur choisit la taille d'une archive ; le module convertit cette
   taille en masse d'ADN d'après la densité mesurée de 215 pétaoctets par
   gramme, et densifie les perles lumineuses des deux brins. Quatre replis :
   WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : 215 pétaoctets par gramme et environ 1,6 bit par nucléotide
   viennent de Erlich et Zielinski 2017 (source S018 ; faits F-061, F-062).
   Il s'agit d'un codage numérique artificiel dans de l'ADN synthétique, pas
   de la densité du génome naturel. Les masses affichées sont des conversions
   de cette valeur, pas des mesures nouvelles. Le coût reste DÉBATTU (F-064)
   et la métaphore du code est une RÉFLEXION (F-065).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-code]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-code-moteur]');
  var legende = cadre.querySelector('[data-code-legende]');
  var curseur = cadre.querySelector('[data-code-taille]');
  var sortie = cadre.querySelector('[data-code-sortie]');
  var boutonRef = cadre.querySelector('[data-code-reference]');

  var DENSITE_PO_G = 215;       // pétaoctets par gramme (mesure S018)
  var moteur = null;
  var hote = null;
  var phase = 0;
  var derniere = 0;
  var anime = true;
  if (window.matchMedia) {
    anime = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fr(n, d) {
    var s = n.toFixed(d === undefined ? 2 : d).replace('.', ',').replace('-', '−');
    var morceaux = s.split(',');
    morceaux[0] = morceaux[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return morceaux.join(',');
  }

  function tailleMo() {
    var t = Math.max(0, Math.min(1,
      (parseFloat(curseur ? curseur.value : '110') || 0) / 1000));
    return Math.pow(10, 3 * t);                 // 1 → 1 000 Mo
  }
  function densite() {
    var t = Math.max(0, Math.min(1,
      (parseFloat(curseur ? curseur.value : '110') || 0) / 1000));
    return t;
  }
  function massePg(mo) { return mo * 1e6 / (DENSITE_PO_G * 1e15) * 1e12; }

  function masseTexte(pg) {
    if (pg < 1000) { return fr(pg, 2) + ' picogrammes'; }
    if (pg < 1e6) { return fr(pg / 1000, 2) + ' nanogrammes'; }
    return fr(pg / 1e6, 2) + ' microgrammes';
  }

  function majLegende() {
    var mo = tailleMo(), pg = massePg(mo);
    if (sortie) { sortie.textContent = 'Archive : ' + fr(mo, 2) + ' mégaoctets'; }
    if (!legende) { return; }
    var special = (Math.abs(mo - 2.14) < 0.03)
      ? ' C’est exactement l’archive de l’expérience de 2017 : un système ' +
        'd’exploitation et un film, relus sans erreur (fait F-063).'
      : '';
    legende.innerHTML = '<strong>Archive : ' + fr(mo, 2) + ' mégaoctets.</strong> ' +
      'Masse d’ADN correspondante : ' + masseTexte(pg) + ', obtenue par conversion ' +
      'de la densité mesurée de 215 pétaoctets par gramme (source S018, fait F-061). ' +
      'Ce chiffre est un calcul de proportion, pas une mesure nouvelle. Le codage ' +
      'atteint environ 1,6 bit par nucléotide, soit 85 % de la limite théorique de ' +
      '1,8 bit (fait F-062).' + special;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, densite: f32, phase: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let xx = uv.x * 12.0 + u.phase;',
    '  let y1 = 0.5 + 0.22 * sin(xx);',
    '  let y2 = 0.5 - 0.22 * sin(xx);',
    '  let e1 = exp(-abs(uv.y - y1) * 175.0);',
    '  let e2 = exp(-abs(uv.y - y2) * 175.0);',
    '  let bande = e1 + e2;',
    '  let freq = 40.0 + 170.0 * u.densite;',
    '  let perles = pow(0.5 + 0.5 * sin(uv.x * freq + u.phase * 4.0), 14.0);',
    '  let pouss = perles * bande * u.densite;',
    '  var col = vec3<f32>(0.35, 0.85, 0.95) * e1 * 0.75;',
    '  col += vec3<f32>(1.0, 0.75, 0.38) * e2 * 0.75;',
    '  col += vec3<f32>(1.0, 0.95, 0.72) * pouss * 1.3;',
    '  let alpha = clamp(bande * 0.62 + pouss * 0.75, 0.0, 0.92);',
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
          new Float32Array([c.width, c.height, densite(), phase]));
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
    'uniform vec2 u_res; uniform float u_densite; uniform float u_phase; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float xx = uv.x * 12.0 + u_phase;',
    '  float y1 = 0.5 + 0.22 * sin(xx);',
    '  float y2 = 0.5 - 0.22 * sin(xx);',
    '  float e1 = exp(-abs(uv.y - y1) * 175.0);',
    '  float e2 = exp(-abs(uv.y - y2) * 175.0);',
    '  float bande = e1 + e2;',
    '  float freq = 40.0 + 170.0 * u_densite;',
    '  float perles = pow(0.5 + 0.5 * sin(uv.x * freq + u_phase * 4.0), 14.0);',
    '  float pouss = perles * bande * u_densite;',
    '  vec3 col = vec3(0.35, 0.85, 0.95) * e1 * 0.75;',
    '  col += vec3(1.0, 0.75, 0.38) * e2 * 0.75;',
    '  col += vec3(1.0, 0.95, 0.72) * pouss * 1.3;',
    '  float alpha = clamp(bande * 0.62 + pouss * 0.75, 0.0, 0.92);',
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
    var uDens = gl.getUniformLocation(prog, 'u_densite');
    var uPhase = gl.getUniformLocation(prog, 'u_phase');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uDens, densite());
        gl.uniform1f(uPhase, phase);
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
        var W = c.width, H = c.height, d = densite(), pas = 180;
        ctx.clearRect(0, 0, W, H);
        // Deux brins sinusoïdaux.
        var couleurs = ['rgba(90,215,240,0.68)', 'rgba(255,192,95,0.68)'];
        for (var b = 0; b < 2; b++) {
          ctx.strokeStyle = couleurs[b];
          ctx.lineWidth = Math.max(2, W * 0.0022);
          ctx.beginPath();
          for (var i = 0; i <= pas; i++) {
            var x = (i / pas) * W;
            var xx = (i / pas) * 12 + phase;
            var y = H * (0.5 + (b === 0 ? 0.22 : -0.22) * Math.sin(xx));
            if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
          }
          ctx.stroke();
        }
        // Perles d'information : leur nombre suit la taille de l'archive.
        var nombre = Math.round(40 + 170 * d);
        for (var k = 0; k < nombre; k++) {
          var u = k / nombre;
          var px = u * W;
          var xx2 = u * 12 + phase;
          var py = H * (0.5 + (k % 2 === 0 ? 0.22 : -0.22) * Math.sin(xx2));
          ctx.fillStyle = 'rgba(255,245,205,' + (0.22 + 0.62 * d).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.2, W * 0.0016), 0, 6.284);
          ctx.fill();
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
    if (moteur) { moteur.rendre(); }
  }

  function boucle(t) {
    if (!moteur) { return; }
    var dt = derniere ? Math.min(0.05, (t - derniere) / 1000) : 0;
    derniere = t;
    phase = (phase + 0.22 * dt) % 6.2832;
    moteur.rendre();
    window.requestAnimationFrame(boucle);
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (boutonRef) {
    boutonRef.addEventListener('click', function () {
      if (curseur) { curseur.value = '110'; }
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
    cadre.setAttribute('data-animation', anime ? 'active' : 'reduite');
    if (statut) {
      statut.textContent = 'Rendu actif : ' + m.nom +
        (anime ? '.' : ' Mouvement réduit : brins immobiles.');
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
    if (anime && m.nom !== 'Image JPG statique') {
      window.requestAnimationFrame(boucle);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
