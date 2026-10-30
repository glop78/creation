/* ==========================================================================
   CREATIO — L'échelle des preuves (salle 21, E16)
   Le visiteur choisit un écart Z, exprimé en nombre d'écarts types (σ). Le
   calcul affiche la probabilité qu'une simple fluctuation produise un écart
   au moins aussi grand, et la catégorie usuelle : fluctuation, indice ou
   découverte. Quatre replis : WGSL, GLSL ES, dessin 2D, image JPG. Clavier
   inclus ; aucune animation automatique.

   HONNÊTETÉ :
   - CONVENTION : seuil de découverte Z = 5, p = 2,87 × 10⁻⁷ (F-198, S060) ;
     on parle d'indice vers 3 σ (F-199).
   - CALCUL EXACT : p = ½ erfc(Z / √2), loi normale unilatérale ; erfc est
     approchée par la formule de Tchebychev de Numerical Recipes (erreur
     relative inférieure à 1,2 × 10⁻⁷ pour tout Z).
   - EXEMPLES RÉELS : DESI 2025, 3,1 σ (F-005, DÉBATTU) ; BICEP2 2014, 7,0 σ,
     signal ensuite attribué à la poussière galactique (F-202).
   - LIMITE : le nombre de σ ne mesure ni les erreurs systématiques ni la
     justesse de l'interprétation (F-198, F-201, F-202).
   - La courbe en cloche est dessinée dans le ciel de la photographie, à
     gauche de la coupole ; la queue au-delà de Z est soulignée par un mince
     trait lumineux, car sa hauteur réelle devient vite invisible.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-preuves]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-preuves-moteur]');
  var legende = cadre.querySelector('[data-preuves-legende]');
  var curseur = cadre.querySelector('[data-preuves-z]');
  var sortie = cadre.querySelector('[data-preuves-sortie]');
  var presets = Array.prototype.slice.call(cadre.querySelectorAll('[data-preuves-preset]'));
  var moteur = null;
  var hote = null;
  var contexte = '';

  /* Numerical Recipes, erfcc : erreur relative < 1,2e-7 partout. */
  function erfc(x) {
    var z = Math.abs(x);
    var t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 +
      t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
      t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function pValeur(z) { return 0.5 * erfc(z / Math.SQRT2); }

  var EXPOSANTS = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function groupe(entier) {
    return String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }
  function fr(n, dec) {
    var s = n.toFixed(dec || 0).split('.');
    s[0] = groupe(s[0]);
    return s.join(',');
  }
  function scientifique(p) {
    if (p >= 0.01) { return fr(p, 3); }
    var e = Math.floor(Math.log10(p));
    var m = p / Math.pow(10, e);
    if (m >= 9.995) { m = 1; e += 1; }
    var exp = String(e).split('').map(function (c) { return EXPOSANTS[c]; }).join('');
    return fr(m, 2) + '\u00A0×\u00A010' + exp;
  }
  function significatif(n, chiffres) {
    var e = Math.floor(Math.log10(n)) - chiffres + 1;
    return Math.round(n / Math.pow(10, e)) * Math.pow(10, e);
  }
  function surN(p) {
    var n = 1 / p;
    if (n < 10000) { return groupe(Math.round(n)); }
    if (n < 1e6) { return groupe(significatif(n, 3)); }
    if (n < 1e9) {
      var m = significatif(n, 2) / 1e6;
      return fr(m, m < 10 ? 1 : 0) + (m < 2 ? '\u00A0million' : '\u00A0millions');
    }
    var g = significatif(n, 2) / 1e9;
    return fr(g, g < 10 ? 1 : 0) + (g < 2 ? '\u00A0milliard' : '\u00A0milliards');
  }

  function lireZ() {
    var v = parseFloat(curseur ? curseur.value : '3');
    if (isNaN(v)) { v = 3; }
    return Math.round(Math.max(0, Math.min(7, v)) * 10) / 10;
  }

  function calcul() {
    var z = lireZ();
    var p = pValeur(z);
    var cat = z >= 5 ? 2 : (z >= 3 ? 1 : 0);
    return { z: z, p: p, cat: cat };
  }

  var CATEGORIES = [
    'Fluctuation possible : un tel écart reste assez fréquent par simple hasard.',
    'Indice : l’écart mérite attention, mais ne suffit pas pour annoncer une découverte (F-199).',
    'Seuil de découverte atteint selon la convention de la physique des particules (F-198).'
  ];

  function majLegende(k) {
    var zt = fr(k.z, 1) + '\u00A0σ';
    if (sortie) { sortie.textContent = 'Écart choisi : ' + zt; }
    if (curseur) { curseur.setAttribute('aria-valuetext', fr(k.z, 1) + ' écarts types'); }
    if (!legende) { return; }
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : photographie seule, sans courbe.' : '';
    legende.innerHTML = '<strong>À ' + zt + ' : probabilité d’environ ' + scientifique(k.p) +
      ', soit environ 1 chance sur ' + surN(k.p) + '.</strong> ' + CATEGORIES[k.cat] +
      (contexte ? ' ' + contexte : '') +
      ' Ce nombre mesure seulement le risque d’être trompé par le hasard : il ne dit rien des erreurs de mesure, ni de la justesse de l’interprétation.' +
      repli;
  }

  /* Géométrie commune (p normalisé par la hauteur, y vers le bas) :
     courbe dans le ciel, à gauche de la coupole de la photographie. */
  var ZMIN = -4, ZMAX = 7.5, XA = -0.84, XB = 0.10, YB = 0.06, HC = 0.36;
  var ECH = (XB - XA) / (ZMAX - ZMIN);
  function xDeZ(z) { return XA + (z - ZMIN) * ECH; }

  var CORPS = [
    'float zc = (p.x - (' + XA.toFixed(4) + ')) / ' + ECH.toFixed(5) + ' + (' + ZMIN.toFixed(1) + ');',
    'float g = exp(-0.5 * zc * zc);',
    'float yc = ' + YB.toFixed(3) + ' - ' + HC.toFixed(3) + ' * g;',
    'float dans = step(' + XA.toFixed(4) + ', p.x) * step(p.x, ' + XB.toFixed(4) + ');',
    'float bordx = smoothstep(' + XA.toFixed(4) + ', ' + (XA + 0.05).toFixed(4) + ', p.x) * smoothstep(' + XB.toFixed(4) + ', ' + (XB - 0.05).toFixed(4) + ', p.x);',
    'float trait = exp(-abs(p.y - yc) * 210.0) * 1.0 * bordx;',
    'float sous = step(yc, p.y) * step(p.y, ' + YB.toFixed(3) + ') * dans;',
    'float queue = step(Z, zc) * dans;',
    'float epais = max(' + YB.toFixed(3) + ' - yc, 0.007);',
    'float bande = step(' + YB.toFixed(3) + ' - epais, p.y) * step(p.y, ' + YB.toFixed(3) + ');',
    'float remplissage = (sous * (1.0 - queue) * 0.16 + queue * bande * 0.75) * bordx;',
    'vec2 m = vec2(' + XA.toFixed(4) + ' + (Z - (' + ZMIN.toFixed(1) + ')) * ' + ECH.toFixed(5) + ', ' + YB.toFixed(3) + ');',
    'float dd = length(p - m);',
    'float point = smoothstep(0.013, 0.007, dd) + exp(-dd * 60.0) * 0.5;',
    'vec3 c0 = vec3(0.55, 0.78, 1.0);',
    'vec3 c1 = mix(vec3(1.0, 0.72, 0.35), vec3(0.98, 0.88, 0.50), step(1.5, CAT));',
    'vec3 cq = mix(c0, c1, step(0.5, CAT));',
    'vec3 col = c0 * trait + mix(c0, cq, queue) * remplissage + cq * point;',
    'float alpha = clamp(trait + remplissage + point, 0.0, 0.92);'
  ];

  /* --- 1. WGSL ----------------------------------------------------------- */
  function versWGSL(lignes) {
    return lignes.map(function (l) {
      return '  ' + l.replace(/^float /, 'let ').replace(/^vec3 /, 'let ').replace(/^vec2 /, 'let ')
        .replace(/vec3\(/g, 'vec3<f32>(').replace(/vec2\(/g, 'vec2<f32>(')
        .replace(/\bZ\b/g, 'u.z').replace(/\bCAT\b/g, 'u.cat');
    }).join('\n');
  }
  var WGSL = [
    'struct U { resolution: vec2<f32>, z: f32, cat: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var q = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(q[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let p = (f.xy - 0.5 * u.resolution) / u.resolution.y;',
    versWGSL(CORPS),
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
    var groupeLiaison = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(uniformes, 0, new Float32Array([c.width, c.height, k.z, k.cat]));
        var enc = device.createCommandEncoder();
        var passe = enc.beginRenderPass({ colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }] });
        passe.setPipeline(pipeline); passe.setBindGroup(0, groupeLiaison); passe.draw(3); passe.end();
        device.queue.submit([enc.finish()]);
      },
      arreter: function () {}
    };
  }

  /* --- 2. GLSL ES -------------------------------------------------------- */
  var GVS = ['#version 300 es',
    'void main() {',
    '  vec2 q = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0);',
    '}'].join('\n');
  var GFS = ['#version 300 es', 'precision highp float;',
    'uniform vec2 u_res; uniform float Z; uniform float CAT;',
    'out vec4 outColor;',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  vec2 p = (f - 0.5 * u_res) / u_res.y;',
    CORPS.map(function (l) { return '  ' + l; }).join('\n'),
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
    var lRes = gl.getUniformLocation(prog, 'u_res');
    var lZ = gl.getUniformLocation(prog, 'Z');
    var lCat = gl.getUniformLocation(prog, 'CAT');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (k) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(lRes, c.width, c.height);
        gl.uniform1f(lZ, k.z);
        gl.uniform1f(lCat, k.cat);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    var COUL = ['140,199,255', '255,184,90', '250,224,128'];
    return {
      nom: 'Dessin en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height;
        function X(px) { return W / 2 + px * H; }
        function Y(py) { return H / 2 + py * H; }
        function yC(z) { return YB - HC * Math.exp(-0.5 * z * z); }
        ctx.clearRect(0, 0, W, H);
        var N = 160, i, z;
        ctx.fillStyle = 'rgba(140,199,255,0.16)';
        ctx.beginPath(); ctx.moveTo(X(XA), Y(YB));
        for (i = 0; i <= N; i++) { z = ZMIN + (ZMAX - ZMIN) * i / N; ctx.lineTo(X(xDeZ(z)), Y(yC(z))); }
        ctx.lineTo(X(XB), Y(YB)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(' + COUL[k.cat] + ',0.70)';
        ctx.beginPath(); ctx.moveTo(X(xDeZ(k.z)), Y(YB));
        for (i = 0; i <= N; i++) {
          z = k.z + (ZMAX - k.z) * i / N;
          ctx.lineTo(X(xDeZ(z)), Y(Math.min(yC(z), YB - 0.007)));
        }
        ctx.lineTo(X(XB), Y(YB)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(140,199,255,0.85)';
        ctx.lineWidth = Math.max(1.2, H * 0.004);
        ctx.beginPath();
        for (i = 0; i <= N; i++) {
          z = ZMIN + (ZMAX - ZMIN) * i / N;
          if (i === 0) { ctx.moveTo(X(xDeZ(z)), Y(yC(z))); } else { ctx.lineTo(X(xDeZ(z)), Y(yC(z))); }
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(' + COUL[k.cat] + ',0.95)';
        ctx.beginPath(); ctx.arc(X(xDeZ(k.z)), Y(YB), Math.max(3, H * 0.012), 0, 6.2832); ctx.fill();
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
    cadre.setAttribute('data-z', k.z.toFixed(1));
    cadre.setAttribute('data-p', k.p.toExponential(4));
    cadre.setAttribute('data-categorie', String(k.cat));
    if (moteur) { moteur.rendre(k); }
  }

  if (curseur) {
    curseur.addEventListener('input', function () { contexte = ''; rafraichir(); });
  }
  presets.forEach(function (b) {
    b.addEventListener('click', function () {
      if (curseur) { curseur.value = b.getAttribute('data-preuves-preset'); }
      contexte = b.getAttribute('data-preuves-contexte') || '';
      rafraichir();
    });
  });

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

  window.CREATIO_preuves = { pValeur: pValeur, scientifique: scientifique, surN: surN };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
