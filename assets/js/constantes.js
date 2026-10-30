/* ==========================================================================
   CREATIO — Simulateur des constantes (salle 02, E05)
   MODÈLE PÉDAGOGIQUE SIMPLIFIÉ. Il illustre une sensibilité publiée dans
   Oberhummer, Csótó et Schlattl (Science, 2000) : une variation de 0,5 %
   de la force nucléaire forte ou de 4 % de la force coulombienne réduit la
   production stellaire de carbone ou d'oxygène d'un facteur 30 à 1 000.
   Le calcul ci-dessous est une courbe de Gauss choisie pour LA PÉDAGOGIE,
   pas un calcul de nucléosynthèse. Aucune valeur affichée n'est une mesure.

   Quatre replis : interface de calcul graphique (WGSL), interface graphique
   de deuxième génération (GLSL ES), dessin en deux dimensions, image JPG.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-constantes]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-constantes-image]');
  var statut = cadre.querySelector('[data-constantes-moteur]');
  var resultat = cadre.querySelector('[data-constantes-resultat]');
  var boutonReset = cadre.querySelector('[data-constantes-reset]');
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Curseurs : pourcentage de variation autour des valeurs de notre Univers. */
  var entrees = {
    forte: cadre.querySelector('[data-const="forte"]'),
    coulomb: cadre.querySelector('[data-const="coulomb"]'),
    vide: cadre.querySelector('[data-const="vide"]')
  };
  var sorties = {
    forte: cadre.querySelector('[data-val="forte"]'),
    coulomb: cadre.querySelector('[data-val="coulomb"]'),
    vide: cadre.querySelector('[data-val="vide"]')
  };

  var valeurs = { forte: 0, coulomb: 0, vide: 0 };
  var moteur = null;

  /* --- Modèle pédagogique -------------------------------------------------
     production = 100 × exp(−(variation / largeur)²)
     largeur (force forte)  = 0,5 % → facteur ~30 à 1 000 selon le seuil
     largeur (coulombienne) = 4,0 %
     Le vide n'agit PAS sur la production : il est affiché comme un repère
     distinct, car aucune relation quantitative simple n'est publiée.
     On le représente par un facteur d'« expansion » purement illustratif.
     Le plancher est fixé à 0,1 % (facteur 1 000), cohérent avec l'article. */
  function production(variation, largeur) {
    var x = variation / largeur;
    return Math.max(0.1, 100 * Math.exp(-(x * x)));
  }

  function lire() {
    for (var cle in entrees) {
      if (entrees[cle]) { valeurs[cle] = parseFloat(entrees[cle].value) || 0; }
    }
  }

  function afficherValeurs() {
    for (var cle in sorties) {
      if (!sorties[cle]) { continue; }
      var v = valeurs[cle];
      // R06 : aucun signe « + » visible, même pour une valeur mathématique.
      // Le sens de la variation est dit en toutes lettres, en français.
      var sens = v > 0 ? 'augmentation de ' : 'diminution de ';
      var texte;
      if (cle === 'vide') {
        texte = v === 0 ? 'Valeur observée (référence)' :
          (sens + Math.abs(v).toFixed(0) + ' ordres de grandeur (illustration)');
      } else {
        texte = v === 0 ? 'Valeur de notre Univers' :
          (sens + Math.abs(v).toFixed(2).replace('.', ',') + ' %');
      }
      sorties[cle].textContent = texte;
    }
  }

  function calculer() {
    var c = production(valeurs.forte, 0.5) * production(valeurs.coulomb, 4.0) / 100;
    return Math.max(0.1, Math.min(100, c));
  }

  function annoncer() {
    if (!resultat) { return; }
    var c = calculer();
    var phrase;
    if (c > 95) {
      phrase = 'Production de carbone proche de celle de notre Univers.';
    } else if (c > 30) {
      phrase = 'Production de carbone réduite.';
    } else if (c > 1) {
      phrase = 'Production de carbone fortement réduite.';
    } else {
      phrase = 'Production de carbone presque éteinte dans ce modèle.';
    }
    resultat.textContent = phrase + ' Indice illustratif : ' +
      c.toFixed(1).replace('.', ',') + ' % de la référence.';
  }

  function majImage() {
    if (!image) { return; }
    var c = calculer();
    var nom = c > 30 ? 's02-noyau-carbone' : (c > 1 ? 's02-coeur-etoile' : 's02-vide-quantique');
    var src = '../assets/img/salles/02/' + nom + '.jpg';
    if (image.getAttribute('src') !== src) {
      image.setAttribute('src', src);
      image.setAttribute('alt', c > 30 ?
        'Trois sphères lumineuses représentant un noyau de carbone 12.' :
        (c > 1 ? 'Plasma incandescent au cœur d’une étoile géante.' :
          'Vide sombre parcouru de minuscules lueurs fugaces.'));
    }
  }

  /* --- 1. Interface de calcul graphique (WGSL) --------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, carbone: f32, temps: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let t = u.carbone / 100.0;',
    '  let dx = uv.x - 0.30;',
    '  let dy = uv.y - 0.75;',
    '  let g = exp(-(dx + dy) * 3.0) * (0.35 + 0.65 * t);',
    '  let halo = exp(-length(vec2<f32>(dx * 2.2, dy * 1.1)) * 5.0) * t;',
    '  let col = vec3<f32>(0.90 * g + 0.25 * halo, 0.77 * g + 0.18 * halo, 0.42 * g + 0.10 * halo);',
    '  let alpha = clamp(g + halo, 0.0, 0.8);',
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
    var tampon = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    var groupe = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: tampon } }] });
    return {
      nom: 'Interface de calcul graphique de nouvelle génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (carbone) {
        if (!c.width || !c.height) { return; }
        device.queue.writeBuffer(tampon, 0,
          new Float32Array([c.width, c.height, carbone, 0]));
        var enc = device.createCommandEncoder();
        var passe = enc.beginRenderPass({ colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }] });
        passe.setPipeline(pipeline);
        passe.setBindGroup(0, groupe);
        passe.draw(3);
        passe.end();
        device.queue.submit([enc.finish()]);
      },
      arreter: function () {}
    };
  }

  /* --- 2. Interface graphique de deuxième génération (GLSL ES) ----------- */
  var GVS = ['#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}'].join('\n');
  var GFS = ['#version 300 es', 'precision highp float;',
    'uniform vec2 u_res; uniform float u_carbone; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res; uv.y = 1.0 - uv.y;',
    '  float t = u_carbone / 100.0;',
    '  float dx = uv.x - 0.30; float dy = uv.y - 0.75;',
    '  float g = exp(-(dx + dy) * 3.0) * (0.35 + 0.65 * t);',
    '  float halo = exp(-length(vec2(dx * 2.2, dy * 1.1)) * 5.0) * t;',
    '  vec3 col = vec3(0.90 * g + 0.25 * halo, 0.77 * g + 0.18 * halo, 0.42 * g + 0.10 * halo);',
    '  float a = clamp(g + halo, 0.0, 0.8);',
    '  outColor = vec4(col * a, a);',
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uCar = gl.getUniformLocation(prog, 'u_carbone');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function (carbone) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uCar, carbone);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      arreter: function () { gl.deleteProgram(prog); }
    };
  }

  /* --- 3. Dessin en deux dimensions + courbe lisible --------------------- */
  function creerCanvas2D(c) {
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    return {
      nom: 'Dessin procédural en deux dimensions',
      redimensionner: function (w, h) { c.width = w; c.height = h; },
      rendre: function (carbone) {
        var w = c.width, h = c.height;
        ctx.clearRect(0, 0, w, h);
        /* Axe de variation et deux courbes de production. */
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(244, 241, 234, 0.28)';
        ctx.lineWidth = Math.max(1, w / 900);
        ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.82); ctx.lineTo(w * 0.94, h * 0.82); ctx.stroke();
        var courbes = [
          { largeur: 0.5, couleur: 'rgba(230, 196, 106, 0.95)', etiquette: 'Force forte' },
          { largeur: 4.0, couleur: 'rgba(143, 163, 240, 0.95)', etiquette: 'Force coulombienne' }
        ];
        courbes.forEach(function (courbe) {
          ctx.beginPath();
          for (var i = 0; i <= 120; i++) {
            var delta = -8 + (i / 120) * 16;
            var p = production(delta, courbe.largeur);
            var x = w * (0.08 + 0.86 * i / 120);
            var y = h * (0.82 - 0.62 * p / 100);
            if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
          }
          ctx.strokeStyle = courbe.couleur;
          ctx.lineWidth = Math.max(1.5, w / 520);
          ctx.stroke();
        });
        /* Point courant. */
        var py = h * (0.82 - 0.62 * carbone / 100);
        ctx.beginPath();
        ctx.arc(w * 0.51, py, Math.max(4, w / 200), 0, Math.PI * 2);
        ctx.fillStyle = '#F6E4B0'; ctx.fill();
        ctx.globalAlpha = 1;
      },
      arreter: function () {}
    };
  }

  /* --- 4. Image seule ----------------------------------------------------- */
  function creerImageSeule(c) {
    c.style.display = 'none';
    return {
      nom: 'Image JPG statique',
      redimensionner: function () {},
      rendre: function () {},
      arreter: function () {}
    };
  }

  function nouveauCanvas() {
    var ancien = cadre.querySelector('canvas');
    var frais = document.createElement('canvas');
    frais.setAttribute('aria-hidden', 'true');
    ancien.replaceWith(frais);
    return frais;
  }

  function rafraichir() {
    lire();
    afficherValeurs();
    annoncer();
    majImage();
    if (moteur) { moteur.rendre(calculer()); }
  }

  for (var cle in entrees) {
    if (entrees[cle]) { entrees[cle].addEventListener('input', rafraichir); }
  }
  if (boutonReset) {
    boutonReset.addEventListener('click', function () {
      for (var k in entrees) {
        if (entrees[k]) { entrees[k].value = '0'; }
      }
      rafraichir();
    });
  }

  async function demarrer() {
    var c = nouveauCanvas();
    // Le canvas occupe la figure (16:9), pas le cadre entier qui contient
    // aussi les curseurs : mesurer le cadre étirerait le dessin.
    var hote = c.parentElement || cadre;
    var rect = hote.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(2, Math.round(rect.width * ratio));
    var h = Math.max(2, Math.round(rect.height * ratio));
    var m = null;
    try { m = await creerWebGPU(c); } catch (e) { m = null; }
    if (!m) { c = nouveauCanvas(); try { m = creerWebGL2(c); } catch (e) { m = null; } }
    if (!m) { c = nouveauCanvas(); try { m = creerCanvas2D(c); } catch (e) { m = null; } }
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
        m.rendre(calculer());
      }).observe(hote);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer().catch(function () {}); });
  } else { demarrer().catch(function () {}); }
}());
