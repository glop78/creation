/* CREATIO — filtre des pages annexes (glossaire, sources). E17.
   Un champ [data-filtre-champ] dans un bloc [data-filtre="ID"] masque les
   éléments [data-filtre-item] de l'élément #ID qui ne contiennent pas le texte
   saisi (sans tenir compte des accents ni des majuscules). Le nombre de
   résultats est annoncé dans la zone [data-filtre-etat] (role="status").
   Sans JavaScript, la liste complète reste visible. */
(function () {
  "use strict";
  function normaliser(t) {
    return (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  document.querySelectorAll("[data-filtre]").forEach(function (bloc) {
    var champ = bloc.querySelector("[data-filtre-champ]");
    var etat = bloc.querySelector("[data-filtre-etat]");
    var cible = document.getElementById(bloc.getAttribute("data-filtre"));
    if (!champ || !cible) return;
    var vide = cible.parentNode.querySelector("[data-filtre-vide]");
    var items = Array.prototype.slice.call(cible.querySelectorAll("[data-filtre-item]"));
    var textes = items.map(function (el) { return normaliser(el.textContent); });
    var unite = cible.tagName === "DL" ? ["terme affiché", "termes affichés"] : ["source affichée", "sources affichées"];
    var minuterie = null;
    function appliquer() {
      var q = normaliser(champ.value);
      var n = 0;
      items.forEach(function (el, i) {
        var ok = !q || textes[i].indexOf(q) !== -1;
        el.hidden = !ok;
        if (ok) n++;
      });
      if (vide) vide.hidden = n !== 0;
      if (etat) {
        var libelle = n <= 1 ? unite[0] : unite[1];
        etat.textContent = n + " " + libelle + (q ? " sur " + items.length + "." : ".");
      }
    }
    champ.addEventListener("input", function () {
      clearTimeout(minuterie);
      minuterie = setTimeout(appliquer, 180);
    });
  });
})();
