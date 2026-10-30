/* ==========================================================================
   CREATIO — Le métronome des langues (salle 20, E15)
   Le visiteur règle la densité d'information d'une langue (bits par syllabe)
   et le débit de parole (syllabes par seconde). Le calcul affiche le débit
   d'information obtenu et le compare à la fourchette mesurée sur 17 langues.
   Quatre replis : WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus ;
   aucune animation automatique.

   HONNÊTETÉ :
   - MESURE : débit d'information moyen 39,15 bits/s, écart type 5,10
     (F-188, S054) ; débit syllabique moyen 6,63 syllabes/s (F-189).
   - MESURE : densités de 5 à 8 bits par syllabe dans les 17 langues
     (F-190, S054, S055) : ce sont les bornes du curseur.
   - CALCUL ILLUSTRATIF : débit d'information = densité × débit syllabique ;
     débit nécessaire = 39,15 / densité. Les auteurs ont calculé ces valeurs
     par langue et par locuteur ; l'outil ne simule aucune langue réelle.
   - INTERPRÉTATION : l'idée d'une capacité de traitement commune reste une
     hypothèse des auteurs (F-196, DÉBATTU).
   - Le ruban de points (un point par syllabe sur deux secondes, taille liée
     à la densité, éclat lié au débit d'information) est placé entre les deux
     visages de l'image de fond : c'est une visualisation, pas un signal sonore.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-langues]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-langues-moteur]');
  var legende = cadre.querySelector('[data-langues-legende]');
  var cDensite = cadre.querySelector('[data-langues-densite]');
  var cDebit = cadre.querySelector('[data-langues-debit]');
  var sortie = cadre.querySelector('[data-langues-sortie]');
  var bMoyen = cadre.querySelector('[data-langues-moyen]');
  var bAjuster = cadre.querySelector('[data-langues-ajuster]');

  var IR_MOYEN = 39.15;  // F-188, S054
  var IR_ET = 5.10;      // F-188, S054
  var SR_MOYEN = 6.63;   // F-189, S054
  var moteur = null;
  var hote = null;

  function fr(n, dec) {
    var d = dec || 0;
    var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    var parties = s.split('.');
    parties[0] = parties[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return parties.join(',');
  }

  function lire(c, min, max, def, pas) {
    var v = parseFloat(c ? c.value : String(def));
    if (isNaN(v)) { v = def; }
    v = Math.max(min, Math.min(max, v));
    return Math.round(v / pas) * pas;
  }
  function densite() { return lire(cDensite, 5, 8, 5.9, 0.1); }
  function debit() { return lire(cDebit, 3, 10, 6.6, 0.01); }

  function calcul() {
    var id = densite();
    var sr = debit();
    var ir = id * sr;
    return {
      id: id, sr: sr, ir: ir,
      requis: IR_MOYEN / id,
      syllabesMinute: sr * 60,
      bitsMinute: ir * 60,
      ecart: (ir - IR_MOYEN) / IR_ET,
      eclat: Math.max(0.25, Math.min(1.6, ir / IR_MOYEN)),
      taille: (id - 5) / 3,
      points: Math.max(2, Math.round(sr * 2))
    };
  }

  function texteSortie(k) {
    return fr(k.id, 1) + ' bits par syllabe · ' + fr(k.sr, 2) + ' syllabes par seconde';
  }

  function texteBande(k) {
    var bas = IR_MOYEN - IR_ET, haut = IR_MOYEN + IR_ET;
    if (k.ir < bas) {
      return 'C’est en dessous de la fourchette observée chez la plupart des locuteurs (de ' +
        fr(bas, 2) + ' à ' + fr(haut, 2) + ' bits par seconde, soit la moyenne plus ou moins un écart type, F-188).';
    }
    if (k.ir > haut) {
      return 'C’est au-dessus de la fourchette observée chez la plupart des locuteurs (de ' +
        fr(bas, 2) + ' à ' + fr(haut, 2) + ' bits par seconde, soit la moyenne plus ou moins un écart type, F-188).';
    }
    return 'C’est dans la fourchette observée chez la plupart des locuteurs (de ' +
      fr(bas, 2) + ' à ' + fr(haut, 2) + ' bits par seconde, soit la moyenne plus ou moins un écart type, F-188).';
  }

  function majLegende(k) {
    if (sortie) { sortie.textContent = texteSortie(k); }
    if (cDensite) { cDensite.setAttribute('aria-valuetext', fr(k.id, 1) + ' bits par syllabe'); }
    if (cDebit) { cDebit.setAttribute('aria-valuetext', fr(k.sr, 2) + ' syllabes par seconde'); }
    if (!legende) { return; }
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : photographie seule, sans ruban de points.' : '';
    legende.innerHTML = '<strong>Avec ' + fr(k.id, 1) + ' bits par syllabe et ' + fr(k.sr, 2) +
      ' syllabes par seconde : environ ' + fr(k.ir, 1) + ' bits par seconde.</strong> ' + texteBande(k) +
      ' Pour transmettre 39,15 bits par seconde avec cette densité, il faudrait parler à environ ' +
      fr(k.requis, 2) + ' syllabes par seconde. En une minute : ' + fr(k.syllabesMinute) +
      ' syllabes, soit environ ' + fr(k.bitsMinute) + ' bits.' +
      ' Calcul illustratif : densité multipliée par le débit ; débit moyen mesuré 6,63 syllabes par seconde (F-189).' +
      repli;
  }

  /* Géométrie commune : ruban horizontal entre les deux visages de la photo
     (cadre 16:9), à hauteur des bouches. p est normalisé par la hauteur. */
  var X0 = -0.18, X1 = 0.18, YC = -0.15;

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, nombre: f32, taille: f32, eclat: f32, ecart: f32, a: f32, b: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var q = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(q[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let p = (f.xy - 0.5 * u.resolution) / u.resolution.y;',
    '  let largeur = ' + (X1 - X0).toFixed(3) + ';',
    '  let t = (p.x - (' + X0.toFixed(3) + ')) / largeur;',
    '  let bord = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t);',
    '  let yw = ' + YC.toFixed(3) + ' + 0.022 * sin(t * 12.566);',
    '  let dy = p.y - yw;',
    '  let cellule = t * u.nombre;',
    '  let dx = (fract(cellule) - 0.5) * largeur / u.nombre;',
    '  let dd = length(vec2<f32>(dx, dy));',
    '  let rayon = 0.0060 + 0.0070 * u.taille;',
    '  let disque = smoothstep(rayon, rayon * 0.55, dd) + exp(-dd / rayon * 1.4) * 0.45;',
    '  let fil = exp(-abs(dy) * 260.0) * 0.22;',
    '  let dans = 1.0 - smoothstep(0.8, 1.6, abs(u.ecart));',
    '  let teinte = mix(vec3<f32>(0.45, 0.78, 0.95), vec3<f32>(1.0, 0.80, 0.45), dans);',
    '  let k = (disque * u.eclat + fil) * bord;',
    '  let alpha = clamp(k, 0.0, 0.92);',
    '  return vec4<f32>(teinte * alpha, alpha);',
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
          c.width, c.height, k.points, k.taille, k.eclat, k.ecart, 0, 0]));
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
    '  vec2 q = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0);',
    '}'].join('\n');
  var GFS = ['#version 300 es', 'precision highp float;',
    'uniform vec2 u_res; uniform float u_nombre; uniform float u_taille; uniform float u_eclat; uniform float u_ecart;',
    'out vec4 outColor;',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  vec2 p = (f - 0.5 * u_res) / u_res.y;',
    '  float largeur = ' + (X1 - X0).toFixed(3) + ';',
    '  float t = (p.x - (' + X0.toFixed(3) + ')) / largeur;',
    '  float bord = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t);',
    '  float yw = ' + YC.toFixed(3) + ' + 0.022 * sin(t * 12.566);',
    '  float dy = p.y - yw;',
    '  float cellule = t * u_nombre;',
    '  float dx = (fract(cellule) - 0.5) * largeur / u_nombre;',
    '  float dd = length(vec2(dx, dy));',
    '  float rayon = 0.0060 + 0.0070 * u_taille;',
    '  float disque = smoothstep(rayon, rayon * 0.55, dd) + exp(-dd / rayon * 1.4) * 0.45;',
    '  float fil = exp(-abs(dy) * 260.0) * 0.22;',
    '  float dans = 1.0 - smoothstep(0.8, 1.6, abs(u_ecart));',
    '  vec3 teinte = mix(vec3(0.45, 0.78, 0.95), vec3(1.0, 0.80, 0.45), dans);',
    '  float k = (disque * u_eclat + fil) * bord;',
    '  float alpha = clamp(k, 0.0, 0.92);',
    '  outColor = vec4(teinte * alpha, alpha);',
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
    ['u_res', 'u_nombre', 'u_taille', 'u_eclat', 'u_ecart'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (k) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.u_res, c.width, c.height);
        gl.uniform1f(loc.u_nombre, k.points);
        gl.uniform1f(loc.u_taille, k.taille);
        gl.uniform1f(loc.u_eclat, k.eclat);
        gl.uniform1f(loc.u_ecart, k.ecart);
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
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        var W = c.width, H = c.height;
        ctx.clearRect(0, 0, W, H);
        var dans = Math.abs(k.ecart) <= 1;
        var coul = dans ? '255,204,115' : '115,199,242';
        var largeur = X1 - X0;
        var rayon = Math.max(1.5, (0.0060 + 0.0070 * k.taille) * H);
        ctx.lineWidth = Math.max(1, H * 0.002);
        ctx.strokeStyle = 'rgba(' + coul + ',0.25)';
        ctx.beginPath();
        for (var s = 0; s <= 80; s++) {
          var t0 = s / 80;
          var px = W / 2 + (X0 + t0 * largeur) * H;
          var py = H / 2 + (YC + 0.022 * Math.sin(t0 * 12.566)) * H;
          if (s === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
        }
        ctx.stroke();
        for (var i = 0; i < k.points; i++) {
          var t = (i + 0.5) / k.points;
          var bord = Math.min(1, t / 0.12, (1 - t) / 0.12);
          var x = W / 2 + (X0 + t * largeur) * H;
          var y = H / 2 + (YC + 0.022 * Math.sin(t * 12.566)) * H;
          var a = Math.min(0.95, 0.55 * k.eclat) * Math.max(0, bord);
          ctx.fillStyle = 'rgba(' + coul + ',' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(x, y, rayon, 0, 6.284); ctx.fill();
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
    cadre.setAttribute('data-densite', k.id.toFixed(1));
    cadre.setAttribute('data-debit', k.sr.toFixed(2));
    cadre.setAttribute('data-ir', k.ir.toFixed(2));
    cadre.setAttribute('data-requis', k.requis.toFixed(2));
    if (moteur) { moteur.rendre(k); }
  }

  [cDensite, cDebit].forEach(function (c) {
    if (c) { c.addEventListener('input', rafraichir); }
  });
  if (bMoyen) {
    bMoyen.addEventListener('click', function () {
      if (cDebit) { cDebit.value = SR_MOYEN.toFixed(2); }
      rafraichir();
    });
  }
  if (bAjuster) {
    bAjuster.addEventListener('click', function () {
      if (cDebit) { cDebit.value = (Math.round(IR_MOYEN / densite() * 100) / 100).toFixed(2); }
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
