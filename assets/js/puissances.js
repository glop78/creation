/* ==========================================================================
   CREATIO — Voyage entre les échelles (E04)
   Quatre niveaux de repli, du plus riche au plus sobre :
     1. interface de calcul graphique de nouvelle génération (WebGPU, WGSL) ;
     2. interface graphique de deuxième génération (WebGL2, GLSL ES) ;
     3. dessin procédural en Canvas 2D ;
     4. simple image JPG, sans aucun script graphique.
   Le clavier, les boutons et la galerie restent actifs dans tous les cas.
   Aucun appel réseau, aucune bibliothèque externe, aucun traceur.
   ========================================================================== */
(function () {
  'use strict';

  var scene = document.querySelector('[data-px-scene]');
  if (!scene) { return; }

  var donnees = [];
  var noeud = document.getElementById('px-donnees');
  try { donnees = JSON.parse(noeud ? noeud.textContent : '[]'); } catch (e) { donnees = []; }
  if (!donnees.length) { return; }

  var image = scene.querySelector('[data-px-image]');
  var legendeEchelle = scene.querySelector('[data-px-echelle]');
  var legendeTitre = scene.querySelector('[data-px-titre]');
  var legendeSource = scene.querySelector('[data-px-source]');
  var statut = document.querySelector('[data-px-moteur]');
  var boutonLecture = document.querySelector('[data-px-lecture]');

  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var indexCourant = 0;
  var tempsFigee = reduit ? 4.0 : null;
  var lecture = null;
  var moteur = null;          // objet {rendre, redimensionner, arreter}
  var raf = 0;

  function remplacerCanvas() {
    var ancien = scene.querySelector('canvas');
    var frais = document.createElement('canvas');
    frais.className = ancien ? ancien.className : 'px-canvas';
    frais.setAttribute('aria-hidden', 'true');
    if (ancien) { ancien.replaceWith(frais); }
    else if (image) { image.after(frais); }
    else { scene.prepend(frais); }
    return frais;
  }

  function taille() {
    var rect = scene.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    return {
      w: Math.max(2, Math.round(rect.width * ratio)),
      h: Math.max(2, Math.round(rect.height * ratio))
    };
  }

  /* --- 1. WebGPU --------------------------------------------------------- */
  var WGSL = [
    'struct Uniforms { resolution: vec2<f32>, time: f32, step: f32, };',
    '@group(0) @binding(0) var<uniform> u: Uniforms;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    'fn hash(p: vec2<f32>) -> f32 {',
    '  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);',
    '}',
    '@fragment fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = (frag.xy - 0.5 * u.resolution) / min(u.resolution.x, u.resolution.y);',
    '  let r = length(uv);',
    '  let a = atan2(uv.y, uv.x);',
    '  var acc = 0.0;',
    '  for (var k = 0; k < 6; k = k + 1) {',
    '    let fk = f32(k);',
    '    let couche = fract(fk / 6.0 + r * 1.6 - u.time * 0.05);',
    '    let anneau = exp(-40.0 * abs(couche - 0.5));',
    '    let grain = hash(floor(vec2<f32>(a * 60.0, r * 90.0)) + fk * 17.0 + floor(u.time * 0.4));',
    '    acc = acc + anneau * step(0.93, grain) * (0.6 + 0.4 * sin(u.step * 0.7 + fk));',
    '  }',
    '  let col = mix(vec3<f32>(0.05, 0.08, 0.18), vec3<f32>(0.90, 0.77, 0.42), clamp(acc * 0.9, 0.0, 1.0));',
    '  let alpha = clamp(acc * 0.55, 0.0, 0.55);',
    '  return vec4<f32>(col * alpha, alpha);',
    '}'
  ].join('\n');

  async function creerWebGPU(canvas) {
    if (!navigator.gpu) { return null; }
    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { return null; }
    var device = await adapter.requestDevice();
    if (!device) { return null; }
    var contexte = canvas.getContext('webgpu');
    if (!contexte) { return null; }
    var format = navigator.gpu.getPreferredCanvasFormat();
    contexte.configure({ device: device, format: format, alphaMode: 'premultiplied' });

    var module = device.createShaderModule({ code: WGSL });
    var pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: module, entryPoint: 'vs' },
      fragment: {
        module: module, entryPoint: 'fs',
        targets: [{
          format: format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    });
    var tampon = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    var groupe = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: tampon } }]
    });

    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { canvas.width = w; canvas.height = h; },
      rendre: function (t) {
        var w = canvas.width, h = canvas.height;
        if (!w || !h) { return; }
        device.queue.writeBuffer(tampon, 0,
          new Float32Array([w, h, tempsFigee === null ? t : tempsFigee, indexCourant]));
        var encodeur = device.createCommandEncoder();
        var passe = encodeur.beginRenderPass({
          colorAttachments: [{
            view: contexte.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
          }]
        });
        passe.setPipeline(pipeline);
        passe.setBindGroup(0, groupe);
        passe.draw(3);
        passe.end();
        device.queue.submit([encodeur.finish()]);
      },
      arreter: function () { /* aucun thread à arrêter */ }
    };
  }

  /* --- 2. WebGL2 ---------------------------------------------------------- */
  var GLSL_VS = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var GLSL_FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 u_resolution;',
    'uniform float u_time;',
    'uniform float u_step;',
    'out vec4 outColor;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);',
    '  float r = length(uv);',
    '  float a = atan(uv.y, uv.x);',
    '  float acc = 0.0;',
    '  for (int k = 0; k < 6; k++) {',
    '    float fk = float(k);',
    '    float couche = fract(fk / 6.0 + r * 1.6 - u_time * 0.05);',
    '    float anneau = exp(-40.0 * abs(couche - 0.5));',
    '    float grain = hash(floor(vec2(a * 60.0, r * 90.0)) + fk * 17.0 + floor(u_time * 0.4));',
    '    acc += anneau * step(0.93, grain) * (0.6 + 0.4 * sin(u_step * 0.7 + fk));',
    '  }',
    '  vec3 col = mix(vec3(0.05, 0.08, 0.18), vec3(0.90, 0.77, 0.42), clamp(acc * 0.9, 0.0, 1.0));',
    '  float alpha = clamp(acc * 0.55, 0.0, 0.55);',
    '  outColor = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  function compiler(gl, type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[CREATIO] nuanceur ignoré : ' + gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function creerWebGL2(canvas) {
    var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) { return null; }
    var vs = compiler(gl, gl.VERTEX_SHADER, GLSL_VS);
    var fs = compiler(gl, gl.FRAGMENT_SHADER, GLSL_FS);
    if (!vs || !fs) { return null; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { return null; }
    gl.useProgram(prog);
    var uRes = gl.getUniformLocation(prog, 'u_resolution');
    var uTemps = gl.getUniformLocation(prog, 'u_time');
    var uEtape = gl.getUniformLocation(prog, 'u_step');
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (t) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTemps, tempsFigee === null ? t : tempsFigee);
        gl.uniform1f(uEtape, indexCourant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); gl.deleteVertexArray(vao); }
    };
  }

  /* --- 3. Canvas 2D ------------------------------------------------------- */
  function creerCanvas2D(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) { return null; }
    return {
      nom: 'Dessin procédural en deux dimensions',
      redimensionner: function (w, h) { canvas.width = w; canvas.height = h; },
      rendre: function (t) {
        var w = canvas.width, h = canvas.height, m = Math.min(w, h);
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        var temps = tempsFigee === null ? t : tempsFigee;
        for (var k = 0; k < 6; k++) {
          var phase = (k / 6 + temps * 0.05) % 1;
          var rayon = m * (0.08 + phase * 0.72);
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, rayon, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(230, 196, 106, ' + (0.10 * (1 - phase)).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, m * 0.004);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      },
      arreter: function () { /* rien */ }
    };
  }

  /* --- 4. Image seule ----------------------------------------------------- */
  function creerImageSeule(canvas) {
    canvas.style.display = 'none';
    return {
      nom: 'Image JPG statique',
      redimensionner: function () { /* rien */ },
      rendre: function () { /* rien */ },
      arreter: function () { /* rien */ }
    };
  }

  /* --- Boucle et synchronisation ----------------------------------------- */
  function boucle(ms) {
    if (!moteur) { return; }
    moteur.rendre(ms / 1000);
    if (tempsFigee === null) { raf = requestAnimationFrame(boucle); }
  }

  function majLegende(i) {
    var e = donnees[i];
    if (!e) { return; }
    if (legendeEchelle) { legendeEchelle.textContent = e.puissance; }
    if (legendeTitre) { legendeTitre.textContent = e.titre; }
    if (legendeSource) { legendeSource.textContent = 'Fait ' + e.fait + ' · ' + e.source; }
  }

  function majImage(i) {
    if (!image) { return; }
    var e = donnees[i];
    if (!e) { return; }
    var src = e.image;
    if (image.getAttribute('src') === src) { return; }
    image.setAttribute('alt', e.alt);
    if (reduit) {
      image.src = src;
      return;
    }
    image.classList.add('px-image-sortante');
    window.setTimeout(function () {
      image.src = src;
      image.classList.remove('px-image-sortante');
    }, 180);
  }

  function definirEtape(i) {
    indexCourant = Math.max(0, Math.min(donnees.length - 1, i));
    scene.style.setProperty('--px-zoom', (1 + indexCourant * 0.012).toFixed(3));
    majLegende(indexCourant);
    majImage(indexCourant);
    if (tempsFigee !== null && moteur) { moteur.rendre(0); }
  }

  document.addEventListener('creatio:etape', function (ev) {
    if (ev && ev.detail && typeof ev.detail.index === 'number') {
      definirEtape(ev.detail.index);
    }
  });

  function arreterLecture() {
    if (lecture) { window.clearInterval(lecture); lecture = null; }
    if (boutonLecture) {
      boutonLecture.textContent = 'Lecture automatique';
      boutonLecture.setAttribute('aria-pressed', 'false');
    }
  }

  if (boutonLecture) {
    if (reduit) {
      boutonLecture.hidden = true;
    } else {
      boutonLecture.addEventListener('click', function () {
        if (lecture) { arreterLecture(); return; }
        boutonLecture.textContent = 'Arrêter la lecture';
        boutonLecture.setAttribute('aria-pressed', 'true');
        if (window.CREATIO_PX && window.CREATIO_PX.aller) {
          window.CREATIO_PX.aller(0, false, true);
        }
        lecture = window.setInterval(function () {
          var etat = window.CREATIO_PX;
          var courante = etat ? etat.courante : indexCourant;
          if (courante >= donnees.length - 1) { arreterLecture(); return; }
          if (etat && etat.aller) { etat.aller(courante + 1, false, true); }
        }, 3600);
      });
    }
  }

  function redimensionner() {
    if (!moteur) { return; }
    var d = taille();
    moteur.redimensionner(d.w, d.h);
    if (tempsFigee !== null) { moteur.rendre(0); }
  }

  async function demarrer() {
    var canvas = remplacerCanvas();
    var d = taille();
    var candidats = [];

    try { candidats.push(await creerWebGPU(canvas)); } catch (e) { /* repli */ }

    if (!candidats[0]) {
      canvas = remplacerCanvas();
      try { candidats[0] = creerWebGL2(canvas); } catch (e) { candidats[0] = null; }
    }
    if (!candidats[0]) {
      canvas = remplacerCanvas();
      try { candidats[0] = creerCanvas2D(canvas); } catch (e) { candidats[0] = null; }
    }
    if (!candidats[0]) {
      canvas = remplacerCanvas();
      candidats[0] = creerImageSeule(canvas);
    }

    moteur = candidats[0];
    scene.setAttribute('data-moteur', moteur.nom);
    if (statut) { statut.textContent = 'Rendu actif : ' + moteur.nom + '.'; }
    moteur.redimensionner(d.w, d.h);
    definirEtape(indexCourant);
    raf = requestAnimationFrame(boucle);

    if (window.ResizeObserver) {
      var obs = new ResizeObserver(function () { redimensionner(); });
      obs.observe(scene);
    } else {
      window.addEventListener('resize', redimensionner);
    }
    window.addEventListener('pagehide', function () {
      cancelAnimationFrame(raf);
      arreterLecture();
      if (moteur) { moteur.arreter(); }
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else {
    demarrer().catch(function () {});
  }
}());
