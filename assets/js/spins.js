/* ==========================================================================
   CREATIO — Laboratoire des spins (salle 17, E13)
   Le visiteur règle un champ magnétique (0 à 100 µT), l'orientation d'un
   champ local fictif et l'instant observé (0 à 2 000 ns). Deux spins sont
   dessinés : A précesse à la fréquence de Larmor exacte d'un électron libre,
   B subit en plus un champ local illustratif. Quatre replis : WGSL, GLSL ES,
   dessin 2D, image JPG. Clavier inclus ; aucune animation automatique.

   HONNÊTETÉ :
   - EXACT : f = (g/2) × 2 μB B / h ≈ 28,025 kHz par µT (g/2 : F-172, S041 ;
     μB/h : CODATA 2022, S042). Pour 50 µT : 1,401 MHz, période ≈ 714 ns.
   - ÉTABLI : le champ terrestre de surface vaut 22 à 67 µT (F-180, S048).
   - ILLUSTRATIF : le champ local de 50 µT du spin B et le « caractère
     singulet » cos²(Δφ/2) sont un modèle-jouet semi-classique. Les vrais
     champs hyperfins sont plus intenses et anisotropes ; aucune valeur de
     rendement n'est publiée. La magnétosensibilité du cryptochrome 4 est
     démontrée en éprouvette (F-097) ; son rôle chez l'oiseau vivant est
     DÉBATTU (F-091, F-098).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-spins]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-spins-moteur]');
  var legende = cadre.querySelector('[data-spins-legende]');
  var cChamp = cadre.querySelector('[data-spins-champ]');
  var cAngle = cadre.querySelector('[data-spins-angle]');
  var cTemps = cadre.querySelector('[data-spins-temps]');
  var sortie = cadre.querySelector('[data-spins-sortie]');
  var bTerre = cadre.querySelector('[data-spins-terre]');
  var bNul = cadre.querySelector('[data-spins-nul]');

  var GAMMA_MHZ_PAR_UT = 0.0280249514; // (g/2) × 2 μB/h, en MHz par µT
  var CHAMP_LOCAL_UT = 50;             // illustratif
  var moteur = null;
  var hote = null;

  function fr(n, dec) {
    var d = dec || 0;
    var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    var parties = s.replace('-', '−').split('.');
    parties[0] = parties[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return parties.join(',');
  }

  function lire(c, min, max, def) {
    var v = parseFloat(c ? c.value : String(def));
    if (isNaN(v)) { v = def; }
    return Math.max(min, Math.min(max, Math.round(v)));
  }
  function champ() { return lire(cChamp, 0, 100, 50); }
  function angle() { return lire(cAngle, 0, 180, 60); }
  function temps() { return lire(cTemps, 0, 2000, 300); }

  function calcul() {
    var B = champ(), th = angle() * Math.PI / 180, t = temps() / 1000; // µs
    var fA = GAMMA_MHZ_PAR_UT * B;
    var bTot = Math.sqrt(B * B + CHAMP_LOCAL_UT * CHAMP_LOCAL_UT +
      2 * B * CHAMP_LOCAL_UT * Math.cos(th));
    var fB = GAMMA_MHZ_PAR_UT * bTot;
    var phiA = 2 * Math.PI * fA * t;
    var phiB = 2 * Math.PI * fB * t;
    var dphi = phiB - phiA;
    var singulet = Math.pow(Math.cos(dphi / 2), 2);
    return { B: B, fA: fA, fB: fB, phiA: phiA, phiB: phiB,
      tours: fA * t, singulet: singulet };
  }

  function texteSortie() {
    return 'Champ ' + fr(champ()) + ' µT · orientation ' + fr(angle()) +
      ' degrés · temps ' + fr(temps()) + ' ns';
  }

  function majLegende(k) {
    if (sortie) { sortie.textContent = texteSortie(); }
    if (!legende) { return; }
    var precession;
    if (k.B === 0) {
      precession = 'Champ nul : le spin A ne précesse pas.';
    } else {
      precession = 'Le spin A précesse à ' + fr(k.fA, 3) + ' MHz, soit un tour toutes les ' +
        fr(1000 / k.fA) + ' ns ; à cet instant il a accompli ' + fr(k.tours, 2) + ' tour' +
        (k.tours >= 2 ? 's' : '') + '.';
    }
    var plage = (k.B >= 22 && k.B <= 67)
      ? ' Cette valeur se situe dans la plage du champ terrestre de surface, de 22 à 67 µT (fait F-180).'
      : ' Cette valeur est hors de la plage du champ terrestre de surface, de 22 à 67 µT (fait F-180).';
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : visualisation JPG, sans spins calculés.' : '';
    legende.innerHTML = '<strong>' + precession + '</strong>' + plage +
      ' Calcul exact pour un électron libre : environ 28,025 kHz par µT (g/2 du fait F-172, ' +
      'constantes CODATA S042). Le spin B est ILLUSTRATIF : il subit en plus un champ local ' +
      'fictif de 50 µT ; son caractère singulet illustratif vaut ' + fr(k.singulet * 100) +
      ' %. Ce modèle-jouet montre seulement que l’orientation du champ peut modifier l’évolution ' +
      'd’une paire de spins ; il ne publie aucun rendement réel. ÉTABLI : la magnétosensibilité ' +
      'du cryptochrome 4 en éprouvette (F-097). DÉBATTU : son rôle chez l’oiseau vivant.' + repli;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, phiA: f32, phiB: f32, champ: f32, singulet: f32, r0: f32, r1: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    'fn segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {',
    '  let pa = p - a; let ba = b - a;',
    '  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',
    'fn spin(p: vec2<f32>, c: vec2<f32>, phi: f32) -> vec2<f32> {',
    '  let d = length(p - c);',
    '  let pointe = c + vec2<f32>(sin(phi), -cos(phi)) * 0.12;',
    '  let fleche = exp(-segment(p, c, pointe) * 120.0) * 1.3 + exp(-length(p - pointe) * 70.0) * 0.9;',
    '  let anneau = exp(-abs(d - 0.12) * 180.0) * 0.35;',
    '  let coeur = exp(-d * 30.0) * 0.8;',
    '  return vec2<f32>(fleche + coeur, anneau);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let echelle = min(u.resolution.x, u.resolution.y);',
    '  let p = (f.xy - 0.5 * u.resolution) / echelle;',
    '  let cA = vec2<f32>(-0.375, 0.0); let cB = vec2<f32>(0.375, 0.0);',
    '  let masque = smoothstep(0.19, 0.26, min(length(p - cA), length(p - cB)));',
    '  let lignes = pow(0.5 + 0.5 * sin(p.y * 38.0), 14.0) * u.champ * exp(-abs(p.y) * 2.2) * masque * 0.6;',
    '  let a = spin(p, cA, u.phiA); let b = spin(p, cB, u.phiB);',
    '  let lien = exp(-abs(p.y) * 40.0) * step(abs(p.x), 0.17) * 0.25;',
    '  var col = vec3<f32>(0.45, 0.78, 0.98) * lignes;',
    '  col += vec3<f32>(1.0, 0.80, 0.40) * (a.x + a.y);',
    '  col += vec3<f32>(0.55, 0.85, 1.0) * (b.x + b.y);',
    '  col += mix(vec3<f32>(0.4, 0.7, 1.0), vec3<f32>(1.0, 0.82, 0.45), u.singulet) * lien;',
    '  let alpha = clamp(lignes + a.x + a.y + b.x + b.y + lien, 0.0, 0.93);',
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
      size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, k.phiA, k.phiB, k.B / 100, k.singulet, 0, 0]));
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
    'uniform vec2 u_res; uniform float u_phiA; uniform float u_phiB;',
    'uniform float u_champ; uniform float u_singulet; out vec4 outColor;',
    'float segment(vec2 p, vec2 a, vec2 b) {',
    '  vec2 pa = p - a; vec2 ba = b - a;',
    '  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',
    'vec2 spin(vec2 p, vec2 c, float phi) {',
    '  float d = length(p - c);',
    '  vec2 pointe = c + vec2(sin(phi), -cos(phi)) * 0.12;',
    '  float fleche = exp(-segment(p, c, pointe) * 120.0) * 1.3 + exp(-length(p - pointe) * 70.0) * 0.9;',
    '  float anneau = exp(-abs(d - 0.12) * 180.0) * 0.35;',
    '  float coeur = exp(-d * 30.0) * 0.8;',
    '  return vec2(fleche + coeur, anneau);',
    '}',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float echelle = min(u_res.x, u_res.y);',
    '  vec2 p = (f - 0.5 * u_res) / echelle;',
    '  vec2 cA = vec2(-0.375, 0.0); vec2 cB = vec2(0.375, 0.0);',
    '  float masque = smoothstep(0.19, 0.26, min(length(p - cA), length(p - cB)));',
    '  float lignes = pow(0.5 + 0.5 * sin(p.y * 38.0), 14.0) * u_champ * exp(-abs(p.y) * 2.2) * masque * 0.6;',
    '  vec2 a = spin(p, cA, u_phiA); vec2 b = spin(p, cB, u_phiB);',
    '  float lien = exp(-abs(p.y) * 40.0) * step(abs(p.x), 0.17) * 0.25;',
    '  vec3 col = vec3(0.45, 0.78, 0.98) * lignes;',
    '  col += vec3(1.0, 0.80, 0.40) * (a.x + a.y);',
    '  col += vec3(0.55, 0.85, 1.0) * (b.x + b.y);',
    '  col += mix(vec3(0.4, 0.7, 1.0), vec3(1.0, 0.82, 0.45), u_singulet) * lien;',
    '  float alpha = clamp(lignes + a.x + a.y + b.x + b.y + lien, 0.0, 0.93);',
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
    ['u_res', 'u_phiA', 'u_phiB', 'u_champ', 'u_singulet'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (k) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.u_res, c.width, c.height);
        gl.uniform1f(loc.u_phiA, k.phiA);
        gl.uniform1f(loc.u_phiB, k.phiB);
        gl.uniform1f(loc.u_champ, k.B / 100);
        gl.uniform1f(loc.u_singulet, k.singulet);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------ */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    function dessinerSpin(cx, cy, R, phi, couleur) {
      ctx.strokeStyle = couleur.replace('A', '0.35');
      ctx.lineWidth = Math.max(1, R * 0.004);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, 6.284); ctx.stroke();
      var px = cx + Math.sin(phi) * R * 0.12, py = cy - Math.cos(phi) * R * 0.12;
      ctx.strokeStyle = couleur.replace('A', '0.95');
      ctx.lineWidth = Math.max(2, R * 0.012); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = couleur.replace('A', '1');
      ctx.beginPath(); ctx.arc(px, py, Math.max(3, R * 0.018), 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, R * 0.022), 0, 6.284); ctx.fill();
    }
    return {
      nom: 'Dessin en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height, R = Math.min(W, H);
        var cx = W / 2, cy = H / 2;
        var ax = cx - 0.375 * R, bx = cx + 0.375 * R;
        ctx.clearRect(0, 0, W, H);
        // Lignes de champ horizontales, interrompues autour des spins.
        ctx.strokeStyle = 'rgba(115,195,245,' + (0.08 + 0.32 * k.B / 100).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1, R * 0.0018);
        for (var j = -5; j <= 5; j++) {
          var y = cy + j * R * 0.083;
          var segs = [[0, ax - 0.26 * R], [ax + 0.26 * R, bx - 0.26 * R], [bx + 0.26 * R, W]];
          for (var s = 0; s < segs.length; s++) {
            if (segs[s][1] <= segs[s][0]) { continue; }
            ctx.beginPath(); ctx.moveTo(segs[s][0], y); ctx.lineTo(segs[s][1], y); ctx.stroke();
          }
        }
        dessinerSpin(ax, cy, R, k.phiA, 'rgba(255,205,105,A)');
        dessinerSpin(bx, cy, R, k.phiB, 'rgba(140,215,255,A)');
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
    cadre.setAttribute('data-champ', String(k.B));
    cadre.setAttribute('data-angle', String(angle()));
    cadre.setAttribute('data-temps', String(temps()));
    cadre.setAttribute('data-singulet', String(Math.round(k.singulet * 100)));
    if (moteur) { moteur.rendre(k); }
  }

  [cChamp, cAngle, cTemps].forEach(function (c) {
    if (c) { c.addEventListener('input', rafraichir); }
  });
  if (bTerre) {
    bTerre.addEventListener('click', function () {
      if (cChamp) { cChamp.value = '50'; }
      rafraichir();
    });
  }
  if (bNul) {
    bNul.addEventListener('click', function () {
      if (cChamp) { cChamp.value = '0'; }
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
        m.rendre(calcul());
      }).observe(hote);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
