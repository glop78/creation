/* ==========================================================================
   CREATIO — La constellation des qualités (salle 22, E16)
   Cinq qualités qu'une personne croyante peut discerner dans le parcours :
   puissance, sagesse, précision, amour, fidélité. Chaque qualité relie quatre
   faits ÉTABLIS déjà présentés dans les salles ; choisir une qualité allume
   ses quatre étoiles et les relie par une ligne ouverte. Quatre replis :
   WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus ; aucune animation.

   HONNÊTETÉ :
   - Les faits reliés sont des mesures publiées (badge ÉTABLI, F-ids dans le
     panneau) ; le regroupement en « qualités » est une lecture croyante
     (badge RÉFLEXION, F-119, F-205) et non une conclusion scientifique.
   - Les étoiles sont décoratives : leurs positions ne représentent aucune
     carte du ciel. Chaque ligne relie quatre points d'abscisses croissantes,
     sans croisement ; une seule ligne est tracée à la fois.
   - Aucune donnée n'est enregistrée sur l'appareil du visiteur.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-constellation]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-constellation-moteur]');
  var boutons = Array.prototype.slice.call(cadre.querySelectorAll('[data-constellation-choix]'));
  var panneaux = Array.prototype.slice.call(cadre.querySelectorAll('[data-qualite]'));
  var annonce = cadre.querySelector('[data-constellation-annonce]');

  /* Positions en fractions de l'image 16:9, placées sur le velours sombre,
     à l'écart des cinq objets de la photographie. Abscisses croissantes. */
  var ORDRE = ['puissance', 'sagesse', 'precision', 'amour', 'fidelite'];
  var POSITIONS = {
    puissance: [[0.05, 0.14], [0.15, 0.08], [0.26, 0.13], [0.37, 0.06]],
    sagesse:   [[0.63, 0.06], [0.74, 0.12], [0.85, 0.05], [0.95, 0.11]],
    precision: [[0.04, 0.84], [0.12, 0.92], [0.21, 0.86], [0.30, 0.94]],
    amour:     [[0.37, 0.87], [0.45, 0.94], [0.54, 0.89], [0.61, 0.96]],
    fidelite:  [[0.68, 0.90], [0.77, 0.84], [0.86, 0.91], [0.96, 0.82]]
  };
  var actif = 'puissance';
  var focus = -1;
  var moteur = null;
  var hote = null;

  function etat() {
    var w = Math.max(1, hote ? hote.getBoundingClientRect().width : 16);
    var h = Math.max(1, hote ? hote.getBoundingClientRect().height : 9);
    var aspect = w / h;
    var etoiles = [], chaine = [];
    ORDRE.forEach(function (q) {
      POSITIONS[q].forEach(function (pt, i) {
        var x = (pt[0] - 0.5) * aspect, y = pt[1] - 0.5;
        var sel = q === actif;
        var eclat = sel ? (i === focus ? 1.0 : 0.85) : 0.38;
        var taille = sel ? (i === focus ? 1.0 : 0.75) : 0.45;
        etoiles.push([x, y, eclat, taille]);
        if (sel) { chaine.push([x, y]); }
      });
    });
    return { etoiles: etoiles, chaine: chaine, aspect: aspect };
  }

  /* Corps commun GLSL ; converti en WGSL plus bas. */
  var NE = 20;

  var WGSL = [
    'struct U { params: vec4<f32>, chaine: array<vec4<f32>, 4>, etoiles: array<vec4<f32>, ' + NE + '>, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var q = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(q[i], 0.0, 1.0);',
    '}',
    'fn segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {',
    '  let ab = b - a;',
    '  let t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);',
    '  return length(p - a - ab * t);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let p = (f.xy - 0.5 * u.params.xy) / u.params.y;',
    '  var lum = 0.0;',
    '  var lien = 0.0;',
    '  for (var i = 0; i < 3; i = i + 1) {',
    '    let d = segment(p, u.chaine[i].xy, u.chaine[i + 1].xy);',
    '    lien = max(lien, exp(-d * 300.0) * 0.70);',
    '  }',
    '  for (var j = 0; j < ' + NE + '; j = j + 1) {',
    '    let e = u.etoiles[j];',
    '    let d = length(p - e.xy);',
    '    let r = 0.005 + 0.008 * e.w;',
    '    lum = lum + (smoothstep(r, r * 0.4, d) + exp(-d / r * 1.2) * 0.55) * e.z;',
    '  }',
    '  let col = vec3<f32>(1.0, 0.88, 0.62) * lum + vec3<f32>(0.98, 0.80, 0.48) * lien;',
    '  let alpha = clamp(lum + lien, 0.0, 0.95);',
    '  return vec4<f32>(col * alpha / max(lum + lien, 0.0001), alpha);',
    '}'
  ].join('\n');

  function remplir(k) {
    var d = new Float32Array(4 + 16 + NE * 4);
    d[0] = k.w; d[1] = k.h;
    for (var i = 0; i < 4; i++) { d[4 + i * 4] = k.chaine[i][0]; d[5 + i * 4] = k.chaine[i][1]; }
    for (var j = 0; j < NE; j++) {
      var e = k.etoiles[j];
      d[20 + j * 4] = e[0]; d[21 + j * 4] = e[1]; d[22 + j * 4] = e[2]; d[23 + j * 4] = e[3];
    }
    return d;
  }

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
      size: (4 + 16 + NE * 4) * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var liaison = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformes } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (k) {
        if (!c.width || !c.height) { return; }
        k.w = c.width; k.h = c.height;
        device.queue.writeBuffer(uniformes, 0, remplir(k));
        var enc = device.createCommandEncoder();
        var passe = enc.beginRenderPass({ colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }] });
        passe.setPipeline(pipeline); passe.setBindGroup(0, liaison); passe.draw(3); passe.end();
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
    'uniform vec2 u_res; uniform vec4 u_chaine[4]; uniform vec4 u_etoiles[' + NE + '];',
    'out vec4 outColor;',
    'float segment(vec2 p, vec2 a, vec2 b) {',
    '  vec2 ab = b - a;',
    '  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);',
    '  return length(p - a - ab * t);',
    '}',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  vec2 p = (f - 0.5 * u_res) / u_res.y;',
    '  float lum = 0.0; float lien = 0.0;',
    '  for (int i = 0; i < 3; i++) {',
    '    float d = segment(p, u_chaine[i].xy, u_chaine[i + 1].xy);',
    '    lien = max(lien, exp(-d * 300.0) * 0.70);',
    '  }',
    '  for (int j = 0; j < ' + NE + '; j++) {',
    '    vec4 e = u_etoiles[j];',
    '    float d = length(p - e.xy);',
    '    float r = 0.005 + 0.008 * e.w;',
    '    lum += (smoothstep(r, r * 0.4, d) + exp(-d / r * 1.2) * 0.55) * e.z;',
    '  }',
    '  vec3 col = vec3(1.0, 0.88, 0.62) * lum + vec3(0.98, 0.80, 0.48) * lien;',
    '  float alpha = clamp(lum + lien, 0.0, 0.95);',
    '  outColor = vec4(col * alpha / max(lum + lien, 0.0001), alpha);',
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
    var lCh = gl.getUniformLocation(prog, 'u_chaine');
    var lEt = gl.getUniformLocation(prog, 'u_etoiles');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (k) {
        k.w = c.width; k.h = c.height;
        var d = remplir(k);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(lRes, c.width, c.height);
        gl.uniform4fv(lCh, d.subarray(4, 20));
        gl.uniform4fv(lEt, d.subarray(20));
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
        function X(px) { return W / 2 + px * H; }
        function Y(py) { return H / 2 + py * H; }
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(250,204,122,0.70)';
        ctx.lineWidth = Math.max(1, H * 0.0025);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        k.chaine.forEach(function (pt, i) {
          if (i === 0) { ctx.moveTo(X(pt[0]), Y(pt[1])); } else { ctx.lineTo(X(pt[0]), Y(pt[1])); }
        });
        ctx.stroke();
        k.etoiles.forEach(function (e) {
          var r = Math.max(2, (0.005 + 0.008 * e[3]) * H);
          var g = ctx.createRadialGradient(X(e[0]), Y(e[1]), 0, X(e[0]), Y(e[1]), r * 3.2);
          g.addColorStop(0, 'rgba(255,236,180,' + Math.min(1, e[2]).toFixed(3) + ')');
          g.addColorStop(0.32, 'rgba(255,224,158,' + (0.8 * e[2]).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(255,224,158,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(X(e[0]), Y(e[1]), r * 3.2, 0, 6.2832); ctx.fill();
        });
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

  function choisir(q, annoncer) {
    if (ORDRE.indexOf(q) < 0) { return; }
    actif = q; focus = -1;
    boutons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-constellation-choix') === q ? 'true' : 'false');
    });
    panneaux.forEach(function (p) { p.hidden = p.getAttribute('data-qualite') !== q; });
    cadre.setAttribute('data-actif', q);
    if (annoncer && annonce) {
      var b = boutons.filter(function (x) { return x.getAttribute('data-constellation-choix') === q; })[0];
      annonce.textContent = 'Qualité choisie : ' + (b ? b.textContent.trim() : q) +
        '. Quatre étoiles reliées ; les faits correspondants sont listés ci-dessous.';
    }
    if (moteur) { moteur.rendre(etat()); }
  }

  boutons.forEach(function (b, i) {
    b.addEventListener('click', function () { choisir(b.getAttribute('data-constellation-choix'), true); });
    b.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 :
        (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0);
      if (!d) { return; }
      ev.preventDefault();
      var n = boutons[(i + d + boutons.length) % boutons.length];
      n.focus();
      choisir(n.getAttribute('data-constellation-choix'), true);
    });
  });
  panneaux.forEach(function (p) {
    Array.prototype.slice.call(p.querySelectorAll('[data-etoile]')).forEach(function (li) {
      var n = parseInt(li.getAttribute('data-etoile'), 10);
      function allumer() { focus = n; if (moteur) { moteur.rendre(etat()); } }
      function eteindre() { focus = -1; if (moteur) { moteur.rendre(etat()); } }
      li.addEventListener('mouseenter', allumer);
      li.addEventListener('mouseleave', eteindre);
      li.addEventListener('focusin', allumer);
      li.addEventListener('focusout', eteindre);
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
    choisir(actif, false);
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var r = hote.getBoundingClientRect();
        m.redimensionner(Math.max(2, Math.round(r.width * ratio)),
          Math.max(2, Math.round(r.height * ratio)));
        m.rendre(etat());
      }).observe(hote);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
