// backend/static/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // Références aux éléments DOM principaux
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const navLinks = document.querySelectorAll('.nav-link');
  const darkModeToggle = document.getElementById('darkModeToggle');

  // URL de base de l'API (chemins relatifs pour fonctionner depuis n'importe
  // où)
  const API_BASE_URL = '/api';

  // --- Gestion du Mode Sombre ---
  const applyDarkMode = (isDark) => {
    // Applique ou retire la classe 'dark' à l'élément racine <html>
    document.documentElement.classList.toggle('dark', isDark);
    // Met à jour le texte et l'icône du bouton
    darkModeToggle.innerHTML = isDark ?
        '<i class="fas fa-sun mr-2"></i> Mode Clair' :
        '<i class="fas fa-moon mr-2"></i> Mode Sombre';
  };

  // Vérifie la préférence enregistrée ou applique le mode sombre par défaut
  const initialDarkModePreference = localStorage.getItem('darkMode');
  // Le mode sombre est actif si aucune préférence n'est stockée OU si la
  // préférence est 'true'
  const prefersDark = initialDarkModePreference === null ||
      initialDarkModePreference === 'true';
  applyDarkMode(prefersDark);

  // Ajoute l'écouteur d'événement pour le bouton de bascule
  darkModeToggle.addEventListener('click', () => {
    // Bascule la classe 'dark' et récupère le nouvel état
    const isDark = document.documentElement.classList.toggle('dark');
    // Enregistre le nouvel état dans localStorage
    localStorage.setItem('darkMode', isDark);
    // Met à jour l'apparence
    applyDarkMode(isDark);
  });

  // --- Gestion de l'indicateur de chargement ---
  const showLoading = () => {
    loading.classList.remove('hidden');  // Affiche le spinner
    content.classList.add('hidden');     // Cache le contenu principal
  };

  const hideLoading = () => {
    loading.classList.add('hidden');     // Cache le spinner
    content.classList.remove('hidden');  // Affiche le contenu principal
  };

  // --- Fonction générique pour récupérer les données de l'API ---
  async function fetchData(url) {
    showLoading();  // Affiche le spinner avant la requête
    try {
      const response = await fetch(`${API_BASE_URL}${url}`);
      // Vérifie si la réponse HTTP est OK (status 200-299)
      if (!response.ok) {
        // Tente de lire le message d'erreur JSON du backend
        const errorData = await response.json().catch(
            () => ({error: `Erreur HTTP ${response.status}`}));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }
      // Parse la réponse JSON
      return await response.json();
    } catch (error) {
      // Affiche l'erreur dans la console et dans l'interface utilisateur
      console.error('Erreur lors de la récupération des données:', error);
      content.innerHTML =
          `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                                    <strong class="font-bold">Erreur!</strong>
                                    <span class="block sm:inline"> ${
              error.message}</span>
                                 </div>`;
      return null;  // Retourne null pour indiquer l'échec
    } finally {
      hideLoading();  // Cache le spinner une fois la requête terminée (succès
                      // ou échec)
    }
  }

  // --- Fonctions pour générer le HTML de chaque section ---

  // Génère le HTML du Dashboard
  function renderDashboard(stats) {
    content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Dashboard</h1>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold text-gray-700 dark:text-light-slate mb-2">Utilisateurs Uniques</h2>
                    <p class="text-4xl font-bold text-gray-900 dark:text-white">${
        stats.users ?? 'N/A'}</p>
                </div>
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold text-gray-700 dark:text-light-slate mb-2">Mondes Enregistrés</h2>
                    <p class="text-4xl font-bold text-gray-900 dark:text-white">${
        stats.worlds ?? 'N/A'}</p>
                </div>
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold text-gray-700 dark:text-light-slate mb-2">Bases de Flags Uniques</h2>
                    <p class="text-4xl font-bold text-gray-900 dark:text-white">${
        stats.flags ?? 'N/A'}</p>
                </div>
            </div>
            <!-- Espace pour potentiels graphiques futurs -->
        `;
  }

  // Génère le HTML de la liste des utilisateurs
  function renderUserList(users) {
    // Crée une ligne de tableau pour chaque utilisateur
    const tableBody =
        users
            .map(
                user => `
            <tr class="hover:bg-gray-100 dark:hover:bg-lightest-navy cursor-pointer" onclick="window.location.hash='#user/${
                    encodeURIComponent(user.username)}'">
                <td class="py-3 px-4 border-b border-gray-200 dark:border-lightest-navy text-sm">${
                    user.username}</td>
                <td class="py-3 px-4 border-b border-gray-200 dark:border-lightest-navy text-sm">${
                    user.first_name || ''} ${user.last_name || ''}</td>
                <td class="py-3 px-4 border-b border-gray-200 dark:border-lightest-navy text-sm">${
                    user.filiere || 'N/A'}</td>
                <td class="py-3 px-4 border-b border-gray-200 dark:border-lightest-navy text-center text-sm">${
                    user.flag_count}</td>
                <td class="py-3 px-4 border-b border-gray-200 dark:border-lightest-navy text-center text-sm">
                    ${
                    user.blocked ?
                        '<span class="text-red-500"><i class="fas fa-lock fa-fw"></i> <span class="hidden md:inline">Bloqué</span></span>' :
                        '<span class="text-green-500"><i class="fas fa-lock-open fa-fw"></i> <span class="hidden md:inline">Actif</span></span>'}
                </td>
                <td class="py-3 px-4 border-b border-gray-200 dark:border-lightest-navy text-center">
                    <a href="#user/${
                    encodeURIComponent(
                        user.username)}" class="text-blue-500 dark:text-green hover:underline text-sm">Détails</a>
                </td>
            </tr>
        `).join('');  // Concatène toutes les lignes HTML

    // Structure HTML de la page utilisateur
    content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Liste des Utilisateurs</h1>
            <div class="mb-4">
                <input type="text" id="userSearch" placeholder="Rechercher par username ou nom..." class="w-full md:w-1/3 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white">
            </div>
            <div class="bg-white dark:bg-light-navy shadow rounded-lg overflow-hidden">
                <div class="table-container"> 
                    <table class="min-w-full">
                        <thead class="bg-gray-50 dark:bg-lightest-navy sticky top-0 z-10"> 
                            <tr>
                                <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">Username</th>
                                <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">Nom</th>
                                <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">Filière</th>
                                <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">Flags</th>
                                <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">Statut</th>
                                <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody id="userTableBody" class="divide-y divide-gray-200 dark:divide-lightest-navy">
                            ${tableBody} 
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    // Active la fonctionnalité de recherche après l'insertion du HTML
    const searchInput = document.getElementById('userSearch');
    const tableRows = document.querySelectorAll('#userTableBody tr');
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      tableRows.forEach(row => {
        // Recherche dans les colonnes Username (0) et Nom (1)
        const username = row.cells[0].textContent.toLowerCase();
        const name = row.cells[1].textContent.toLowerCase();
        // Affiche la ligne si le terme de recherche est trouvé dans l'une des
        // colonnes
        row.style.display =
            username.includes(searchTerm) || name.includes(searchTerm) ? '' :
                                                                         'none';
      });
    });
  }

  // Génère le HTML de la page de détail d'un utilisateur
  function renderUserDetail(data) {
    const {details, flags, last_position} = data;

    // Crée les tags HTML pour chaque flag
    const flagsHtml = flags.length > 0 ?
        flags
            .map(
                flag => `
            <span class="flag-tag inline-block bg-gray-200 dark:bg-lightest-navy rounded-full px-3 py-1 text-sm font-semibold text-gray-700 dark:text-light-slate mr-2 mb-2 cursor-default" title="Date: ${
                    flag.date || 'N/A'}">
                ${flag.flag}
            </span>
        `).join('') :
        '<p class="text-gray-500 dark:text-slate italic">Aucun flag trouvé.</p>';

    // Génère le HTML pour la dernière position connue
    const positionHtml = last_position ?
        `
            <p><strong class="text-gray-600 dark:text-slate">Monde:</strong> ${
            last_position.world_ID}</p>
            <p><strong class="text-gray-600 dark:text-slate">Location:</strong> ${
            last_position.location}</p>
            <p><strong class="text-gray-600 dark:text-slate">Salle:</strong> ${
            last_position.room}</p>
            <p><strong class="text-gray-600 dark:text-slate">Vu le:</strong> ${
            formatDate(last_position.created_at)}</p>
        ` :
        '<p class="text-gray-500 dark:text-slate italic">Aucune position récente enregistrée.</p>';

    // ---- CORRECTION MISE EN PAGE ----
    content.innerHTML = `
            <a href="#users" class="text-blue-500 dark:text-green hover:underline mb-6 block"><i class="fas fa-arrow-left mr-2"></i>Retour à la liste</a>
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">${
        details.username}</h1>


            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Informations</h2>
                    <p><strong class="text-gray-600 dark:text-slate">Nom:</strong> ${
        details.first_name || ''} ${details.last_name || ''}</p>
                    <p><strong class="text-gray-600 dark:text-slate">Email:</strong> ${
        details.email || 'N/A'}</p>
                    <p><strong class="text-gray-600 dark:text-slate">Filière:</strong> ${
        details.filiere || 'N/A'}</p>
                    <p><strong class="text-gray-600 dark:text-slate">Profil:</strong> ${
        details.profile ?? 'N/A'}</p>
                    <p><strong class="text-gray-600 dark:text-slate">Bloqué:</strong>
                        ${
        details.blocked ?
            '<span class="text-red-500 font-semibold">Oui</span>' :
            '<span class="text-green-500 font-semibold">Non</span>'}
                    </p>
                    <p><strong class="text-gray-600 dark:text-slate">Créé le (DB):</strong> ${
        formatDate(details.created_at)}</p>
                </div>

                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Dernière Position</h2>
                    ${positionHtml}
                </div>
            </div>

            <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow flex flex-col">
                <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Flags (${
        flags.length})</h2>
                <div class="mb-4 flex-shrink-0">
                    <input type="text" id="flagSearch" placeholder="Filtrer les flags..." class="w-full md:w-1/3 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white">
                </div>

                <div id="flagsContainer" class="flex-grow overflow-y-auto pr-2 max-h-[60vh]"> 
                   <div class="flex flex-wrap"> 
                       ${flagsHtml}
                   </div>
                   <p class="text-gray-500 dark:text-slate italic mt-2 no-result-message hidden">Aucun flag correspondant trouvé.</p>
                </div>
            </div>
        `;
    // ---- FIN CORRECTION MISE EN PAGE ----

    // Active le filtrage des flags après l'insertion du HTML
    const flagSearchInput = document.getElementById('flagSearch');
    const flagsContainer = document.getElementById('flagsContainer');
    // Sélectionne le conteneur interne où les tags sont réellement placés
    const flagTagsWrapper = flagsContainer.querySelector('.flex-wrap');
    const flagTags =
        flagTagsWrapper.querySelectorAll('.flag-tag');  // Sélectionne les tags
    const noResultMessage = flagsContainer.querySelector('.no-result-message');

    flagSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      let anyVisible = false;  // Pour savoir si au moins un tag est visible
      flagTags.forEach(tag => {
        // Utilise textContent pour obtenir le texte complet du flag
        const flagText = tag.textContent.trim().toLowerCase();
        const isVisible = flagText.includes(searchTerm);
        tag.style.display = isVisible ? 'inline-block' : 'none';
        if (isVisible) anyVisible = true;
      });
      // Affiche ou cache le message "Aucun résultat"
      noResultMessage.classList.toggle('hidden', anyVisible || !searchTerm);
    });
  }

  // Génère le HTML du formulaire de comparaison
  function renderCompareForm(users) {
    // Crée les options pour les listes déroulantes
    const userOptions = users
                            .map(
                                user => `<option value="${user.username}">${
                                    user.username}</option>`)
                            .join('');
    // Structure HTML du formulaire
    content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Comparer les Flags (Bases)</h1>
            <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow mb-6">
                <form id="compareForm" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label for="user1Select" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Utilisateur 1</label>
                        <select id="user1Select" name="user1" required class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white">
                            <option value="">Choisir...</option>
                            ${userOptions}
                        </select>
                    </div>
                     <div>
                        <label for="user2Select" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Utilisateur 2</label>
                        <select id="user2Select" name="user2" required class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white">
                             <option value="">Choisir...</option>
                            ${userOptions}
                        </select>
                    </div>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 md:bg-green md:hover:opacity-90 text-white md:text-navy font-bold py-2 px-4 rounded h-10">
                        Comparer
                    </button>
                </form>
            </div>
            <div id="compareResult" class="mt-6"></div>
        `;

    // Ajoute l'écouteur pour la soumission du formulaire
    document.getElementById('compareForm').addEventListener('submit', async (e) => {
      e.preventDefault();  // Empêche le rechargement de la page
      const user1 = document.getElementById('user1Select').value;
      const user2 = document.getElementById('user2Select').value;
      const resultDiv = document.getElementById('compareResult');

      // Vérifie que deux utilisateurs différents sont sélectionnés
      if (user1 && user2 && user1 !== user2) {
        resultDiv.innerHTML =
            '<div class="loader"></div>';  // Affiche le spinner pendant le
                                           // chargement
        // Appelle l'API de comparaison
        const data = await fetchData(`/compare?user1=${user1}&user2=${user2}`);
        if (data) {
          renderCompareResult(data);  // Affiche les résultats si succès
        } else {
          resultDiv.innerHTML =
              '<p class="text-red-500">Erreur lors de la comparaison.</p>';  // Message d'erreur
        }
      } else if (user1 === user2) {
        resultDiv.innerHTML =
            '<p class="text-yellow-600">Veuillez sélectionner deux utilisateurs différents.</p>';
      } else {
        resultDiv.innerHTML =
            '<p class="text-yellow-600">Veuillez sélectionner deux utilisateurs.</p>';
      }
    });
  }

  // Génère le HTML pour afficher les résultats de la comparaison
  function renderCompareResult(data) {
    const resultDiv = document.getElementById('compareResult');
    // Fonction helper pour générer une liste HTML scrollable
    const renderList = (title, count, items) => `
            <div class="mb-4">
                <h3 class="text-lg font-semibold text-gray-700 dark:text-light-slate mb-2">${
        title} (${count})</h3>
                ${
        count > 0
            // Si > 0 items, crée une liste scrollable
            ?
            `<ul class="list-disc list-inside text-sm text-gray-600 dark:text-slate space-y-1 max-h-60 overflow-y-auto border border-gray-200 dark:border-lightest-navy rounded p-2">
                          ${items.map(item => `<li>${item}</li>`).join('')}
                       </ul>`
            // Sinon, affiche "Aucun"
            :
            '<p class="text-sm text-gray-500 dark:text-slate italic">Aucun</p>'}
            </div>
        `;

    // Structure HTML des résultats
    resultDiv.innerHTML = `
            <h2 class="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Résultat: ${
        data.user1} vs ${data.user2}</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-white dark:bg-light-navy p-4 rounded shadow">
                    ${
        renderList(
            `${data.user1} a en plus (Bases)`, data.ahead_count, data.ahead)}
                </div>
                 <div class="bg-white dark:bg-light-navy p-4 rounded shadow">
                    ${
        renderList(
            `${data.user2} a en plus (Bases)`, data.behind_count, data.behind)}
                </div>
                 <div class="bg-white dark:bg-light-navy p-4 rounded shadow">
                    ${
        renderList(`En commun (Bases)`, data.common_count, data.common)}
                </div>
            </div>
        `;
  }

  // --- Helper pour formater les dates ISO en format lisible ---
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      // Crée un objet Date à partir de la string ISO
      const date = new Date(dateString);
      // Vérifie si la date est valide
      if (isNaN(date.getTime()))
        return dateString;  // Retourne la string originale si invalide
      // Formate en jj/mm/aaaa hh:mm (format français)
      return date.toLocaleDateString('fr-FR') + ' ' +
          date.toLocaleTimeString(
              'fr-FR', {hour: '2-digit', minute: '2-digit'});
    } catch (e) {
      // En cas d'erreur de parsing inattendue, retourne la string originale
      return dateString;
    }
  }

  // --- Logique de Routage côté Client (basée sur le hash de l'URL) ---
  async function handleRouteChange() {
    // Récupère le hash ou utilise '#dashboard' par défaut
    const hash = window.location.hash || '#dashboard';
    setActiveLink(hash);  // Met en évidence le lien actif dans la sidebar
    showLoading();        // Affiche le spinner

    // Charge le contenu approprié en fonction du hash
    try {
      if (hash === '#dashboard') {
        const data = await fetchData('/stats');
        if (data) renderDashboard(data);
      } else if (hash === '#users') {
        const data = await fetchData('/users');
        if (data) renderUserList(data);
      } else if (hash.startsWith('#user/')) {
        // Extrait le username de l'URL (en décodant les caractères spéciaux
        // comme %20)
        const username = decodeURIComponent(hash.substring(6));
        const data = await fetchData(`/user/${username}`);
        if (data) renderUserDetail(data);
      } else if (hash === '#compare') {
        // Pour la page de comparaison, on charge d'abord la liste des
        // utilisateurs
        const users = await fetchData('/users');
        if (users) {
          renderCompareForm(users);
        } else {
          // Si la liste des utilisateurs ne peut être chargée, affiche une
          // erreur
          content.innerHTML =
              '<p class="text-red-500">Impossible de charger la liste des utilisateurs pour la comparaison.</p>';
          hideLoading();  // Cache le spinner car il n'y a pas eu de rendu
                          // réussi
        }
      } else {
        // Si le hash ne correspond à aucune route connue
        content.innerHTML =
            `<h1 class="text-xl">Page non trouvée</h1><p>Le lien ${
                hash} ne correspond à aucune section.</p>`;
        hideLoading();  // Cache le spinner car il n'y a pas de chargement de
                        // données
      }
    } catch (error) {
      // S'assure que le loader est caché même si une erreur se produit pendant
      // le chargement/rendu
      hideLoading();
      console.error('Erreur pendant le changement de route:', error);
      // Affiche une erreur générique si le fetch n'a pas déjà affiché une
      // erreur spécifique
      if (!content.querySelector('.bg-red-100')) {  // Vérifie si une erreur
                                                    // n'est pas déjà affichée
        content.innerHTML =
            `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                                          <strong class="font-bold">Erreur!</strong>
                                          <span class="block sm:inline"> Une erreur s'est produite lors du chargement de la page.</span>
                                       </div>`;
      }
    }
  }

  // Met à jour la classe 'active' sur le lien de navigation courant
  function setActiveLink(hash) {
    navLinks.forEach(link => {
      const linkHref = link.getAttribute('href');
      // Gère le cas où le hash ou le href contient des parties encodées (pour
      // les usernames)
      let isActive = false;
      try {
        // Décode les deux pour une comparaison fiable
        isActive = decodeURIComponent(linkHref) === decodeURIComponent(hash);
      } catch (e) {
        // Si le décodage échoue, compare tel quel (moins fiable)
        isActive = linkHref === hash;
      }

      // Applique/retire les classes pour l'état actif
      link.classList.toggle('active', isActive);
      link.classList.toggle(
          'bg-gray-200',
          isActive && !document.documentElement.classList.contains('dark'));
      link.classList.toggle(
          'dark:bg-lightest-navy',
          isActive && document.documentElement.classList.contains('dark'));
      link.classList.toggle('font-semibold', isActive);
    });
  }

  // --- Chargement Initial et Écouteurs d'Événements ---

  // Écoute les changements de hash dans l'URL (navigation via liens #)
  window.addEventListener('hashchange', handleRouteChange);

  // Charge le contenu initial en fonction du hash présent dans l'URL au
  // chargement de la page
  handleRouteChange();
});