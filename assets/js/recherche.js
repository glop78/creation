/* CREATIO — recherche plein texte côté client (E18).
   Lit l'index local assets/data/recherche-index.json (mis en cache par le
   service worker : la recherche fonctionne hors connexion). Aucune requête
   extérieure, aucune donnée enregistrée. Tous les mots saisis doivent être
   présents (sans tenir compte des accents ni des majuscules). Les extraits sont
   construits avec des nœuds DOM (jamais innerHTML) et les mots trouvés sont
   balisés <mark>. Le nombre de résultats est annoncé (role="status"). */
(function () {
  "use strict";
  var racine = document.querySelector("[data-recherche]");
  if (!racine) return;
  var formulaire = racine.querySelector("form");
  var champ = racine.querySelector("input[type=search]");
  var etat = racine.querySelector("[data-recherche-etat]");
  var liste = racine.querySelector("[data-recherche-resultats]");
  var prefixe = racine.getAttribute("data-prefixe") || "../";
  var source = racine.getAttribute("data-index");
  var index = null;
  var chargement = null;
  var minuterie = null;
  var MAX = 20;

  function sansAccents(c) {
    return c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  /* Texte normalisé + table de correspondance vers les positions d'origine. */
  function normaliserAvecCarte(t) {
    var n = "", carte = [];
    for (var i = 0; i < t.length; i++) {
      var c = sansAccents(t.charAt(i));
      for (var k = 0; k < c.length; k++) { n += c.charAt(k); carte.push(i); }
    }
    carte.push(t.length);
    return { n: n, carte: carte };
  }
  function termes(q) {
    return sansAccents(q).split(/[\s'’,;:.!?«»()"-]+/).filter(function (m) { return m.length >= 2; });
  }
  function compter(hay, mot) {
    var n = 0, p = hay.indexOf(mot);
    while (p !== -1 && n < 50) { n++; p = hay.indexOf(mot, p + mot.length); }
    return n;
  }
  function charger() {
    if (index) return Promise.resolve(index);
    if (!chargement) {
      chargement = fetch(source).then(function (r) {
        if (!r.ok) throw new Error("index " + r.status);
        return r.json();
      }).then(function (donnees) {
        index = donnees.filter(function (p) { return p.url !== "pages/recherche.html"; }).map(function (p) {
          var t = normaliserAvecCarte(p.texte);
          return { titre: p.titre, url: p.url, resume: p.resume || "", texte: p.texte,
                   nTitre: sansAccents(p.titre), nResume: sansAccents(p.resume || ""), nTexte: t.n, carte: t.carte };
        });
        return index;
      });
    }
    return chargement;
  }
  function extrait(p, mots) {
    var pos = -1;
    mots.forEach(function (m) { var i = p.nTexte.indexOf(m); if (i !== -1 && (pos === -1 || i < pos)) pos = i; });
    var frag = document.createElement("p");
    frag.className = "recherche-extrait";
    if (pos === -1) { frag.textContent = p.resume; return frag; }
    var debutN = Math.max(0, pos - 90), finN = Math.min(p.nTexte.length, pos + 170);
    var debut = p.carte[debutN], fin = p.carte[finN];
    var morceau = p.texte.slice(debut, fin);
    var nMorceau = normaliserAvecCarte(morceau);
    /* Repérage des intervalles à surligner dans le morceau. */
    var zones = [];
    mots.forEach(function (m) {
      var i = nMorceau.n.indexOf(m);
      while (i !== -1) { zones.push([nMorceau.carte[i], nMorceau.carte[i + m.length]]); i = nMorceau.n.indexOf(m, i + m.length); }
    });
    zones.sort(function (a, b) { return a[0] - b[0]; });
    var curseur = 0;
    if (debut > 0) frag.appendChild(document.createTextNode("… "));
    zones.forEach(function (z) {
      if (z[0] < curseur) return;
      frag.appendChild(document.createTextNode(morceau.slice(curseur, z[0])));
      var mk = document.createElement("mark");
      mk.textContent = morceau.slice(z[0], z[1]);
      frag.appendChild(mk);
      curseur = z[1];
    });
    frag.appendChild(document.createTextNode(morceau.slice(curseur) + (fin < p.texte.length ? " …" : "")));
    return frag;
  }
  function afficher(q) {
    var mots = termes(q);
    while (liste.firstChild) liste.removeChild(liste.firstChild);
    if (!mots.length) {
      etat.textContent = q.trim() ? "Saisissez au moins deux lettres par mot." : "Saisissez un ou plusieurs mots, par exemple « gecko » ou « constante ».";
      return;
    }
    var trouves = [];
    index.forEach(function (p) {
      var score = 0;
      for (var i = 0; i < mots.length; i++) {
        var m = mots[i];
        var s = compter(p.nTitre, m) * 20 + compter(p.nResume, m) * 6 + compter(p.nTexte, m);
        if (!s) return;
        score += s;
      }
      trouves.push({ p: p, score: score });
    });
    trouves.sort(function (a, b) { return b.score - a.score || a.p.titre.localeCompare(b.p.titre, "fr"); });
    trouves.slice(0, MAX).forEach(function (t) {
      var li = document.createElement("li");
      li.className = "recherche-resultat";
      var h = document.createElement("h3");
      var a = document.createElement("a");
      a.href = prefixe + t.p.url;
      a.textContent = t.p.titre;
      h.appendChild(a);
      li.appendChild(h);
      li.appendChild(extrait(t.p, mots));
      liste.appendChild(li);
    });
    var n = trouves.length;
    etat.textContent = n === 0
      ? "Aucune page ne contient « " + q.trim() + " ». Essayez un autre mot ou consultez le glossaire."
      : n + (n > 1 ? " pages contiennent" : " page contient") + " « " + q.trim() + " »" + (n > MAX ? " ; les " + MAX + " plus pertinentes sont affichées." : ".");
  }
  function lancer() {
    var q = champ.value;
    charger().then(function () { afficher(q); }).catch(function () {
      etat.textContent = "L'index de recherche n'a pas pu être chargé. Rechargez la page une fois connecté.";
    });
  }
  formulaire.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearTimeout(minuterie);
    try { history.replaceState(null, "", "?q=" + encodeURIComponent(champ.value.trim())); } catch (e) { /* sans effet */ }
    lancer();
  });
  champ.addEventListener("input", function () {
    clearTimeout(minuterie);
    minuterie = setTimeout(lancer, 260);
  });
  var initiale = new URLSearchParams(window.location.search).get("q");
  if (initiale) { champ.value = initiale; lancer(); }
  racine.classList.add("recherche-active");
})();
