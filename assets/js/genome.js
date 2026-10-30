/* ==========================================================================
   CREATIO — Atelier du génome minimal (salle 11, E10)
   Le visiteur parcourt les 473 gènes de JCVI-syn3.0 et peut isoler les 149
   gènes de fonction inconnue. Quatre replis : WGSL, GLSL ES, dessin 2D,
   image JPG. Clavier inclus.

   HONNÊTETÉ : 531 000 paires de bases, 473 gènes, temps de doublement
   d'environ 180 minutes et 149 gènes de fonction inconnue sont les valeurs
   publiées par Hutchison et ses collègues en 2016 (source S019 ; faits
   F-066, F-067, F-150, F-151). La répartition des segments sur l'anneau est
   illustrative et ne simule aucune expérience : aucun seuil de viabilité
   n'est publié. Le génome a été transplanté dans une cellule receveuse déjà
   vivante (F-068) ; ce n'est pas une création de la vie ex nihilo.
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-genome]');
  if (!cadre) { return; }

  var statut = cadre.querySelector('[data-genome-moteur]');
  var legende = cadre.querySelector('[data-genome-legende]');
  var curseur = cadre.querySelector('[data-genome-genes]');
  var sortie = cadre.querySelector('[data-genome-sortie]');
  var boutonInconnus = cadre.querySelector('[data-genome-inconnus]');
  var boutonZero = cadre.querySelector('[data-genome-zero]');

  var TOTAL = 473;
  var INCONNUS = 149;
  var moteur = null;
  var hote = null;
  var isoler = false;

  function fr(n) {
    var s = String(Math.round(n)).replace('-', '−');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  }

  function examins() {
    return Math.max(0, Math.min(TOTAL,
      Math.round(parseFloat(curseur ? curseur.value : '0') || 0)));
  }

  function majLegende() {
    var n = examins();
    if (sortie) {
      sortie.textContent = fr(n) + ' gène' + (n > 1 ? 's' : '') +
        ' examiné' + (n > 1 ? 's' : '') + ' sur ' + fr(TOTAL);
    }
    if (!legende) { return; }
    var debut = '<strong>Gènes examinés : ' + fr(n) + ' sur ' + fr(TOTAL) + '.</strong> ';
    var milieu;
    if (n === 0) {
      milieu = 'Faites avancer le curseur pour parcourir le génome minimal ' +
        'JCVI-syn3.0 : 531 000 paires de bases et 473 gènes, publiés en 2016 ' +
        'par Hutchison et ses collègues (source S019, fait F-066).';
    } else if (n === TOTAL) {
      milieu = 'Vous avez parcouru les 473 gènes. La cellule se réplique avec un ' +
        'temps de doublement d’environ 180 minutes (fait F-066), mais ce génome ' +
        'n’a pas été assemblé à partir de matière inerte : il a été conçu, ' +
        'synthétisé puis transplanté dans une cellule receveuse déjà vivante ' +
        '(fait F-068).';
    } else {
      milieu = 'Le génome minimal JCVI-syn3.0 compte 531 000 paires de bases et ' +
        '473 gènes (2016, source S019, fait F-066).';
    }
    var suite = ' Parmi eux, 149 avaient une fonction encore inconnue en 2016, ' +
      'soit environ 31 % (fait F-067) : un génome minimal n’est pas un génome ' +
      'entièrement compris.';
    var isolement = isoler
      ? ' Les segments dorés représentent ces 149 gènes ; leur répartition sur ' +
        'l’anneau est illustrative, seul le compte de 149 est publié.'
      : '';
    if (moteur && moteur.nom === 'Image JPG statique') {
      suite += ' Repli image : visualisation JPG, sans segments calculés.';
    }
    legende.innerHTML = debut + milieu + suite + isolement;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, progression: f32, isoler: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let echelle = min(u.resolution.x, u.resolution.y);',
    '  let p = (f.xy - 0.5 * u.resolution) / echelle;',
    '  let r = length(p);',
    '  let a = atan2(p.y, p.x);',
    '  let q = (a + 3.14159265) / 6.2831853;',
    '  let seg = floor(q * 473.0);',
    '  let rang = seg * 173.0 - 473.0 * floor(seg * 173.0 / 473.0);',
    '  let inconnu = step(324.0, rang);',
    '  let examine = step(seg / 473.0, u.progression);',
    '  let perle = pow(0.5 + 0.5 * cos(q * 473.0 * 6.2831853), 8.0);',
    '  let anneau = exp(-abs(r - 0.31) * 72.0);',
    '  let base = vec3<f32>(0.16, 0.26, 0.34);',
    '  let connu = vec3<f32>(0.40, 0.86, 0.96);',
    '  let dore = vec3<f32>(1.0, 0.76, 0.36);',
    '  var teinte = mix(base, connu, examine);',
    '  teinte = mix(teinte, dore, inconnu * u.isoler * examine);',
    '  var col = teinte * perle * anneau;',
    '  col += vec3<f32>(0.30, 0.70, 0.80) * exp(-r * 9.0) * 0.20;',
    '  let alpha = clamp(perle * anneau * 0.90 + exp(-r * 9.0) * 0.16, 0.0, 0.94);',
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
          c.width, c.height, examins() / TOTAL, isoler ? 1 : 0
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
    'uniform vec2 u_res; uniform float u_prog; uniform float u_isoler; out vec4 outColor;',
    'void main() {',
    '  vec2 f = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float echelle = min(u_res.x, u_res.y);',
    '  vec2 p = (f - 0.5 * u_res) / echelle;',
    '  float r = length(p);',
    '  float a = atan(p.y, p.x);',
    '  float q = (a + 3.14159265) / 6.2831853;',
    '  float seg = floor(q * 473.0);',
    '  float rang = seg * 173.0 - 473.0 * floor(seg * 173.0 / 473.0);',
    '  float inconnu = step(324.0, rang);',
    '  float examine = step(seg / 473.0, u_prog);',
    '  float perle = pow(0.5 + 0.5 * cos(q * 473.0 * 6.2831853), 8.0);',
    '  float anneau = exp(-abs(r - 0.31) * 72.0);',
    '  vec3 base = vec3(0.16, 0.26, 0.34);',
    '  vec3 connu = vec3(0.40, 0.86, 0.96);',
    '  vec3 dore = vec3(1.0, 0.76, 0.36);',
    '  vec3 teinte = mix(base, connu, examine);',
    '  teinte = mix(teinte, dore, inconnu * u_isoler * examine);',
    '  vec3 col = teinte * perle * anneau;',
    '  col += vec3(0.30, 0.70, 0.80) * exp(-r * 9.0) * 0.20;',
    '  float alpha = clamp(perle * anneau * 0.90 + exp(-r * 9.0) * 0.16, 0.0, 0.94);',
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
    var uProg = gl.getUniformLocation(prog, 'u_prog');
    var uIso = gl.getUniformLocation(prog, 'u_isoler');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uProg, examins() / TOTAL);
        gl.uniform1f(uIso, isoler ? 1 : 0);
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
        var W = c.width, H = c.height, R = Math.min(W, H);
        var cx = W / 2, cy = H / 2, n = examins();
        ctx.clearRect(0, 0, W, H);
        var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.32);
        halo.addColorStop(0, 'rgba(70,160,180,0.16)');
        halo.addColorStop(1, 'rgba(70,160,180,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, 6.284); ctx.fill();
        for (var i = 0; i < TOTAL; i++) {
          var a = (i / TOTAL) * 6.2831853 - 1.5707963;
          var x = cx + Math.cos(a) * R * 0.31;
          var y = cy + Math.sin(a) * R * 0.31;
          var rang = (i * 173) % TOTAL;
          var inconnu = rang >= 324;
          var examine = (i / TOTAL) <= (n / TOTAL);
          var couleur;
          if (!examine) { couleur = 'rgba(45,70,90,0.55)'; }
          else if (isoler && inconnu) { couleur = 'rgba(255,195,90,0.95)'; }
          else { couleur = 'rgba(105,220,245,0.90)'; }
          ctx.fillStyle = couleur;
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, R * 0.0055), 0, 6.284); ctx.fill();
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
    if (moteur) { moteur.rendre(); }
  }

  if (curseur) { curseur.addEventListener('input', rafraichir); }
  if (boutonInconnus) {
    boutonInconnus.addEventListener('click', function () {
      isoler = !isoler;
      boutonInconnus.setAttribute('aria-pressed', isoler ? 'true' : 'false');
      boutonInconnus.textContent = isoler
        ? 'Ne plus isoler les gènes inconnus'
        : 'Isoler les 149 gènes inconnus';
      cadre.setAttribute('data-isolement', isoler ? 'oui' : 'non');
      rafraichir();
    });
  }
  if (boutonZero) {
    boutonZero.addEventListener('click', function () {
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
    cadre.setAttribute('data-isolement', 'non');
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
