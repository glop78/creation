/* ==========================================================================
   CREATIO — Nuée interactive (salle 16, E12)
   Le visiteur ajuste trois règles locales (distance, alignement, cohésion) et
   voit la forme de l'essaim se réorganiser. Quatre replis : WGSL, GLSL ES,
   dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : cette simulation est illustrative. Les particules obéissent à
   trois règles simplifiées ; ce ne sont ni des oiseaux réels ni un modèle
   validé de comportement animal. Les faits publiés sont les trajectoires
   observées (F-092, F-093, source S021), l'interprétation DÉBATTUE du trajet
   en S (F-094), la carte de 139 255 neurones et 54,5 millions de synapses de
   la drosophile (F-095, source S031) et la RÉFLEXION sur la carte et le
   territoire (F-096).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-nuee]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-nuee-moteur]');
  var legende = cadre.querySelector('[data-nuee-legende]');
  var sortie = cadre.querySelector('[data-nuee-sortie]');
  var boutonDefaut = cadre.querySelector('[data-nuee-defaut]');

  var REGLES = [
    { nom: 'distance', selecteur: '[data-nuee-distance]', defaut: 60 },
    { nom: 'alignement', selecteur: '[data-nuee-alignement]', defaut: 40 },
    { nom: 'cohésion', selecteur: '[data-nuee-cohesion]', defaut: 70 },
  ];
  var champs = {};
  var moteur = null;
  var hote = null;

  function fr(n) { return String(Math.round(n)).replace('-', '−'); }

  function valeur(nom) {
    var el = champs[nom];
    return Math.max(0, Math.min(100, parseFloat(el ? el.value : '0') || 0)) / 100;
  }
  function entier(nom) {
    var el = champs[nom];
    return Math.max(0, Math.min(100, Math.round(parseFloat(el ? el.value : '0') || 0)));
  }

  function majLegende() {
    if (sortie) {
      sortie.textContent = 'Distance ' + entier('distance') + ' % · Alignement ' +
        entier('alignement') + ' % · Cohésion ' + entier('cohésion') + ' %';
    }
    if (!legende) { return; }
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : visualisation JPG, sans particules calculées.' : '';
    legende.innerHTML = '<strong>Distance : ' + entier('distance') +
      ' % · Alignement : ' + entier('alignement') + ' % · Cohésion : ' +
      entier('cohésion') + ' %.</strong> Les particules se réorganisent selon ' +
      'ces trois règles locales. Cette simulation est illustrative : ce ne ' +
      'sont pas des oiseaux réels, ni un modèle validé de comportement ' +
      'animal. Nous ne publions aucune mesure issue de cette simulation.' + repli;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { a: vec4<f32>, b: vec4<f32>, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.a.xy;',
    '  let dist = u.a.z; let align = u.a.w; let coh = u.b.x;',
    '  let cell = vec2<f32>(24.0, 14.0);',
    '  let g = uv * cell;',
    '  let id = floor(g);',
    '  let local = fract(g) - vec2<f32>(0.5, 0.5);',
    '  let h1 = fract(sin(dot(id, vec2<f32>(12.9898, 78.233))) * 43758.5453);',
    '  let h2 = fract(sin(dot(id, vec2<f32>(39.3468, 11.135))) * 24634.6345);',
    '  let centre = vec2<f32>(0.5, 0.5);',
    '  let dir = vec2<f32>(cos(align * 6.2831853), sin(align * 6.2831853));',
    '  let base = vec2<f32>(h1 - 0.5, h2 - 0.5);',
    '  let dec = base * (0.25 + 1.10 * dist) + dir * align * 0.22;',
    '  let pos = dec - (uv - centre) * coh * 0.90;',
    '  let d = length(local - pos * 0.55);',
    '  let present = step(h2, 0.42 + 0.45 * coh);',
    '  let point = exp(-d * d * 55.0) * present;',
    '  let halo = exp(-length(uv - centre) * 3.0) * coh * 0.18;',
    '  var col = vec3<f32>(1.0, 0.78, 0.42) * point * 0.95;',
    '  col += vec3<f32>(0.35, 0.75, 0.95) * halo;',
    '  let alpha = clamp(point * 0.85 + halo, 0.0, 0.93);',
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
      size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function () {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, valeur('distance'), valeur('alignement'),
          valeur('cohésion'), 0, 0, 0
        ]));
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
    'uniform vec4 u_a; uniform vec4 u_b; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_a.xy;',
    '  float dist = u_a.z; float align = u_a.w; float coh = u_b.x;',
    '  vec2 cell = vec2(24.0, 14.0);',
    '  vec2 g = uv * cell;',
    '  vec2 id = floor(g);',
    '  vec2 local = fract(g) - vec2(0.5);',
    '  float h1 = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);',
    '  float h2 = fract(sin(dot(id, vec2(39.3468, 11.135))) * 24634.6345);',
    '  vec2 centre = vec2(0.5);',
    '  vec2 dir = vec2(cos(align * 6.2831853), sin(align * 6.2831853));',
    '  vec2 base = vec2(h1 - 0.5, h2 - 0.5);',
    '  vec2 dec = base * (0.25 + 1.10 * dist) + dir * align * 0.22;',
    '  vec2 pos = dec - (uv - centre) * coh * 0.90;',
    '  float d = length(local - pos * 0.55);',
    '  float present = step(h2, 0.42 + 0.45 * coh);',
    '  float point = exp(-d * d * 55.0) * present;',
    '  float halo = exp(-length(uv - centre) * 3.0) * coh * 0.18;',
    '  vec3 col = vec3(1.0, 0.78, 0.42) * point * 0.95;',
    '  col += vec3(0.35, 0.75, 0.95) * halo;',
    '  float alpha = clamp(point * 0.85 + halo, 0.0, 0.93);',
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
    var uA = gl.getUniformLocation(prog, 'u_a');
    var uB = gl.getUniformLocation(prog, 'u_b');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform4f(uA, c.width, c.height, valeur('distance'), valeur('alignement'));
        gl.uniform4f(uB, valeur('cohésion'), 0, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function hasher(i, j, s) {
    var x = Math.sin(i * (12.9898 + s) + j * (78.233 - s)) * 43758.5453;
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
        var W = c.width, H = c.height;
        var dist = valeur('distance'), align = valeur('alignement'), coh = valeur('cohésion');
        ctx.clearRect(0, 0, W, H);
        var halo = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.5);
        halo.addColorStop(0, 'rgba(90,190,240,' + (0.16 * coh).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(90,190,240,0)');
        ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
        var cx = 24, cy = 14, cw = W / cx, ch = H / cy;
        for (var i = 0; i < cx; i++) {
          for (var j = 0; j < cy; j++) {
            var h1 = hasher(i, j, 0), h2 = hasher(i, j, 5);
            if (h2 > 0.42 + 0.45 * coh) { continue; }
            var dirx = Math.cos(align * 6.2831853), diry = Math.sin(align * 6.2831853);
            var decx = (h1 - 0.5) * (0.25 + 1.10 * dist) + dirx * align * 0.22;
            var decy = (h2 - 0.5) * (0.25 + 1.10 * dist) + diry * align * 0.22;
            var ux = (i + 0.5) / cx - 0.5, uy = (j + 0.5) / cy - 0.5;
            var px = (i + 0.5 + (decx - ux * coh * 0.90) * 0.55) * cw;
            var py = (j + 0.5 + (decy - uy * coh * 0.90) * 0.55) * ch;
            ctx.fillStyle = 'rgba(255,200,110,0.85)';
            ctx.beginPath(); ctx.arc(px, py, Math.max(1.4, W * 0.0025), 0, 6.284); ctx.fill();
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
    cadre.setAttribute('data-regles',
      entier('distance') + '-' + entier('alignement') + '-' + entier('cohésion'));
    if (moteur) { moteur.rendre(); }
  }

  REGLES.forEach(function (r) {
    var el = cadre.querySelector(r.selecteur);
    champs[r.nom] = el;
    if (el) { el.addEventListener('input', rafraichir); }
  });

  if (boutonDefaut) {
    boutonDefaut.addEventListener('click', function () {
      REGLES.forEach(function (r) {
        if (champs[r.nom]) { champs[r.nom].value = String(r.defaut); }
      });
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
