/* ==========================================================================
   CREATIO — comportements communs (E03)
   Aucun appel réseau, aucun traceur, aucune donnée personnelle collectée.
   Le stockage local ne sert qu'à mémoriser le choix de contraste.
   ========================================================================== */
(function () {
  'use strict';

  var racine = document.documentElement;
  var CLE_CONTRASTE = 'creatio-contraste';

  /* --- 1. Contraste renforcé ------------------------------------------- */
  function appliquerContraste(actif) {
    racine.classList.toggle('contraste-renforce', actif);
    var boutons = document.querySelectorAll('[data-contraste]');
    Array.prototype.forEach.call(boutons, function (b) {
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
      b.textContent = actif ? 'Contraste renforcé : activé' : 'Contraste renforcé';
    });
  }

  var choix = null;
  try { choix = window.localStorage.getItem(CLE_CONTRASTE); } catch (e) { choix = null; }
  appliquerContraste(choix === 'oui');

  Array.prototype.forEach.call(document.querySelectorAll('[data-contraste]'), function (bouton) {
    bouton.addEventListener('click', function () {
      var actif = !racine.classList.contains('contraste-renforce');
      appliquerContraste(actif);
      try { window.localStorage.setItem(CLE_CONTRASTE, actif ? 'oui' : 'non'); } catch (e) { /* mode privé */ }
    });
  });

  /* --- 2. État de la connexion ------------------------------------------ */
  function majReseau() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-reseau]'), function (el) {
      if (navigator.onLine) {
        el.classList.remove('hors-ligne');
        el.textContent = 'Disponible hors connexion après la première visite';
      } else {
        el.classList.add('hors-ligne');
        el.textContent = 'Hors connexion — le musée reste consultable';
      }
    });
  }
  window.addEventListener('online', majReseau);
  window.addEventListener('offline', majReseau);
  majReseau();

  /* --- 3. Galerie des puissances de dix (repli image + clavier) --------- */
  var piste = document.querySelector('[data-px-piste]');
  if (piste) {
    var etapes = Array.prototype.slice.call(piste.querySelectorAll('[data-px-etape]'));
    var compteur = document.querySelector('[data-px-compteur]');
    var courante = 0;

    /* État public : le moteur d'animation (puissances.js) s'y synchronise. */
    window.CREATIO_PX = {
      get courante() { return courante; },
      get total() { return etapes.length; },
      aller: function (index, focus, defiler) { aller(index, !!focus, !!defiler); }
    };

    function annoncer() {
      if (compteur) {
        compteur.textContent = 'Étape ' + (courante + 1) + ' sur ' + etapes.length;
      }
    }

    function aller(index, focus, defiler) {
      if (!etapes.length) { return; }
      courante = Math.max(0, Math.min(etapes.length - 1, index));
      var cible = etapes[courante];
      Array.prototype.forEach.call(etapes, function (el, i) {
        if (i === courante) { el.setAttribute('aria-current', 'step'); }
        else { el.removeAttribute('aria-current'); }
      });
      // Au chargement, on ne défile PAS : sinon l'accueil saute directement
      // à la galerie (défaut constaté en QA visuelle E03).
      if (defiler && typeof cible.scrollIntoView === 'function') {
        cible.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      if (focus) { cible.focus({ preventScroll: true }); }
      annoncer();
      document.dispatchEvent(new CustomEvent('creatio:etape', {
        detail: { index: courante, total: etapes.length }
      }));
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-px-precedent]'), function (b) {
      b.addEventListener('click', function () { aller(courante - 1, true, true); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-px-suivant]'), function (b) {
      b.addEventListener('click', function () { aller(courante + 1, true, true); });
    });

    piste.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
        ev.preventDefault(); aller(courante + 1, true, true);
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
        ev.preventDefault(); aller(courante - 1, true, true);
      } else if (ev.key === 'Home') {
        ev.preventDefault(); aller(0, true, true);
      } else if (ev.key === 'End') {
        ev.preventDefault(); aller(etapes.length - 1, true, true);
      }
    });

    /* Le défilement manuel met le compteur à jour sans imposer de focus. */
    var attente;
    piste.addEventListener('scroll', function () {
      window.clearTimeout(attente);
      attente = window.setTimeout(function () {
        var milieu = piste.getBoundingClientRect().left + piste.clientWidth / 2;
        var meilleure = 0;
        var ecart = Infinity;
        Array.prototype.forEach.call(etapes, function (el, i) {
          var r = el.getBoundingClientRect();
          var d = Math.abs(r.left + r.width / 2 - milieu);
          if (d < ecart) { ecart = d; meilleure = i; }
        });
        courante = meilleure;
        Array.prototype.forEach.call(etapes, function (el, i) {
          if (i === courante) { el.setAttribute('aria-current', 'step'); }
          else { el.removeAttribute('aria-current'); }
        });
        annoncer();
        document.dispatchEvent(new CustomEvent('creatio:etape', {
          detail: { index: courante, total: etapes.length }
        }));
      }, 120);
    }, { passive: true });

    aller(0, false, false);
  }

  /* --- 4. Navigation : fermer le menu mobile après un clic ------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.nav-mobile'), function (details) {
    details.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) { details.removeAttribute('open'); }
    });
  });

  /* --- 5. Enregistrement du service worker (hors ligne) ----------------
     On déduit la racine du site du lien vers le manifeste : l'accueil est à
     la racine et les salles sont dans un sous-dossier, donc un chemin
     « sw.js » relatif échouerait depuis une salle. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      var lien = document.querySelector('link[rel="manifest"]');
      if (!lien) { return; }
      try {
        var manifeste = new URL(lien.getAttribute('href'), document.baseURI);
        var racine = new URL('.', manifeste);
        navigator.serviceWorker.register(new URL('sw.js', racine).href,
          { scope: racine.href }).catch(function () {
          /* Le site reste parfaitement utilisable sans enregistrement. */
        });
      } catch (e) { /* navigateur ancien : on ignore */ }
    });
  }
}());
