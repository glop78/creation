/* ==========================================================================
   CREATIO — Atelier d'adhérence (salle 13, E11)
   Le visiteur fait varier le nombre de soies engagées : le tapis de spatules
   se densifie et la force résultante est calculée. Quatre replis : WGSL,
   GLSL ES, dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : 194 ± 25 micronewtons par soie isolée, ~500 000 soies par pied,
   spatules de 0,2 à 0,5 micromètre et ~100 newtons théoriques par pied
   viennent de Autumn et ses collègues (2000, source S020 ; faits F-075 à
   F-078, F-154, F-155). La force affichée est le produit de la mesure par le
   nombre de soies : ce n'est pas une mesure nouvelle. Le mécanisme reste
   DÉBATTU (F-079) et l'imitation n'implique pas l'intention (F-080).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-soies]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-soies-moteur]');
  var legende = cadre.querySelector('[data-soies-legende]');
  var curseur = cadre.querySelector('[data-soies-nombre]');
  var sortie = cadre.querySelector('[data-soies-sortie]');
  var boutonUne = cadre.querySelector('[data-soies-une]');
  var boutonPied = cadre.querySelector('[data-soies-pied]');

  var MAX_SOIES = 500000;
  var FORCE_SOIE = 194e-6;   // newtons, mesure Autumn 2000
  var moteur = null;
  var hote = null;

  function fr(n, d) {
    var s = n.toFixed(d === undefined ? 0 : d).replace('.', ',').replace('-', '−');
    var morceaux = s.split(',');
    morceaux[0] = morceaux[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return morceaux.join(',');
  }

  function progression() {
    return Math.max(0, Math.min(1,
      (parseFloat(curseur ? curseur.value : '0') || 0) / 1000));
  }
  function nombreSoies() {
    return Math.max(1, Math.round(Math.pow(10, progression() * Math.log10(MAX_SOIES))));
  }
  function forceTexte(n) {
    var f = FORCE_SOIE * n;
    if (f < 0.001) { return fr(f * 1e6, 1) + ' micronewtons'; }
    if (f < 1) { return fr(f * 1e3, 2) + ' millinewtons'; }
    return fr(f, 2) + ' newtons';
  }

  function majLegende() {
    var n = nombreSoies();
    if (sortie) {
      sortie.textContent = fr(n) + ' soie' + (n > 1 ? 's' : '') +
        ' engagée' + (n > 1 ? 's' : '');
    }
    if (!legende) { return; }
    var texte = '<strong>Soies engagées : ' + fr(n) + '.</strong> ' +
      'Force résultante : ' + forceTexte(n) + ', calculée comme ' +
      '194 micronewtons multipliés par le nombre de soies. Une soie isolée a ' +
      'été mesurée à 194 ± 25 micronewtons (Autumn et ses collègues, 2000, ' +
      'source S020, fait F-075).';
    if (n >= 400000) {
      texte += ' Vous approchez l’extrapolation théorique d’environ 100 newtons ' +
        'par pied (fait F-078), soit une pression de l’ordre de dix atmosphères ' +
        '(fait F-155). Cette valeur n’a jamais été observée chez l’animal ' +
        'complet : c’est un calcul, pas une mesure.';
    }
    if (moteur && moteur.nom === 'Image JPG statique') {
      texte += ' Repli image : visualisation JPG, sans tapis de spatules calculé.';
    }
    legende.innerHTML = texte;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, progression: f32, reserve: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let cell = vec2<f32>(18.0 + 44.0 * u.progression, 10.0 + 24.0 * u.progression);',
    '  let g = uv * cell;',
    '  let id = floor(g);',
    '  let local = fract(g) - vec2<f32>(0.5, 0.5);',
    '  let hach = fract(sin(dot(id, vec2<f32>(12.9898, 78.233))) * 43758.5453);',
    '  let rayon = 0.06 + 0.14 * hach;',
    '  let d = length(local);',
    '  let perle = 1.0 - smoothstep(rayon * 0.5, rayon, d);',
    '  let nature = mix(vec3<f32>(1.0, 0.76, 0.36), vec3<f32>(0.40, 0.86, 0.96),',
    '                   smoothstep(0.32, 0.68, uv.x));',
    '  let lueur = exp(-abs(uv.y - 0.88) * 9.0) * u.progression;',
    '  var col = nature * perle * 0.88;',
    '  col += vec3<f32>(1.0, 0.90, 0.62) * lueur * 0.28;',
    '  let alpha = clamp(perle * 0.78 + lueur * 0.22, 0.0, 0.93);',
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
          new Float32Array([c.width, c.height, progression(), 0]));
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
    'uniform vec2 u_res; uniform float u_prog; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  vec2 cell = vec2(18.0 + 44.0 * u_prog, 10.0 + 24.0 * u_prog);',
    '  vec2 g = uv * cell;',
    '  vec2 id = floor(g);',
    '  vec2 local = fract(g) - vec2(0.5);',
    '  float hach = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);',
    '  float rayon = 0.06 + 0.14 * hach;',
    '  float d = length(local);',
    '  float perle = 1.0 - smoothstep(rayon * 0.5, rayon, d);',
    '  vec3 nature = mix(vec3(1.0, 0.76, 0.36), vec3(0.40, 0.86, 0.96),',
    '                    smoothstep(0.32, 0.68, uv.x));',
    '  float lueur = exp(-abs(uv.y - 0.88) * 9.0) * u_prog;',
    '  vec3 col = nature * perle * 0.88;',
    '  col += vec3(1.0, 0.90, 0.62) * lueur * 0.28;',
    '  float alpha = clamp(perle * 0.78 + lueur * 0.22, 0.0, 0.93);',
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
    var uProg = gl.getUniformLocation(prog, 'u_prog');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uProg, progression());
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
        var W = c.width, H = c.height, p = progression();
        ctx.clearRect(0, 0, W, H);
        var cx = Math.ceil(18 + 44 * p), cy = Math.ceil(10 + 24 * p);
        for (var i = 0; i < cx; i++) {
          for (var j = 0; j < cy; j++) {
            var h = hash2(i, j);
            var rayon = (0.06 + 0.14 * h) * Math.min(W / cx, H / cy);
            var x = (i + 0.5) * W / cx, y = (j + 0.5) * H / cy;
            var teinte = (i / cx < 0.5)
              ? 'rgba(255,195,90,0.82)' : 'rgba(105,220,245,0.82)';
            ctx.fillStyle = teinte;
            ctx.beginPath(); ctx.arc(x, y, Math.max(1, rayon), 0, 6.284); ctx.fill();
          }
        }
        var halo = ctx.createLinearGradient(0, 0, 0, H * 0.3);
        halo.addColorStop(0, 'rgba(255,235,175,' + (0.30 * p).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(255,235,175,0)');
        ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H * 0.3);
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

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (boutonUne) {
    boutonUne.addEventListener('click', function () {
      if (curseur) { curseur.value = '0'; }
      rafraichir();
    });
  }
  if (boutonPied) {
    boutonPied.addEventListener('click', function () {
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
