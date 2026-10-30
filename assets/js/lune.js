/* ==========================================================================
   CREATIO — Une Terre sans Lune (salle 05, E07)
   Le visiteur retire le satellite et fait avancer un temps de simulation
   accéléré : l'axe terrestre se met à errer. Quatre replis : calcul graphique
   (WGSL), interface graphique (GLSL ES), dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : les valeurs 23,3° ± 1,3° et 0–85° viennent des simulations de
   Laskar, Joutel et Robutel (1993), source S009. La courbe tracée ici est une
   interpolation illustrative, pas un calcul de mécanique céleste. L'ampleur
   réelle de l'effet est DÉBATTUE (fait F-035).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-lune]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-lune-image]');
  var statut = cadre.querySelector('[data-lune-moteur]');
  var legende = cadre.querySelector('[data-lune-legende]');
  var curseur = cadre.querySelector('[data-lune-temps]');
  var sortieTemps = cadre.querySelector('[data-lune-sortie]');
  var bascule = cadre.querySelector('[data-lune-bascule]');
  var boutonReset = cadre.querySelector('[data-lune-reset]');

  var lunePresente = true;
  var moteur = null;
  var hote = null;

  /* Courbe d'errance : interpolée entre des jalons choisis pour parcourir la
     plage 0–85° du modèle de 1993. Ce n'est PAS une intégration numérique. */
  var JALONS = [23.3, 41, 68, 85, 57, 22, 3, 0, 19, 52, 79, 84];

  function temps() {
    return Math.max(0, Math.min(1, (parseFloat(curseur ? curseur.value : '0') || 0) / 1000));
  }

  function inclinaison() {
    var t = temps();
    if (lunePresente) { return 23.3 + 1.3 * Math.sin(t * Math.PI * 4); }
    var x = t * (JALONS.length - 1);
    var i = Math.floor(x);
    if (i >= JALONS.length - 1) { return JALONS[JALONS.length - 1]; }
    var f = x - i;
    return JALONS[i] * (1 - f) + JALONS[i + 1] * f;
  }

  function fr(n) { return n.toFixed(1).replace('.', ','); }

  function majLegende() {
    var t = temps();
    var axe = inclinaison();
    if (sortieTemps) {
      sortieTemps.textContent = 'Temps de simulation : ' + Math.round(t * 100) + ' %';
    }
    if (!legende) { return; }
    if (moteur && moteur.nom === 'Image JPG statique') {
      legende.innerHTML = '<strong>Inclinaison de l’axe : ' + fr(axe) + '°.</strong> ' +
        'Repli image : vue de la Terre et de la Lune en JPG. Le bouton et le curseur ' +
        'restent utilisables pour lire les valeurs du modèle.';
      return;
    }
    var debut = '<strong>Inclinaison de l’axe : ' + fr(axe) + '°.</strong> ';
    if (lunePresente) {
      legende.innerHTML = debut +
        'Avec la Lune, les simulations publiées en 1993 donnent 23,3° à plus ou moins ' +
        '1,3° (fait F-033). L’axe reste dans une plage étroite, et les saisons gardent ' +
        'leur régularité.';
    } else {
      legende.innerHTML = debut +
        'Sans la Lune, le même modèle explore une zone chaotique d’environ 0° à 85° ' +
        '(fait F-034). L’ampleur réelle de cette instabilité reste DÉBATTUE (fait F-035) : ' +
        'une stabilisation de l’axe n’établit pas que la Lune soit indispensable à toute vie.';
    }
  }

  function majImage() {
    if (image) {
      var src = '../assets/img/salles/05/s05-fond-spatial.jpg';
      if (image.getAttribute('src') !== src) {
        image.setAttribute('src', src);
        image.setAttribute('alt',
          'Fond spatial sombre destiné à recevoir une visualisation du système Terre-Lune.');
      }
      image.style.filter = lunePresente ? 'none' : 'hue-rotate(-18deg) brightness(0.88)';
    }
    cadre.setAttribute('data-etat', lunePresente ? 'avec-lune' : 'sans-lune');
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, inclinaison: f32, lune: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = (f.xy - 0.5 * u.resolution) / min(u.resolution.x, u.resolution.y);',
    '  let p = vec2<f32>(uv.x, -uv.y);',
    '  let d = length(p);',
    '  var col = vec3<f32>(0.0, 0.0, 0.0);',
    '  var a = 0.0;',
    '  // Halo atmosphérique.',
    '  let halo = exp(-abs(d - 0.178) * 88.0) * 0.50;',
    '  col = vec3<f32>(0.20, 0.46, 0.95) * halo + col * (1.0 - halo);',
    '  a = halo + a * (1.0 - halo);',
    '  // Globe terrestre stylisé, éclairé par la gauche.',
    '  let terre = 1.0 - smoothstep(0.155, 0.168, d);',
    '  let ombre = clamp(0.35 + 0.65 * (0.5 - p.x * 2.6), 0.0, 1.0);',
    '  let couleurTerre = vec3<f32>(0.10, 0.31, 0.64) * ombre + vec3<f32>(0.04, 0.09, 0.19);',
    '  let at = terre * 0.94;',
    '  col = couleurTerre * at + col * (1.0 - at);',
    '  a = at + a * (1.0 - at);',
    '  // Axe de rotation orienté selon l’inclinaison du modèle.',
    '  let ang = u.inclinaison * 0.0174533;',
    '  let dir = vec2<f32>(sin(ang), cos(ang));',
    '  let proj = dot(p, dir);',
    '  let perp = abs(p.x * dir.y - p.y * dir.x);',
    '  let axe = exp(-perp * 330.0) * step(abs(proj), 0.27);',
    '  col = vec3<f32>(1.0, 0.76, 0.32) * axe + col * (1.0 - axe);',
    '  a = axe + a * (1.0 - axe);',
    '  // Orbite et satellite, seulement si la Lune est présente.',
    '  if (u.lune > 0.5) {',
    '    let anneau = exp(-abs(d - 0.34) * 250.0) * 0.34;',
    '    col = vec3<f32>(0.45, 0.58, 0.82) * anneau + col * (1.0 - anneau);',
    '    a = anneau + a * (1.0 - anneau);',
    '    let pos = vec2<f32>(0.34 * cos(1.05), 0.34 * sin(1.05));',
    '    let dl = length(p - pos);',
    '    let disque = (1.0 - smoothstep(0.040, 0.046, dl)) * 0.95;',
    '    col = vec3<f32>(0.88, 0.86, 0.80) * disque + col * (1.0 - disque);',
    '    a = disque + a * (1.0 - disque);',
    '  }',
    '  return vec4<f32>(col, clamp(a, 0.0, 1.0));',
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
          c.width, c.height, inclinaison(), lunePresente ? 1 : 0
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
    'uniform vec2 u_res; uniform float u_incl; uniform float u_lune; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);',
    '  vec2 p = vec2(uv.x, uv.y);',
    '  float d = length(p);',
    '  vec3 col = vec3(0.0); float a = 0.0;',
    '  float halo = exp(-abs(d - 0.178) * 88.0) * 0.50;',
    '  col = vec3(0.20, 0.46, 0.95) * halo + col * (1.0 - halo);',
    '  a = halo + a * (1.0 - halo);',
    '  float terre = 1.0 - smoothstep(0.155, 0.168, d);',
    '  float ombre = clamp(0.35 + 0.65 * (0.5 - p.x * 2.6), 0.0, 1.0);',
    '  vec3 couleurTerre = vec3(0.10, 0.31, 0.64) * ombre + vec3(0.04, 0.09, 0.19);',
    '  float at = terre * 0.94;',
    '  col = couleurTerre * at + col * (1.0 - at);',
    '  a = at + a * (1.0 - at);',
    '  float ang = u_incl * 0.0174533;',
    '  vec2 dir = vec2(sin(ang), cos(ang));',
    '  float proj = dot(p, dir);',
    '  float perp = abs(p.x * dir.y - p.y * dir.x);',
    '  float axe = exp(-perp * 330.0) * step(abs(proj), 0.27);',
    '  col = vec3(1.0, 0.76, 0.32) * axe + col * (1.0 - axe);',
    '  a = axe + a * (1.0 - axe);',
    '  if (u_lune > 0.5) {',
    '    float anneau = exp(-abs(d - 0.34) * 250.0) * 0.34;',
    '    col = vec3(0.45, 0.58, 0.82) * anneau + col * (1.0 - anneau);',
    '    a = anneau + a * (1.0 - anneau);',
    '    vec2 pos = vec2(0.34 * cos(1.05), 0.34 * sin(1.05));',
    '    float dl = length(p - pos);',
    '    float disque = (1.0 - smoothstep(0.040, 0.046, dl)) * 0.95;',
    '    col = vec3(0.88, 0.86, 0.80) * disque + col * (1.0 - disque);',
    '    a = disque + a * (1.0 - disque);',
    '  }',
    '  outColor = vec4(col, clamp(a, 0.0, 1.0));',
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
    var uIncl = gl.getUniformLocation(prog, 'u_incl');
    var uLune = gl.getUniformLocation(prog, 'u_lune');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uIncl, inclinaison());
        gl.uniform1f(uLune, lunePresente ? 1 : 0);
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
        var W = c.width, H = c.height, m = Math.min(W, H);
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        // Halo atmosphérique.
        var halo = ctx.createRadialGradient(0, 0, m * 0.13, 0, 0, m * 0.21);
        halo.addColorStop(0, 'rgba(56,122,242,0)');
        halo.addColorStop(0.75, 'rgba(56,122,242,0.55)');
        halo.addColorStop(1, 'rgba(56,122,242,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, m * 0.21, 0, 6.284); ctx.fill();
        // Globe terrestre stylisé.
        var globe = ctx.createRadialGradient(-m * 0.05, -m * 0.05, m * 0.01,
          0, 0, m * 0.168);
        globe.addColorStop(0, 'rgba(72,138,220,0.94)');
        globe.addColorStop(0.65, 'rgba(24,70,150,0.94)');
        globe.addColorStop(1, 'rgba(10,26,68,0.94)');
        ctx.fillStyle = globe;
        ctx.beginPath(); ctx.arc(0, 0, m * 0.165, 0, 6.284); ctx.fill();
        ctx.strokeStyle = 'rgba(166,209,255,0.55)'; ctx.lineWidth = Math.max(1, m * 0.002);
        ctx.beginPath(); ctx.arc(0, 0, m * 0.165, 0, 6.284); ctx.stroke();
        // Axe incliné.
        var ang = inclinaison() * Math.PI / 180;
        var dx = Math.sin(ang), dy = Math.cos(ang), L = m * 0.29;
        ctx.strokeStyle = 'rgba(255,194,82,0.95)'; ctx.lineWidth = Math.max(2, m * 0.004);
        ctx.beginPath(); ctx.moveTo(-dx * L, -dy * L); ctx.lineTo(dx * L, dy * L); ctx.stroke();
        // Orbite et satellite.
        if (lunePresente) {
          ctx.strokeStyle = 'rgba(115,148,209,0.35)'; ctx.lineWidth = Math.max(1, m * 0.0015);
          ctx.beginPath(); ctx.arc(0, 0, m * 0.34, 0, 6.284); ctx.stroke();
          ctx.fillStyle = 'rgba(224,219,204,0.92)';
          ctx.beginPath();
          ctx.arc(m * 0.34 * Math.cos(1.05), m * 0.34 * Math.sin(1.05), m * 0.043, 0, 6.284);
          ctx.fill();
        }
        ctx.restore();
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
    majImage();
    majLegende();
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (bascule) {
    bascule.addEventListener('click', function () {
      lunePresente = !lunePresente;
      bascule.setAttribute('aria-pressed', lunePresente ? 'false' : 'true');
      bascule.textContent = lunePresente ? 'Retirer la Lune' : 'Remettre la Lune';
      rafraichir();
    });
  }
  if (boutonReset) {
    boutonReset.addEventListener('click', function () {
      lunePresente = true;
      if (curseur) { curseur.value = '0'; }
      if (bascule) {
        bascule.setAttribute('aria-pressed', 'false');
        bascule.textContent = 'Retirer la Lune';
      }
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
