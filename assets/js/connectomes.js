/* ==========================================================================
   CREATIO — Comparateur de connectomes (salle 19, E14)
   Le visiteur choisit l'une des trois cartes publiées (H01 humain, MICrONS
   souris, FlyWire drosophile) et une fraction du volume cartographié
   (1 à 100 %). Quatre replis : WGSL, GLSL ES, dessin 2D, image JPG.
   Clavier inclus ; aucune animation automatique.

   HONNÊTETÉ :
   - PUBLIÉ : H01 = 1 mm³, 1,4 Po, 57 180 cellules, ≈ 150 millions de
     synapses (F-108, F-109, S029) ; MICrONS = 1 mm³, 1,6 Po, plus de
     200 000 cellules, 523 millions de synapses (F-110, F-111, S030) ;
     FlyWire = cerveau entier, 139 255 neurones, ≈ 54,5 millions de
     synapses (F-112, S031).
   - ESTIMATION PROPORTIONNELLE : pour une fraction du volume, les nombres
     sont multipliés par la fraction. La densité réelle n'est pas uniforme ;
     c'est un ordre de grandeur, pas une donnée publiée.
   - CALCUL : synapses par cellule = synapses / cellules (cellules gliales
     comprises pour H01 et MICrONS ; neurones seuls pour FlyWire).
   - Le nuage de points est une visualisation, pas la carte réelle.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-connectomes]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-connectomes-moteur]');
  var legende = cadre.querySelector('[data-connectomes-legende]');
  var cFraction = cadre.querySelector('[data-connectomes-fraction]');
  var sortie = cadre.querySelector('[data-connectomes-sortie]');
  var boutons = Array.prototype.slice.call(cadre.querySelectorAll('[data-connectomes-jeu]'));

  var JEUX = {
    h01: { nom: 'Humain — H01 (2024)', volume: 'un millimètre cube de cortex temporal humain',
      cellules: 57180, synapses: 150e6, unite: 'cellules', donnees: '1,4 pétaoctet',
      faits: 'F-108, F-109', plus: false, couleur: [1.0, 0.80, 0.42], densite: 0.55, lien: 1.0 },
    microns: { nom: 'Souris — MICrONS (2025)', volume: 'un millimètre cube de cortex visuel de souris',
      cellules: 200000, synapses: 523e6, unite: 'cellules', donnees: '1,6 pétaoctet',
      faits: 'F-110, F-111', plus: true, couleur: [0.45, 0.85, 0.80], densite: 0.8, lien: 1.0 },
    flywire: { nom: 'Drosophile — FlyWire (2024)', volume: 'le cerveau entier d’une drosophile femelle',
      cellules: 139255, synapses: 54.5e6, unite: 'neurones', donnees: '',
      faits: 'F-112', plus: false, couleur: [0.72, 0.62, 1.0], densite: 0.68, lien: 0.35 }
  };
  var NEURONES_HUMAINS = 86.1e9; // F-105, S028
  var jeu = 'h01';
  var moteur = null;
  var hote = null;

  function fr(n, dec) {
    var d = dec || 0;
    var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    var parties = s.split('.');
    parties[0] = parties[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return parties.join(',');
  }

  function grand(n) {
    if (n >= 1e6) {
      var m = n / 1e6;
      var dec = (m < 10 || (m < 100 && Math.abs(m - Math.round(m)) > 0.05)) ? 1 : 0;
      return fr(m, dec) + ' million' + (n >= 2e6 ? 's' : '');
    }
    return fr(n);
  }

  function synapsesTxt(n) {
    return n >= 1e6 ? grand(n) + ' de synapses' : fr(n) + ' synapses';
  }

  function deuxChiffres(n) {
    var p = Math.pow(10, Math.floor(Math.log(n) / Math.LN10) - 1);
    return Math.round(n / p) * p;
  }

  function fraction() {
    var v = parseFloat(cFraction ? cFraction.value : '100');
    if (isNaN(v)) { v = 100; }
    return Math.max(1, Math.min(100, Math.round(v)));
  }

  function calcul() {
    var j = JEUX[jeu], f = fraction() / 100;
    return {
      cle: jeu, j: j, f: f, pourcent: fraction(),
      cellules: j.cellules * f, synapses: j.synapses * f,
      parCellule: deuxChiffres(j.synapses / j.cellules),
      rayon: 0.44 * Math.cbrt(f)
    };
  }

  function texteSortie() {
    return JEUX[jeu].nom + ' · ' + fr(fraction()) + ' % du volume';
  }

  function majLegende(k) {
    if (sortie) { sortie.textContent = texteSortie(); }
    if (cFraction) { cFraction.setAttribute('aria-valuetext', fr(k.pourcent) + ' % du volume'); }
    boutons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-connectomes-jeu') === jeu ? 'true' : 'false');
    });
    if (!legende) { return; }
    var j = k.j;
    var entier = k.pourcent === 100;
    var prefixe = entier ? (j.plus ? 'plus de ' : '') : (j.plus ? 'au moins ' : 'environ ');
    var tete = entier
      ? 'Carte publiée : ' + j.volume + ', ' + prefixe + fr(k.cellules) + ' ' + j.unite +
        ' et environ ' + synapsesTxt(k.synapses) + ' (' + j.faits + ').'
      : 'Pour ' + fr(k.pourcent) + ' % de ' + j.volume + ' : ' + prefixe +
        fr(deuxChiffres(k.cellules)) + ' ' + j.unite + ' et environ ' +
        synapsesTxt(deuxChiffres(k.synapses)) + '. Estimation proportionnelle : ' +
        'la densité réelle n’est pas uniforme.';
    var donnees = j.donnees ? ' Volume de données publié : ' + j.donnees + '.' : '';
    var ratio = ' Calcul : ' + (j.plus ? 'au plus environ ' : 'environ ') + fr(k.parCellule) +
      ' synapses par ' + (j.unite === 'neurones' ? 'neurone' : 'cellule, cellules gliales comprises') + '.';
    var echelle = k.cle === 'flywire'
      ? ' Pour situer : le cerveau humain compte environ 86,1 milliards de neurones (F-105), soit environ ' +
        fr(deuxChiffres(NEURONES_HUMAINS / j.cellules)) + ' fois plus.'
      : '';
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : visualisation JPG, sans nuage de points calculé.' : '';
    legende.innerHTML = '<strong>' + tete + '</strong>' + donnees + ratio + echelle +
      ' Le nuage de points est une visualisation, pas la carte réelle.' + repli;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, rayon: f32, densite: f32, couleur: vec3<f32>, lien: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    'fn h(q: vec2<f32>) -> f32 { return fract(sin(dot(q, vec2<f32>(127.1, 311.7))) * 43758.5453); }',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let echelle = min(u.resolution.x, u.resolution.y);',
    '  let p = (f.xy - 0.5 * u.resolution) / echelle;',
    '  let dc = length(p);',
    '  let dedans = 1.0 - smoothstep(u.rayon - 0.02, u.rayon, dc);',
    '  let g = p * 34.0;',
    '  let id = floor(g);',
    '  let fr = fract(g) - vec2<f32>(0.5, 0.5);',
    '  let dec = (vec2<f32>(h(id + vec2<f32>(1.3, 2.1)), h(id + vec2<f32>(7.1, 3.7))) - vec2<f32>(0.5, 0.5)) * 0.6;',
    '  let pres = step(h(id), u.densite) * dedans;',
    '  let dd = length(fr - dec);',
    '  let pt = (smoothstep(0.22, 0.11, dd) * 0.95 + exp(-dd * 7.0) * 0.3) * pres;',
    '  let halo = exp(-dd * 2.5) * pres * 0.18 * u.lien;',
    '  let bord = exp(-abs(dc - u.rayon) * 120.0) * 0.45;',
    '  let col = u.couleur * (pt + halo) + vec3<f32>(0.8, 0.85, 1.0) * bord;',
    '  let alpha = clamp(pt + halo + bord, 0.0, 0.92);',
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
    // Disposition : vec2 (8) · f32 · f32 · vec3 aligné sur 16 · f32 → 32 octets.
    var uniformes = device.createBuffer({
      size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        var col = k.j.couleur;
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, k.rayon, k.j.densite, col[0], col[1], col[2], k.j.lien]));
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
    'uniform vec2 u_res; uniform float u_rayon; uniform float u_densite;',
    'uniform vec3 u_couleur; uniform float u_lien; out vec4 outColor;',
    'float h(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float echelle = min(u_res.x, u_res.y);',
    '  vec2 p = (f - 0.5 * u_res) / echelle;',
    '  float dc = length(p);',
    '  float dedans = 1.0 - smoothstep(u_rayon - 0.02, u_rayon, dc);',
    '  vec2 g = p * 34.0;',
    '  vec2 id = floor(g);',
    '  vec2 fr = fract(g) - 0.5;',
    '  vec2 dec = (vec2(h(id + vec2(1.3, 2.1)), h(id + vec2(7.1, 3.7))) - 0.5) * 0.6;',
    '  float pres = step(h(id), u_densite) * dedans;',
    '  float dd = length(fr - dec);',
    '  float pt = (smoothstep(0.22, 0.11, dd) * 0.95 + exp(-dd * 7.0) * 0.3) * pres;',
    '  float halo = exp(-dd * 2.5) * pres * 0.18 * u_lien;',
    '  float bord = exp(-abs(dc - u_rayon) * 120.0) * 0.45;',
    '  vec3 col = u_couleur * (pt + halo) + vec3(0.8, 0.85, 1.0) * bord;',
    '  float alpha = clamp(pt + halo + bord, 0.0, 0.92);',
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
    var loc = {};
    ['u_res', 'u_rayon', 'u_densite', 'u_couleur', 'u_lien'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (k) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.u_res, c.width, c.height);
        gl.uniform1f(loc.u_rayon, k.rayon);
        gl.uniform1f(loc.u_densite, k.j.densite);
        gl.uniform3f(loc.u_couleur, k.j.couleur[0], k.j.couleur[1], k.j.couleur[2]);
        gl.uniform1f(loc.u_lien, k.j.lien);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    function alea(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    return {
      nom: 'Dessin en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height, R = Math.min(W, H);
        var cx = W / 2, cy = H / 2;
        var col = k.j.couleur.map(function (v) { return Math.round(v * 255); }).join(',');
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(205,215,255,0.35)';
        ctx.lineWidth = Math.max(1, R * 0.003);
        ctx.beginPath(); ctx.arc(cx, cy, k.rayon * R, 0, 6.284); ctx.stroke();
        var n = Math.round(900 * k.j.densite * k.f);
        n = Math.max(12, n);
        for (var i = 0; i < n; i++) {
          var a = alea(i) * 6.2832, r = Math.sqrt(alea(i + 1000)) * k.rayon;
          var x = cx + Math.cos(a) * r * R, y = cy + Math.sin(a) * r * R;
          ctx.fillStyle = 'rgba(' + col + ',' + (0.55 + 0.4 * alea(i + 2000)).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, R * 0.005), 0, 6.284); ctx.fill();
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
    var k = calcul();
    majLegende(k);
    cadre.setAttribute('data-jeu', jeu);
    cadre.setAttribute('data-fraction', String(k.pourcent));
    cadre.setAttribute('data-cellules', String(Math.round(k.cellules)));
    cadre.setAttribute('data-synapses', String(Math.round(k.synapses)));
    if (moteur) { moteur.rendre(k); }
  }

  if (cFraction) { cFraction.addEventListener('input', rafraichir); }
  boutons.forEach(function (b) {
    b.addEventListener('click', function () {
      var cle = b.getAttribute('data-connectomes-jeu');
      if (JEUX[cle]) { jeu = cle; }
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
