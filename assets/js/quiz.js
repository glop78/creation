/* ==========================================================================
   CREATIO — Questionnaires (salle 21 : tri des énoncés ; salle 22 : quiz final)
   Chaque question est un groupe de boutons radio dans un fieldset. La
   réponse est vérifiée dès qu'une option est choisie ; la correction cite le
   fait (F-id) et la salle concernés. Score annoncé poliment aux lecteurs
   d'écran. Aucune donnée enregistrée ; fonctionne sans calcul graphique.
   Sans JavaScript, les questions restent lisibles et les corrections sont
   visibles dans des volets dépliables.
   ========================================================================== */
(function () {
  'use strict';

  function initialiser(bloc) {
    var questions = Array.prototype.slice.call(bloc.querySelectorAll('[data-quiz-question]'));
    var score = bloc.querySelector('[data-quiz-score]');
    var recommencer = bloc.querySelector('[data-quiz-recommencer]');
    var total = questions.length;

    bloc.classList.add('quiz-actif');

    function libelle(fs, valeur) {
      var input = fs.querySelector('input[value="' + valeur + '"]');
      var label = input ? fs.querySelector('label[for="' + input.id + '"]') : null;
      return label ? label.textContent.trim() : valeur;
    }

    function majScore() {
      var repondues = 0, justes = 0;
      questions.forEach(function (fs) {
        var choix = fs.querySelector('input:checked');
        if (choix) {
          repondues++;
          if (choix.value === fs.getAttribute('data-bonne')) { justes++; }
        }
      });
      bloc.setAttribute('data-justes', String(justes));
      bloc.setAttribute('data-repondues', String(repondues));
      if (!score) { return; }
      if (!repondues) {
        score.textContent = 'Aucune réponse pour l’instant : ' + total + ' questions vous attendent.';
      } else if (repondues < total) {
        score.textContent = justes + ' bonne' + (justes > 1 ? 's' : '') + ' réponse' + (justes > 1 ? 's' : '') +
          ' sur ' + repondues + ' question' + (repondues > 1 ? 's' : '') + ' traitée' + (repondues > 1 ? 's' : '') +
          ' (' + total + ' au total).';
      } else {
        score.textContent = 'Terminé : ' + justes + ' bonne' + (justes > 1 ? 's' : '') + ' réponse' +
          (justes > 1 ? 's' : '') + ' sur ' + total + '. ' +
          (justes === total ? 'Parcours sans faute !' : 'Relisez les corrections et les salles indiquées pour approfondir.');
      }
    }

    questions.forEach(function (fs) {
      var retour = fs.querySelector('[data-quiz-retour]');
      var correction = fs.querySelector('[data-quiz-correction]');
      if (correction) { correction.hidden = true; }
      fs.addEventListener('change', function () {
        var choix = fs.querySelector('input:checked');
        if (!choix || !retour) { return; }
        var bonne = fs.getAttribute('data-bonne');
        var juste = choix.value === bonne;
        fs.setAttribute('data-etat', juste ? 'juste' : 'faux');
        retour.innerHTML = (juste ? '<strong>Exact.</strong> ' :
          '<strong>Pas tout à fait :</strong> la réponse attendue est « ' + libelle(fs, bonne) + ' ». ') +
          (correction ? (correction.querySelector('p') || correction).innerHTML : '');
        majScore();
      });
    });

    if (recommencer) {
      recommencer.addEventListener('click', function () {
        questions.forEach(function (fs) {
          Array.prototype.slice.call(fs.querySelectorAll('input')).forEach(function (i) { i.checked = false; });
          fs.removeAttribute('data-etat');
          var retour = fs.querySelector('[data-quiz-retour]');
          if (retour) { retour.textContent = ''; }
        });
        majScore();
        var premier = bloc.querySelector('input');
        if (premier) { premier.focus(); }
      });
    }
    majScore();
  }

  function demarrer() {
    Array.prototype.slice.call(document.querySelectorAll('[data-quiz]')).forEach(initialiser);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else { demarrer(); }
}());
