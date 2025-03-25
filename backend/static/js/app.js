// backend/static/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // Références aux éléments DOM principaux
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const navLinks = document.querySelectorAll('.nav-link');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const updateDbButton = document.getElementById(
      'updateDbButton');  // <-- Référence au nouveau bouton
  const updateStatusDiv = document.getElementById(
      'updateStatus');  // <-- Référence au div de statut

  // URL de base de l'API
  const API_BASE_URL = '/api';

  // --- Variables pour l'état du tri ---
  let currentSortKey = 'username';   // Clé de tri par défaut
  let currentSortDirection = 'asc';  // Direction par défaut
  let currentUsersData =
      [];  // Pour stocker les données utilisateur actuelles pour le tri

  // --- Gestion du Mode Sombre ---
  const applyDarkMode = (isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
    darkModeToggle.innerHTML = isDark ?
        '<i class="fas fa-sun mr-2"></i> Mode Clair' :
        '<i class="fas fa-moon mr-2"></i> Mode Sombre';
  };

  const initialDarkModePreference = localStorage.getItem('darkMode');
  const prefersDark = initialDarkModePreference === null ||
      initialDarkModePreference === 'true';
  applyDarkMode(prefersDark);

  darkModeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark);
    applyDarkMode(isDark);
  });

  // --- Gestion de l'indicateur de chargement ---
  const showLoading = () => {
    loading.classList.remove('hidden');
    content.classList.add('hidden');
  };

  const hideLoading = () => {
    loading.classList.add('hidden');
    content.classList.remove('hidden');
  };

  // --- Fonction générique pour récupérer les données de l'API (modifiée) ---
  async function fetchData(url, options = {}) {
    // Ne pas montrer le loader global ici si on en montre un spécifique (ex:
    // compare ou update) showLoading();
    try {
      const response = await fetch(
          `${API_BASE_URL}${url}`,
          options);  // Passe les options (method, headers...)

      if (!response.ok) {
        // Essayer de lire le JSON d'erreur du backend
        let errorPayload = {error: `Erreur HTTP ${response.status}`};
        try {
          errorPayload = await response.json();
        } catch (e) { /* Ignorer si pas de JSON */
        }

        const errorMessage =
            errorPayload.error || `Erreur HTTP ${response.status}`;
        console.error(
            'API Error Response:', errorMessage, 'Status:', response.status);
        throw new Error(errorMessage);  // Lève l'erreur pour le catch externe
      }

      // Gérer les cas où il n'y a pas de contenu JSON (ex: 204 No Content)
      const contentType = response.headers.get('content-type');
      if (response.status === 204 || !contentType ||
          !contentType.includes('application/json')) {
        // Retourne un objet vide pour indiquer le succès sans données JSON
        return {};
      }

      return await response.json();  // Parse la réponse JSON normale
    } catch (error) {
      console.error('Erreur lors de l\'appel API:', url, options, error);
      // Relance l'erreur pour que le code appelant (ex: bouton update) puisse
      // la gérer spécifiquement
      throw error;
    }
    // finally: hideLoading() est géré par les fonctions de rendu ou les
    // gestionnaires d'erreurs spécifiques
  }


  // --- Fonctions pour générer le HTML de chaque section ---

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
        `;
    hideLoading();  // Masquer le loader une fois le contenu rendu
  }

  // --- Fonctions liées à la liste des utilisateurs (TRI inclus) ---

  function generateUserTableRows(users) {
    return users
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
                user.blocked === null || user.blocked === undefined ?
                    '<span class="text-gray-500 italic">N/A</span>' :
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
        `)
        .join('');
  }

  function updateUserTableHeaderIcons(activeKey, direction) {
    document.querySelectorAll('th.sortable-header').forEach(th => {
      const iconSpan = th.querySelector('.sort-icon');
      if (!iconSpan) return;
      const key = th.getAttribute('data-sort-key');
      iconSpan.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
      iconSpan.classList.add('fas');
      if (key === activeKey) {
        iconSpan.classList.add(
            direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      } else {
        iconSpan.classList.add('fa-sort');
      }
    });
  }

  function sortUsers(key) {
    const newDirection =
        (key === currentSortKey && currentSortDirection === 'asc') ? 'desc' :
                                                                     'asc';
    currentUsersData.sort((a, b) => {
      let valA, valB;
      if (key === 'name') {
        valA =
            `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase().trim();
        valB =
            `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase().trim();
      } else {
        valA = a[key];
        valB = b[key];
      }
      const typeA = typeof valA;
      const typeB = typeof valB;
      let isANullish = valA === null || valA === undefined || valA === 'N/A';
      let isBNullish = valB === null || valB === undefined || valB === 'N/A';
      if (isANullish && isBNullish) return 0;
      if (isANullish) return newDirection === 'asc' ? -1 : 1;
      if (isBNullish) return newDirection === 'asc' ? 1 : -1;
      let comparison = 0;
      if (typeA === 'string' || typeB === 'string') {
        comparison = String(valA).toLowerCase().localeCompare(
            String(valB).toLowerCase());
      } else if (typeA === 'number' || typeB === 'number') {
        comparison = Number(valA) - Number(valB);
      } else if (
          typeA === 'boolean' || typeB === 'boolean' || key === 'blocked') {
        const boolA = valA === true;
        const boolB = valB === true;
        comparison = (boolA === boolB) ? 0 : (boolA ? 1 : -1);
      }
      return newDirection === 'asc' ? comparison : comparison * -1;
    });
    currentSortKey = key;
    currentSortDirection = newDirection;
    const userTableBody = document.getElementById('userTableBody');
    if (userTableBody) {
      userTableBody.innerHTML = generateUserTableRows(currentUsersData);
    }
    updateUserTableHeaderIcons(currentSortKey, currentSortDirection);
  }

  function renderUserList(users) {
    currentUsersData = [...users];
    sortUsers(currentSortKey);  // Apply current/default sort
    const tableBodyHtml =
        generateUserTableRows(currentUsersData);  // Get sorted HTML

    content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Liste des Utilisateurs</h1>
            <div class="mb-4"> <input type="text" id="userSearch" placeholder="Rechercher par username ou nom..." class="w-full md:w-1/3 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white"> </div>
            <div class="bg-white dark:bg-light-navy shadow rounded-lg overflow-hidden">
                <div class="table-container">
                    <table class="min-w-full">
                        <thead class="bg-gray-50 dark:bg-lightest-navy sticky top-0 z-10"> <tr>
                            <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="username"> Username <span class="sort-icon fas ml-1"></span> </th>
                            <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="name"> Nom <span class="sort-icon fas ml-1"></span> </th>
                            <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="filiere"> Filière <span class="sort-icon fas ml-1"></span> </th>
                            <th class="sortable-header py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="flag_count"> Flags <span class="sort-icon fas ml-1"></span> </th>
                            <th class="sortable-header py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="blocked"> Statut <span class="sort-icon fas ml-1"></span> </th>
                            <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider"> Action </th>
                        </tr> </thead>
                        <tbody id="userTableBody" class="divide-y divide-gray-200 dark:divide-lightest-navy"> ${
        tableBodyHtml} </tbody>
                    </table>
                </div>
            </div>
        `;

    document.querySelectorAll('th.sortable-header').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-key');
        if (key) sortUsers(key);
      });
    });
    updateUserTableHeaderIcons(currentSortKey, currentSortDirection);

    const searchInput = document.getElementById('userSearch');
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const tableRows = document.querySelectorAll('#userTableBody tr');
      tableRows.forEach(row => {
        const username = row.cells[0].textContent.toLowerCase();
        const name = row.cells[1].textContent.toLowerCase();
        row.style.display =
            username.includes(searchTerm) || name.includes(searchTerm) ? '' :
                                                                         'none';
      });
    });
    hideLoading();
  }

  function renderUserDetail(data) {
    const {details, flags, last_position} = data;
    const flagsHtml = flags.length > 0 ?
        flags
            .map(
                flag => `
            <span class="flag-tag inline-block bg-gray-200 dark:bg-lightest-navy rounded-full px-3 py-1 text-sm font-semibold text-gray-700 dark:text-light-slate mr-2 mb-2 cursor-default" title="Date: ${
                    formatDate(flag.date) || 'N/A'}"> ${flag.flag} </span>
        `).join('') :
        '<p class="text-gray-500 dark:text-slate italic">Aucun flag trouvé.</p>';
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
        details.blocked === null || details.blocked === undefined ?
            '<span class="text-gray-500 italic">N/A</span>' :
            details.blocked ?
            '<span class="text-red-500 font-semibold">Oui</span>' :
            '<span class="text-green-500 font-semibold">Non</span>'} </p>
                    <p><strong class="text-gray-600 dark:text-slate">Créé le (DB):</strong> ${
        formatDate(details.created_at)}</p>
                </div>
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow"> <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Dernière Position</h2> ${
        positionHtml} </div>
            </div>
            <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow flex flex-col">
                <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Flags (${
        flags.length})</h2>
                <div class="mb-4 flex-shrink-0"> <input type="text" id="flagSearch" placeholder="Filtrer les flags..." class="w-full md:w-1/3 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white"> </div>
                <div id="flagsContainer" class="flex-grow overflow-y-auto pr-2 max-h-[60vh]">
                   <div class="flex flex-wrap"> ${flagsHtml} </div>
                   <p class="text-gray-500 dark:text-slate italic mt-2 no-result-message hidden">Aucun flag correspondant trouvé.</p>
                </div>
            </div>
        `;

    const flagSearchInput = document.getElementById('flagSearch');
    const flagsContainer = document.getElementById('flagsContainer');
    const flagTagsWrapper = flagsContainer.querySelector('.flex-wrap');
    const flagTags = flagTagsWrapper.querySelectorAll('.flag-tag');
    const noResultMessage = flagsContainer.querySelector('.no-result-message');
    flagSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      let anyVisible = false;
      flagTags.forEach(tag => {
        const flagText = tag.textContent.trim().toLowerCase();
        const isVisible = flagText.includes(searchTerm);
        tag.style.display = isVisible ? 'inline-block' : 'none';
        if (isVisible) anyVisible = true;
      });
      noResultMessage.classList.toggle('hidden', anyVisible || !searchTerm);
    });
    hideLoading();
  }

  function renderCompareForm(users) {
    const availableUsers =
        [...users].sort((a, b) => a.username.localeCompare(b.username));
    content.innerHTML = `
        <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Comparer les Flags (Bases)</h1>
        <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow mb-6">
            <form id="compareForm" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="relative">
                    <label for="user1Input" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Utilisateur 1</label>
                    <input type="text" id="user1Input" placeholder="Rechercher utilisateur..." autocomplete="off" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                    <input type="hidden" name="user1" id="user1Value">
                    <div id="user1Dropdown" class="user-dropdown absolute z-20 w-full bg-white dark:bg-lightest-navy border border-gray-300 dark:border-slate rounded mt-1 max-h-60 overflow-y-auto hidden shadow-lg"></div>
                </div>
                <div class="relative">
                    <label for="user2Input" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Utilisateur 2</label>
                    <input type="text" id="user2Input" placeholder="Rechercher utilisateur..." autocomplete="off" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                    <input type="hidden" name="user2" id="user2Value">
                    <div id="user2Dropdown" class="user-dropdown absolute z-20 w-full bg-white dark:bg-lightest-navy border border-gray-300 dark:border-slate rounded mt-1 max-h-60 overflow-y-auto hidden shadow-lg"></div>
                </div>
                <button type="submit" class="bg-blue-500 hover:bg-blue-600 md:bg-green md:hover:opacity-90 text-white md:text-navy font-bold py-2 px-4 rounded h-10"> Comparer </button>
            </form>
        </div>
        <div id="compareResult" class="mt-6"></div>
    `;

    function setupSearchableDropdown(inputId, dropdownId, valueId) {
      const inputElement = document.getElementById(inputId);
      const dropdownElement = document.getElementById(dropdownId);
      const valueElement = document.getElementById(valueId);
      let blurTimeout;
      const renderOptions = (filterTerm = '') => {
        const lowerFilterTerm = filterTerm.toLowerCase();
        const filteredUsers = availableUsers.filter(
            user => user.username.toLowerCase().includes(lowerFilterTerm));
        if (filteredUsers.length === 0 && filterTerm) {
          dropdownElement.innerHTML =
              `<div class="p-2 text-sm text-gray-500 dark:text-slate italic">Aucun utilisateur trouvé</div>`;
        } else {
          const usersToShow = filterTerm ?
              filteredUsers :
              availableUsers;  // Show all if no filter
          dropdownElement.innerHTML =
              usersToShow
                  .map(
                      user => `
            <div class="dropdown-item p-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-navy" data-value="${
                          user.username}"> ${user.username} </div>
           `).join('');
        }
        dropdownElement.classList.remove('hidden');
      };
      inputElement.addEventListener('input', () => {
        valueElement.value = '';
        renderOptions(inputElement.value);
      });
      inputElement.addEventListener('focus', () => {
        clearTimeout(blurTimeout);
        renderOptions(inputElement.value);
      });
      inputElement.addEventListener('blur', () => {
        blurTimeout = setTimeout(() => {
          dropdownElement.classList.add('hidden');
          if (inputElement.value !== valueElement.value) {
            inputElement.value = valueElement.value;
          }
        }, 200);
      });
      dropdownElement.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
          const selectedValue = item.getAttribute('data-value');
          inputElement.value = selectedValue;
          valueElement.value = selectedValue;
          dropdownElement.classList.add('hidden');
          clearTimeout(blurTimeout); /* inputElement.blur(); */
        }
      });
    }
    setupSearchableDropdown('user1Input', 'user1Dropdown', 'user1Value');
    setupSearchableDropdown('user2Input', 'user2Dropdown', 'user2Value');

    document.getElementById('compareForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user1 = document.getElementById('user1Value').value;
      const user2 = document.getElementById('user2Value').value;
      const resultDiv = document.getElementById('compareResult');
      resultDiv.innerHTML = '';
      if (!user1 || !user2) {
        resultDiv.innerHTML =
            '<p class="text-yellow-600 dark:text-yellow-400">Veuillez sélectionner deux utilisateurs.</p>';
        return;
      }
      if (user1 === user2) {
        resultDiv.innerHTML =
            '<p class="text-yellow-600 dark:text-yellow-400">Veuillez sélectionner deux utilisateurs différents.</p>';
        return;
      }
      const user1Exists = availableUsers.some(u => u.username === user1);
      const user2Exists = availableUsers.some(u => u.username === user2);
      if (!user1Exists || !user2Exists) {
        resultDiv.innerHTML =
            '<p class="text-red-500">Erreur interne: Un ou les deux utilisateurs sélectionnés sont invalides.</p>';
        return;
      }

      resultDiv.innerHTML = '<div class="loader my-4"></div>';
      try {
        const data = await fetchData(`/compare?user1=${
            encodeURIComponent(user1)}&user2=${encodeURIComponent(user2)}`);
        renderCompareResult(data);  // Render results if fetch was ok
      } catch (error) {
        resultDiv.innerHTML =
            `<p class="text-red-500">Erreur lors de la comparaison: ${
                error.message}</p>`;  // Show error in result div
      }
    });
    hideLoading();
  }

  function renderCompareResult(data) {
    const resultDiv = document.getElementById('compareResult');
    if (!resultDiv) return;
    const renderList = (title, count, items) => `
            <div class="mb-4"> <h3 class="text-lg font-semibold text-gray-700 dark:text-light-slate mb-2">${
        title} (${count})</h3>
                ${
        count > 0 ?
            `<ul class="list-disc list-inside text-sm text-gray-600 dark:text-slate space-y-1 max-h-60 overflow-y-auto border border-gray-200 dark:border-lightest-navy rounded p-2 bg-gray-50 dark:bg-lightest-navy"> ${
                items.map(item => `<li>${item}</li>`).join('')} </ul>` :
            '<p class="text-sm text-gray-500 dark:text-slate italic">Aucun</p>'}
            </div> `;
    resultDiv.innerHTML = `
            <h2 class="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Résultat: ${
        data.user1} vs ${data.user2}</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-white dark:bg-light-navy p-4 rounded shadow"> ${
        renderList(
            `${data.user1} a en plus (Bases)`, data.ahead_count,
            data.ahead)} </div>
                <div class="bg-white dark:bg-light-navy p-4 rounded shadow"> ${
        renderList(
            `${data.user2} a en plus (Bases)`, data.behind_count,
            data.behind)} </div>
                <div class="bg-white dark:bg-light-navy p-4 rounded shadow"> ${
        renderList(`En commun (Bases)`, data.common_count, data.common)} </div>
            </div> `;
  }

  function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString(
                 'fr-FR', {day: '2-digit', month: '2-digit', year: 'numeric'}) +
          ' ' +
          date.toLocaleTimeString(
              'fr-FR', {hour: '2-digit', minute: '2-digit'});
    } catch (e) {
      console.error('Error formatting date:', dateString, e);
      return dateString;
    }
  }

  // --- Logique de Routage côté Client ---
  async function handleRouteChange() {
    const hash = window.location.hash || '#dashboard';
    setActiveLink(hash);
    showLoading();  // Show global loader before any fetch/render

    if (hash !== '#users' && !hash.startsWith('#user/')) {
      currentSortKey = 'username';
      currentSortDirection = 'asc';
    }

    try {
      // Clear previous potential main content errors when navigating
      if (content.querySelector('.status-error') ||
          content.querySelector('.bg-red-100')) {
        content.innerHTML =
            '';  // Clear content if it was showing a previous error message
      }

      if (hash === '#dashboard') {
        const data = await fetchData('/stats');
        renderDashboard(data);
      } else if (hash === '#users') {
        currentSortKey = 'username';
        currentSortDirection = 'asc';
        const data = await fetchData('/users');
        renderUserList(data);
      } else if (hash.startsWith('#user/')) {
        const username = decodeURIComponent(hash.substring(6));
        const data = await fetchData(`/user/${username}`);
        renderUserDetail(data);
      } else if (hash === '#compare') {
        const users = await fetchData('/users');
        renderCompareForm(users);
      } else {
        content.innerHTML =
            `<h1 class="text-xl">Page non trouvée</h1><p>Le lien ${
                hash} ne correspond à aucune section.</p>`;
        hideLoading();
      }
    } catch (error) {
      // Handle errors during fetch or rendering for the main content area
      console.error('Erreur lors du chargement de la route:', hash, error);
      content.innerHTML =
          `<div class="status-message status-error"><strong class="font-bold">Erreur!</strong> Erreur lors du chargement de la page: ${
              error.message}</div>`;
      hideLoading();  // Ensure global loader is hidden on error
    }
  }


  function setActiveLink(hash) {
    navLinks.forEach(link => {
      const linkHref = link.getAttribute('href');
      let isActive = false;
      try {
        if (hash.startsWith('#user/') && linkHref === '#users') {
          isActive = true;
        } else {
          isActive = decodeURIComponent(linkHref) === decodeURIComponent(hash);
        }
      } catch (e) {
        isActive = linkHref === hash;
      }
      link.classList.toggle('active', isActive);
      link.classList.toggle(
          'bg-gray-200',
          isActive && !document.documentElement.classList.contains('dark'));
      link.classList.toggle(
          'dark:bg-lightest-navy',
          isActive && document.documentElement.classList.contains('dark'));
      link.classList.toggle('font-semibold', isActive);
      link.classList.toggle(
          'text-gray-900',
          isActive && !document.documentElement.classList.contains('dark'));
      link.classList.toggle(
          'dark:text-green',
          isActive && document.documentElement.classList.contains('dark'));
      if (!isActive) {
        link.classList.remove('text-gray-900', 'dark:text-green');
      }
    });
  }

  // --- LOGIQUE: Gestion du bouton d'update ---
  if (updateDbButton && updateStatusDiv) {
    updateDbButton.addEventListener('click', async () => {
      updateDbButton.disabled = true;
      updateDbButton.classList.add('button-loading');
      updateDbButton.innerHTML =
          '<i class="fas fa-sync-alt fa-spin mr-2 w-4 text-center"></i>Mise à jour...';
      updateStatusDiv.innerHTML =
          '<div class="status-message status-info">Lancement de la mise à jour...</div>';

      try {
        console.log('Calling POST /api/update-db');
        const result = await fetchData('/update-db', {method: 'POST'});
        console.log('Update API result:', result);

        // Display success message from API
        updateStatusDiv.innerHTML = `<div class="status-message status-success">
               <strong class="font-bold">Succès!</strong><br>
               <pre class="text-xs whitespace-pre-wrap">${
            result.message || 'Mise à jour terminée avec succès.'}</pre>
            </div>`;

        // Refresh current view after a delay
        setTimeout(() => {
          console.log('Refreshing view after successful update...');
          handleRouteChange();  // Reload data for the current page
        }, 1500);

      } catch (error) {
        // Handle errors (network or API error response)
        console.error('Erreur lors de l\'appel à /api/update-db:', error);
        updateStatusDiv.innerHTML = `<div class="status-message status-error">
               <strong class="font-bold">Échec!</strong><br>
               <pre class="text-xs whitespace-pre-wrap">${
            error.message ||
            'Impossible de contacter le serveur ou erreur inattendue.'}</pre>
            </div>`;
      } finally {
        // Re-enable button after a short delay, regardless of outcome
        setTimeout(() => {
          updateDbButton.disabled = false;
          updateDbButton.classList.remove('button-loading');
          updateDbButton.innerHTML =
              '<i class="fas fa-sync-alt mr-2 w-4 text-center"></i>Actualiser DB';
          // Optionally clear the status message after a longer delay
          // setTimeout(() => { updateStatusDiv.innerHTML = ''; }, 7000);
        }, 1000);
      }
    });
  } else {
    console.warn(
        'Le bouton d\'update (#updateDbButton) ou le div de statut (#updateStatus) n\'a pas été trouvé.');
  }
  // --- FIN LOGIQUE UPDATE ---


  // --- Chargement Initial et Écouteurs d'Événements ---
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();  // Load initial content based on current hash or default
                        // #dashboard
});