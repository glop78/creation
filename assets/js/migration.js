/* ==========================================================================
   CREATIO — Carte de migration (salle 14, E11)
   Le visiteur suit les 70 900 kilomètres annuels des sternes arctiques le
   long d'une courbe illustrative, lit les trois phases du voyage et peut
   afficher le repère du vol sans escale de la barge rousse. Quatre replis :
   WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : 70 900 km/an en moyenne, 34 600 km vers le sud à 330 km/jour,
   25 700 km de retour en 93 jours à 520 km/jour, 10 900 km de mouvements
   locaux, géolocateurs de 1,4 g viennent de Egevang 2010 (source S021 ;
   faits F-081 à F-084, F-156 à F-158). Le record de 13 560 km en 11 jours
   et 1 heure vient de S022/S023 (faits F-085, F-159, F-160). Les courbes
   tracées ici sont illustratives : ce ne sont pas les trajectoires réelles.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-migration]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-migration-moteur]');
  var legende = cadre.querySelector('[data-migration-legende]');
  var curseur = cadre.querySelector('[data-migration-distance]');
  var sortie = cadre.querySelector('[data-migration-sortie]');
  var boutonComparer = cadre.querySelector('[data-migration-comparer]');
  var boutonDepart = cadre.querySelector('[data-migration-depart]');

  var TOTAL = 70900;
  var SUD = 34600;
  var LOCAL = 45500;
  var RECORD = 13560;
  var moteur = null;
  var hote = null;
  var comparer = false;

  function fr(n) {
    var s = String(Math.round(n)).replace('-', '−');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }

  function distance() {
    return Math.max(0, Math.min(TOTAL,
      Math.round(parseFloat(curseur ? curseur.value : '0') || 0)));
  }
  function avancement() { return distance() / TOTAL; }

  function cheminY(s) { return 0.50 + 0.30 * Math.sin(s * 7.8539816); }
  function cheminX(s) { return 0.12 + 0.76 * s; }

  function majLegende() {
    var d = distance();
    if (sortie) { sortie.textContent = fr(d) + ' kilomètres parcourus'; }
    if (!legende) { return; }
    var phase;
    if (d === TOTAL) {
      phase = '<strong>Bilan annuel : ' + fr(TOTAL) + ' kilomètres.</strong> ' +
        'C’est la moyenne des onze sternes arctiques suivies en 2010, avec des ' +
        'valeurs individuelles de 59 500 à 81 600 kilomètres (source S021, fait ' +
        'F-081).';
    } else if (d >= LOCAL) {
      phase = '<strong>Distance parcourue : ' + fr(d) + ' kilomètres.</strong> ' +
        'Retour vers le nord : 25 700 kilomètres en 93 jours, soit environ ' +
        '520 kilomètres par jour — un trajet plus court mais nettement plus ' +
        'rapide que l’aller (faits F-083 et F-157).';
    } else if (d >= SUD) {
      phase = '<strong>Distance parcourue : ' + fr(d) + ' kilomètres.</strong> ' +
        'Dans la zone d’hivernage, les sternes parcourent encore en moyenne ' +
        '10 900 kilomètres de mouvements locaux (fait F-156), inclus dans le ' +
        'bilan annuel.';
    } else {
      phase = '<strong>Distance parcourue : ' + fr(d) + ' kilomètres.</strong> ' +
        'Trajet vers le sud : 34 600 kilomètres à environ 330 kilomètres par ' +
        'jour, avec une escale d’environ un mois en plein Atlantique Nord ' +
        '(fait F-082).';
    }
    var comparaison = comparer
      ? ' Repère doré : la barge rousse juvénile de 2022 a relié l’Alaska à la ' +
        'Tasmanie sans escale, 13 560 kilomètres en 11 jours et 1 heure ' +
        '(sources S022 et S023, faits F-085 et F-160).'
      : '';
    var repli = (moteur && moteur.nom === 'Image JPG statique')
      ? ' Repli image : visualisation JPG, sans trajectoire calculée.' : '';
    legende.innerHTML = phase + comparaison + repli;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, avancement: f32, comparaison: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  var dmin = 10.0;',
    '  for (var i: i32 = 0; i < 40; i = i + 1) {',
    '    let s = f32(i) / 39.0;',
    '    let px = 0.12 + 0.76 * s;',
    '    let py = 0.50 + 0.30 * sin(s * 7.8539816);',
    '    let dd = length(uv - vec2<f32>(px, py));',
    '    dmin = min(dmin, dd);',
    '  }',
    '  let ligne = exp(-dmin * 250.0);',
    '  let a = u.avancement;',
    '  let mx = 0.12 + 0.76 * a;',
    '  let my = 0.50 + 0.30 * sin(a * 7.8539816);',
    '  let point = exp(-length(uv - vec2<f32>(mx, my)) * 85.0);',
    '  let rc = 13560.0 / 70900.0;',
    '  let rx = 0.12 + 0.76 * rc;',
    '  let ry = 0.50 + 0.30 * sin(rc * 7.8539816);',
    '  let repere = exp(-length(uv - vec2<f32>(rx, ry)) * 65.0) * u.comparaison;',
    '  var couleur = vec3<f32>(0.40, 0.85, 0.96);',
    '  couleur = mix(couleur, vec3<f32>(1.0, 0.76, 0.36), step(0.488, a));',
    '  couleur = mix(couleur, vec3<f32>(0.65, 0.95, 0.75), step(0.642, a));',
    '  var col = couleur * ligne * 0.78;',
    '  col += vec3<f32>(1.0, 0.98, 0.85) * point;',
    '  col += vec3<f32>(1.0, 0.55, 0.30) * repere * 0.90;',
    '  let alpha = clamp(ligne * 0.72 + point * 0.90 + repere * 0.80, 0.0, 0.95);',
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
        device.queue.writeBuffer(uniformes, 0, new Float32Array([
          c.width, c.height, avancement(), comparer ? 1 : 0
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
    'uniform vec2 u_res; uniform float u_avance; uniform float u_comp; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float dmin = 10.0;',
    '  for (int i = 0; i < 40; i++) {',
    '    float s = float(i) / 39.0;',
    '    vec2 pt = vec2(0.12 + 0.76 * s, 0.50 + 0.30 * sin(s * 7.8539816));',
    '    dmin = min(dmin, length(uv - pt));',
    '  }',
    '  float ligne = exp(-dmin * 250.0);',
    '  float a = u_avance;',
    '  vec2 m = vec2(0.12 + 0.76 * a, 0.50 + 0.30 * sin(a * 7.8539816));',
    '  float point = exp(-length(uv - m) * 85.0);',
    '  float rc = 13560.0 / 70900.0;',
    '  vec2 r = vec2(0.12 + 0.76 * rc, 0.50 + 0.30 * sin(rc * 7.8539816));',
    '  float repere = exp(-length(uv - r) * 65.0) * u_comp;',
    '  vec3 couleur = mix(vec3(0.40, 0.85, 0.96), vec3(1.0, 0.76, 0.36), step(0.488, a));',
    '  couleur = mix(couleur, vec3(0.65, 0.95, 0.75), step(0.642, a));',
    '  vec3 col = couleur * ligne * 0.78;',
    '  col += vec3(1.0, 0.98, 0.85) * point;',
    '  col += vec3(1.0, 0.55, 0.30) * repere * 0.90;',
    '  float alpha = clamp(ligne * 0.72 + point * 0.90 + repere * 0.80, 0.0, 0.95);',
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
    var uAvance = gl.getUniformLocation(prog, 'u_avance');
    var uComp = gl.getUniformLocation(prog, 'u_comp');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uAvance, avancement());
        gl.uniform1f(uComp, comparer ? 1 : 0);
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
        var W = c.width, H = c.height, a = avancement();
        ctx.clearRect(0, 0, W, H);
        var couleur = a >= 0.642 ? 'rgba(165,240,190,0.85)'
          : (a >= 0.488 ? 'rgba(255,195,90,0.85)' : 'rgba(105,220,245,0.85)');
        ctx.strokeStyle = couleur;
        ctx.lineWidth = Math.max(2, W * 0.0026);
        ctx.beginPath();
        for (var i = 0; i <= 200; i++) {
          var s = i / 200;
          var x = cheminX(s) * W, y = cheminY(s) * H;
          if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
        // Marqueur courant.
        ctx.fillStyle = 'rgba(255,252,225,0.95)';
        ctx.beginPath();
        ctx.arc(cheminX(a) * W, cheminY(a) * H, Math.max(4, W * 0.006), 0, 6.284);
        ctx.fill();
        // Repère du record sans escale.
        if (comparer) {
          var rc = RECORD / TOTAL;
          ctx.fillStyle = 'rgba(255,145,80,0.95)';
          ctx.beginPath();
          ctx.arc(cheminX(rc) * W, cheminY(rc) * H, Math.max(3, W * 0.005), 0, 6.284);
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
    cadre.setAttribute('data-phase',
      distance() >= LOCAL ? 'retour' : (distance() >= SUD ? 'hivernage' : 'aller'));
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (boutonComparer) {
    boutonComparer.addEventListener('click', function () {
      comparer = !comparer;
      boutonComparer.setAttribute('aria-pressed', comparer ? 'true' : 'false');
      boutonComparer.textContent = comparer
        ? 'Masquer le repère de la barge rousse'
        : 'Comparer avec la barge rousse';
      cadre.setAttribute('data-comparaison', comparer ? 'oui' : 'non');
      rafraichir();
    });
  }
  if (boutonDepart) {
    boutonDepart.addEventListener('click', function () {
      if (curseur) { curseur.value = '0'; }
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
    cadre.setAttribute('data-comparaison', 'non');
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
