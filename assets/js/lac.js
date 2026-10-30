/* ==========================================================================
   CREATIO — Lac virtuel et densité de l'eau (salle 07, E08)
   Le visiteur refroidit un lac de 20 °C à −2 °C : la bande d'eau à 4 °C
   (la plus dense) plonge au fond et la glace se forme en surface.
   Quatre replis : WGSL, GLSL ES, dessin 2D, image JPG. Clavier inclus.

   HONNÊTETÉ : la courbe de densité utilisée dans la légende est une parabole
   illustrative ajustée sur le maximum vérifié. Les valeurs mesurées sont
   3,98 °C, 0,999975 g/cm³ à 101,325 kPa (source S036, faits F-041, F-042,
   F-136) et 11,60 °C pour l'eau lourde (fait F-135).
   ========================================================================== */
(function () {
  'use strict';

  var cadre = document.querySelector('[data-lac]');
  if (!cadre) { return; }

  var canvas = cadre.querySelector('canvas');
  var image = cadre.querySelector('[data-lac-image]');
  var statut = cadre.querySelector('[data-lac-moteur]');
  var legende = cadre.querySelector('[data-lac-legende]');
  var curseur = cadre.querySelector('[data-lac-temperature]');
  var sortie = cadre.querySelector('[data-lac-sortie]');
  var boutonReset = cadre.querySelector('[data-lac-reset]');

  var moteur = null;
  var hote = null;

  function valeurs() {
    var t = Math.max(0, Math.min(1,
      (parseFloat(curseur ? curseur.value : '0') || 0) / 1000));
    var T = 20 - 22 * t;                                  // 20 → −2 °C
    var glace = Math.max(0, Math.min(1, -T / 2));        // 0 → 1
    var densite = 0.999975 - 0.000006 * (T - 3.98) * (T - 3.98);
    return { t: t, T: T, glace: glace, densite: densite };
  }

  function fr(n, d) {
    return n.toFixed(d === undefined ? 1 : d).replace('.', ',').replace('-', '−');
  }

  function majLegende() {
    var v = valeurs();
    if (sortie) {
      sortie.textContent = 'Température : ' + fr(v.T) + ' °C';
    }
    if (!legende) { return; }
    var debut = '<strong>Température de l’eau : ' + fr(v.T) + ' °C.</strong> ' +
      'Densité indicative : ' + fr(v.densite, 6) +
      ' gramme par centimètre cube (courbe parabolique illustrative). ';
    var milieu;
    if (Math.abs(v.T - 3.98) < 0.7) {
      milieu = 'C’est ici que l’eau est la plus dense : le maximum vérifié est ' +
        '0,999975 gramme par centimètre cube à 3,98 °C sous 101,325 kilopascal ' +
        '(source S036, faits F-041, F-042 et F-136).';
    } else if (v.T < 0) {
      milieu = 'La glace se forme en surface, tandis que l’eau à 4 °C reste au fond : ' +
        'la vie aquatique peut se maintenir sous la glace (fait F-043).';
    } else if (v.T < 4) {
      milieu = 'En dessous de 4 °C, l’eau la plus dense descend : le lac gèle par la ' +
        'surface et non par le fond (fait F-043).';
    } else {
      milieu = 'Au-dessus de 4 °C, l’eau devient moins dense en se réchauffant, comme ' +
        'la plupart des liquides.';
    }
    legende.innerHTML = debut + milieu;
  }

  /* --- 1. WGSL ----------------------------------------------------------- */
  var WGSL = [
    'struct U { resolution: vec2<f32>, temperature: f32, glace: f32, };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  return vec4<f32>(p[i], 0.0, 1.0);',
    '}',
    '@fragment fn fs(@builtin(position) f: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let uv = f.xy / u.resolution;',
    '  let h = uv.y;',
    '  var col = mix(vec3<f32>(0.10, 0.30, 0.48), vec3<f32>(0.01, 0.04, 0.13), h);',
    '  let strate = 0.5 + 0.5 * sin(h * 58.0 + u.temperature * 0.2);',
    '  col += vec3<f32>(0.05, 0.12, 0.20) * strate * 0.22;',
    '  let ep = 0.02 + u.glace * 0.15;',
    '  let glace = (1.0 - smoothstep(ep - 0.010, ep + 0.010, h)) * step(0.01, u.glace);',
    '  col = mix(col, vec3<f32>(0.72, 0.87, 0.96), glace * 0.80);',
    '  let descente = clamp((4.0 - u.temperature) / 4.0, 0.0, 1.0);',
    '  let yIso = 0.28 + 0.60 * descente;',
    '  let onde = 0.010 * sin(uv.x * 13.0 + 1.2);',
    '  let iso = exp(-abs(h - yIso - onde) * 120.0);',
    '  col += vec3<f32>(1.0, 0.72, 0.28) * iso * 0.85;',
    '  let alpha = 0.58;',
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
        var v = valeurs();
        device.queue.writeBuffer(uniformes, 0,
          new Float32Array([c.width, c.height, v.T, v.glace]));
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
    'uniform vec2 u_res; uniform float u_temp; uniform float u_glace; out vec4 outColor;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float h = 1.0 - uv.y;',
    '  vec3 col = mix(vec3(0.10, 0.30, 0.48), vec3(0.01, 0.04, 0.13), h);',
    '  float strate = 0.5 + 0.5 * sin(h * 58.0 + u_temp * 0.2);',
    '  col += vec3(0.05, 0.12, 0.20) * strate * 0.22;',
    '  float ep = 0.02 + u_glace * 0.15;',
    '  float glace = (1.0 - smoothstep(ep - 0.010, ep + 0.010, h)) * step(0.01, u_glace);',
    '  col = mix(col, vec3(0.72, 0.87, 0.96), glace * 0.80);',
    '  float descente = clamp((4.0 - u_temp) / 4.0, 0.0, 1.0);',
    '  float yIso = 0.28 + 0.60 * descente;',
    '  float onde = 0.010 * sin(uv.x * 13.0 + 1.2);',
    '  float iso = exp(-abs(h - yIso - onde) * 120.0);',
    '  col += vec3(1.0, 0.72, 0.28) * iso * 0.85;',
    '  float alpha = 0.58;',
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
    var uTemp = gl.getUniformLocation(prog, 'u_temp');
    var uGlace = gl.getUniformLocation(prog, 'u_glace');
    return {
      nom: 'Interface graphique de deuxième génération',
      redimensionner: function (w, h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); },
      rendre: function () {
        var v = valeurs();
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, c.width, c.height);
        gl.uniform1f(uTemp, v.T);
        gl.uniform1f(uGlace, v.glace);
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
        var W = c.width, H = c.height, v = valeurs();
        ctx.clearRect(0, 0, W, H);
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(26,77,122,0.58)');
        g.addColorStop(1, 'rgba(3,10,33,0.58)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // Strates d'eau.
        for (var i = 0; i < 22; i++) {
          var y = (i / 22) * H;
          ctx.fillStyle = 'rgba(120,180,230,' + (0.012 + 0.010 * Math.sin(i + v.T * 0.2)) + ')';
          ctx.fillRect(0, y, W, H / 22);
        }
        // Glace en surface.
        if (v.glace > 0.01) {
          var ep = (0.02 + v.glace * 0.15) * H;
          var gi = ctx.createLinearGradient(0, 0, 0, ep);
          gi.addColorStop(0, 'rgba(220,240,252,0.85)');
          gi.addColorStop(1, 'rgba(150,200,230,0.35)');
          ctx.fillStyle = gi; ctx.fillRect(0, 0, W, ep);
        }
        // Bande de l'eau à 4 °C.
        var descente = Math.max(0, Math.min(1, (4 - v.T) / 4));
        var yIso = (0.28 + 0.60 * descente) * H;
        ctx.strokeStyle = 'rgba(255,190,72,0.9)';
        ctx.lineWidth = Math.max(2, W * 0.0025);
        ctx.beginPath();
        for (var j = 0; j <= 100; j++) {
          var x = (j / 100) * W;
          var y = yIso + 0.010 * H * Math.sin((j / 100) * 13 + 1.2);
          if (j === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
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
  if (boutonReset) {
    boutonReset.addEventListener('click', function () {
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
