// backend/static/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // --- Références DOM et Constantes ---
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const navLinks = document.querySelectorAll('.nav-link');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const updateDbButton = document.getElementById('updateDbButton');
  const updateStatusDiv = document.getElementById('updateStatus');
  const API_BASE_URL = '/api';

  // --- Variables d'état ---
  let currentSortKey = 'username';
  let currentSortDirection = 'asc';
  let currentUsersData = [];

  // --- Gestion Mode Sombre ---
  const applyDarkMode = (isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
    darkModeToggle.innerHTML = isDark ?
        '<i class="fas fa-sun mr-2"></i> Mode Clair' :
        '<i class="fas fa-moon mr-2"></i> Mode Sombre';
  };
  const initialDarkModePreference = localStorage.getItem('darkMode');
  // Default to dark mode if no preference or explicitly set to 'true'
  const prefersDark = initialDarkModePreference === null ||
      initialDarkModePreference === 'true';
  applyDarkMode(prefersDark);
  darkModeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark);
    applyDarkMode(isDark);
  });

  // --- Indicateur de chargement ---
  const showLoading = () => {
    loading.classList.remove('hidden');
    content.classList.add('hidden');
  };
  const hideLoading = () => {
    loading.classList.add('hidden');
    content.classList.remove('hidden');
  };

  // --- Fonction générique pour récupérer les données de l'API ---
  async function fetchData(url, options = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, options);

      if (!response.ok) {
        // Try to parse error JSON from backend
        let errorPayload = {error: `Erreur HTTP ${response.status}`};
        try {
          errorPayload = await response.json();
        } catch (e) { /* Ignore if response body is not JSON */
        }

        const errorMessage =
            errorPayload.error || `Erreur HTTP ${response.status}`;
        console.error(
            'API Error Response:', errorMessage, 'Status:', response.status);
        // Throw an error object that includes status if available
        const error = new Error(errorMessage);
        error.status = response.status;
        error.payload = errorPayload;  // Attach full payload if needed
        throw error;
      }

      // Handle cases like 204 No Content or non-JSON responses
      const contentType = response.headers.get('content-type');
      if (response.status === 204 || !contentType ||
          !contentType.includes('application/json')) {
        return null;  // Return null or an empty object for non-JSON success
      }

      return await response.json();  // Parse and return JSON body
    } catch (error) {
      // Log network errors or errors thrown from the response check
      console.error('Erreur lors de l\'appel API:', url, options, error);
      // Re-throw the error so the calling function can handle it
      throw error;
    }
  }

  // --- Fonctions de rendu pour Dashboard, UserList, UserDetail, Compare ---
  function renderDashboard(stats) {
    content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Dashboard</h1>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold text-gray-700 dark:text-light-slate mb-2">Utilisateurs Uniques</h2>
                    <p class="text-4xl font-bold text-gray-900 dark:text-white">${
        stats?.users ?? 'N/A'}</p>
                </div>
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold text-gray-700 dark:text-light-slate mb-2">Mondes Enregistrés</h2>
                    <p class="text-4xl font-bold text-gray-900 dark:text-white">${
        stats?.worlds ?? 'N/A'}</p>
                </div>
                <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold text-gray-700 dark:text-light-slate mb-2">Bases de Flags Uniques</h2>
                    <p class="text-4xl font-bold text-gray-900 dark:text-white">${
        stats?.flags ?? 'N/A'}</p>
                </div>
            </div>
        `;
    hideLoading();
  }

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
      iconSpan.className = 'sort-icon fas ml-1 ';  // Reset classes
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
      // Handle nullish values (null, undefined, 'N/A') consistently
      const isANullish = valA === null || valA === undefined || valA === 'N/A';
      const isBNullish = valB === null || valB === undefined || valB === 'N/A';
      if (isANullish && isBNullish) return 0;
      if (isANullish)
        return newDirection === 'asc' ? -1 : 1;  // Nulls first on asc
      if (isBNullish)
        return newDirection === 'asc' ? 1 : -1;  // Nulls last on desc

      let comparison = 0;
      if (typeof valA === 'string' || typeof valB === 'string') {
        comparison = String(valA).toLowerCase().localeCompare(
            String(valB).toLowerCase());
      } else if (typeof valA === 'number' || typeof valB === 'number') {
        comparison = Number(valA) - Number(valB);
      } else if (
          typeof valA === 'boolean' || typeof valB === 'boolean' ||
          key === 'blocked') {
        // Treat null/undefined blocked status differently if needed, here just
        // basic bool compare
        comparison = (valA === valB) ? 0 : (valA ? 1 : -1);
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
    if (!users) {
      users = [];
    }  // Handle null case
    currentUsersData = [...users];
    sortUsers(currentSortKey);  // Apply default/current sort
    const tableBodyHtml = generateUserTableRows(currentUsersData);

    content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Liste des Utilisateurs (${
        users.length})</h1>
            <div class="mb-4">
                <input type="text" id="userSearch" placeholder="Rechercher par username ou nom..." class="w-full md:w-1/3 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
            </div>
            <div class="bg-white dark:bg-light-navy shadow rounded-lg overflow-hidden">
                <div class="table-container"> 
                    <table class="min-w-full">
                        <thead class="bg-gray-50 dark:bg-lightest-navy sticky top-0 z-10">
                            <tr>
                                <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="username"> Username <span class="sort-icon fas ml-1"></span> </th>
                                <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="name"> Nom <span class="sort-icon fas ml-1"></span> </th>
                                <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="filiere"> Filière <span class="sort-icon fas ml-1"></span> </th>
                                <th class="sortable-header py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="flag_count"> Flags <span class="sort-icon fas ml-1"></span> </th>
                                <th class="sortable-header py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="blocked"> Statut <span class="sort-icon fas ml-1"></span> </th>
                                <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider"> Action </th>
                            </tr>
                        </thead>
                        <tbody id="userTableBody" class="divide-y divide-gray-200 dark:divide-lightest-navy">
                            ${tableBodyHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    // Add listeners for sort headers
    document.querySelectorAll('th.sortable-header').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-key');
        if (key) sortUsers(key);
      });
    });
    updateUserTableHeaderIcons(
        currentSortKey, currentSortDirection);  // Set initial icons

    // Add listener for search input
    document.getElementById('userSearch').addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      document.querySelectorAll('#userTableBody tr').forEach(row => {
        const username = row.cells[0]?.textContent.toLowerCase() || '';
        const name = row.cells[1]?.textContent.toLowerCase() || '';
        row.style.display =
            (username.includes(searchTerm) || name.includes(searchTerm)) ?
            '' :
            'none';
      });
    });
    hideLoading();
  }

  function renderUserDetail(data) {
    if (!data || !data.details) {
      content.innerHTML =
          `<div class="status-message status-error">Erreur: Données utilisateur invalides reçues.</div>`;
      hideLoading();
      return;
    }
    const {details, flags = [], last_position} =
        data;  // Default flags to empty array

    const flagsHtml = flags.length > 0 ?
        flags
            .map(
                flag => `
            <span class="flag-tag inline-block bg-gray-200 dark:bg-lightest-navy rounded-full px-3 py-1 text-sm font-semibold text-gray-700 dark:text-light-slate mr-2 mb-2 cursor-default" title="Date: ${
                    formatDate(flag.date) || 'N/A'}">
                ${flag.flag}
            </span>`)
            .join('') :
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
            formatDate(last_position.created_at)}</p>` :
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
                    <input type="text" id="flagSearch" placeholder="Filtrer les flags..." class="w-full md:w-1/3 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                </div>
                <div id="flagsContainer" class="flex-grow overflow-y-auto pr-2 max-h-[60vh]">
                   <div class="flex flex-wrap"> ${flagsHtml} </div>
                   <p class="text-gray-500 dark:text-slate italic mt-2 no-result-message hidden">Aucun flag correspondant trouvé.</p>
                </div>
            </div>
        `;

    // Add listener for flag search
    const flagSearchInput = document.getElementById('flagSearch');
    const flagsContainer = document.getElementById('flagsContainer');
    const flagTagsWrapper = flagsContainer?.querySelector('.flex-wrap');
    const flagTags = flagTagsWrapper?.querySelectorAll('.flag-tag') || [];
    const noResultMessage = flagsContainer?.querySelector('.no-result-message');

    if (flagSearchInput && noResultMessage) {
      flagSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        let anyVisible = false;
        flagTags.forEach(tag => {
          const flagText = tag.textContent?.trim().toLowerCase() || '';
          const isVisible = flagText.includes(searchTerm);
          tag.style.display = isVisible ? 'inline-block' : 'none';
          if (isVisible) anyVisible = true;
        });
        noResultMessage.classList.toggle(
            'hidden',
            anyVisible ||
                flags.length === 0);  // Show only if search term yields no
                                      // results and there were flags initially
      });
    }
    hideLoading();
  }

  function renderCompareForm(users) {
    if (!users) {
      users = [];
    }
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

    // Function to setup searchable dropdown
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
          dropdownElement.innerHTML = filteredUsers
                                          .map(
                                              user => `
                       <div class="dropdown-item p-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-navy" data-value="${
                                                  user.username}">
                           ${user.username}
                       </div>`).join('');
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
        }, 200);
      });  // Delay hiding
      dropdownElement.addEventListener(
          'mousedown', (e) => {  // Mousedown to select before blur hides it
            const item = e.target.closest('.dropdown-item');
            if (item) {
              const selectedValue = item.getAttribute('data-value');
              inputElement.value = selectedValue;
              valueElement.value = selectedValue;
              dropdownElement.classList.add('hidden');
              clearTimeout(blurTimeout);
            }
          });
    }
    setupSearchableDropdown('user1Input', 'user1Dropdown', 'user1Value');
    setupSearchableDropdown('user2Input', 'user2Dropdown', 'user2Value');

    // Form submission listener
    document.getElementById('compareForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user1 = document.getElementById('user1Value').value;
      const user2 = document.getElementById('user2Value').value;
      const resultDiv = document.getElementById('compareResult');
      resultDiv.innerHTML = '';  // Clear previous results

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

      resultDiv.innerHTML = '<div class="loader my-4"></div>';  // Show loader
      try {
        const data = await fetchData(`/compare?user1=${
            encodeURIComponent(user1)}&user2=${encodeURIComponent(user2)}`);
        renderCompareResult(data);
      } catch (error) {
        resultDiv.innerHTML =
            `<p class="status-message status-error">Erreur lors de la comparaison: ${
                error.message}</p>`;
      }
    });
    hideLoading();
  }

  function renderCompareResult(data) {
    const resultDiv = document.getElementById('compareResult');
    if (!resultDiv || !data) return;

    const renderList = (title, count, items) => `
            <div class="mb-4">
                <h3 class="text-lg font-semibold text-gray-700 dark:text-light-slate mb-2">${
        title} (${count})</h3>
                ${
        count > 0 ?
            `<ul class="list-disc list-inside text-sm text-gray-600 dark:text-slate space-y-1 max-h-60 overflow-y-auto border border-gray-200 dark:border-lightest-navy rounded p-2 bg-gray-50 dark:bg-lightest-navy">
                        ${items.map(item => `<li>${item}</li>`).join('')}
                    </ul>` :
            '<p class="text-sm text-gray-500 dark:text-slate italic">Aucun</p>'}
            </div>`;

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
            </div>`;
  }

  function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        // Try parsing common non-standard formats if necessary, or return
        // original
        return dateString;
      }
      return date.toLocaleDateString(
                 'fr-FR', {day: '2-digit', month: '2-digit', year: 'numeric'}) +
          ' ' +
          date.toLocaleTimeString(
              'fr-FR', {hour: '2-digit', minute: '2-digit'});
    } catch (e) {
      console.error('Error formatting date:', dateString, e);
      return dateString;  // Return original string if formatting fails
    }
  }


  // --- SANDBOX FUNCTIONS ---

  /**
   * Renders parameter input fields based on predefined data.
   */
  function renderParametersFromData(methodName, paramsData, paramsArea) {
    paramsArea.innerHTML = '';  // Clear previous content

    if (paramsData && Array.isArray(paramsData) && paramsData.length > 0) {
      paramsData.forEach(param => {
        // Ensure param name exists before proceeding
        if (!param || !param.name) return;

        const paramId = `param-${methodName.replace('.', '-')}-${param.name}`;
        let inputHtml;
        const typeHint = param.type || 'string';  // Default to string
        const placeholder = param.description || '';
        const required = param.required === true;  // Explicit boolean check

        // Use textarea for types needing JSON or potentially long strings
        if (typeHint.includes('list') || typeHint.includes('dict') ||
            typeHint.includes('json') || typeHint.includes('array') ||
            typeHint.includes('object')) {
          inputHtml = `
                       <label for="${
              paramId}" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">
                           ${param.name} <span class="text-xs italic">(${
              typeHint})</span>
                           ${
              required ? '<span class="text-red-500 ml-1">*</span>' : ''}
                       </label>
                       <textarea id="${paramId}" name="${
              param.name}" rows="3" placeholder="${placeholder}${
              placeholder ? ' ' : ''}${
              typeHint !== 'string' ?
                  '(Entrer JSON valide)' :
                  ''}" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white font-mono text-sm"></textarea>
                   `;
        } else {  // Default to text input for string, int, boolean, etc.
          // Determine input type based on hint
          let inputType = 'text';
          if (typeHint === 'int' || typeHint === 'number') {
            inputType = 'number';
          } else if (typeHint === 'boolean') {
            // Could use a select/checkbox, but text 'true'/'false' is simpler
            // for now
            inputType = 'text';
          }
          inputHtml = `
                       <label for="${
              paramId}" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">
                           ${param.name} <span class="text-xs italic">(${
              typeHint})</span>
                           ${
              required ? '<span class="text-red-500 ml-1">*</span>' : ''}
                       </label>
                       <input type="${inputType}" ${
              inputType === 'number' ?
                  'step="any"' :
                  ''} id="${paramId}" name="${param.name}" placeholder="${
              placeholder}" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white">
                   `;
        }
        paramsArea.innerHTML += `<div class="mb-3">${inputHtml}</div>`;
      });
    } else {
      paramsArea.innerHTML =
          '<p class="text-sm text-gray-500 dark:text-slate italic">Cette commande ne prend aucun paramètre.</p>';
    }
    // Add Execute button (always add, even if no params, for consistency)
    paramsArea.innerHTML += `
           <button class="execute-sandbox-button bg-green hover:opacity-90 text-navy font-bold py-2 px-4 rounded text-sm mt-2" data-method="${
        methodName}">
               <i class="fas fa-play mr-2"></i>Exécuter
           </button>`;
  }


  /**
   * Executes a sandbox command via the API.
   */
  async function executeSandboxCommand(
      methodName, paramsArea, resultArea, button) {
    const params = {};
    let hasError = false;
    // Query all relevant input types
    const inputs = paramsArea.querySelectorAll(
        'input[type="text"], input[type="number"], textarea');

    // Clear previous errors and results immediately
    resultArea.innerHTML = '';
    inputs.forEach(
        input => input.classList.remove(
            'border-red-500'));  // Clear previous field errors

    inputs.forEach(input => {
      if (hasError) return;  // Stop validation if an error was already found

      const name = input.name;
      let value = input.value.trim();
      const label = paramsArea.querySelector(`label[for="${input.id}"]`);
      const isRequired =
          label?.querySelector('.text-red-500') !== null;  // More robust check

      // Helper to set error state
      const setError = (message) => {
        input.classList.add('border-red-500');
        resultArea.innerHTML =
            `<div class="status-message status-error text-xs">${message}</div>`;
        hasError = true;
      };

      if (input.tagName === 'TEXTAREA') {  // Expecting JSON
        if (value) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            setError(`Erreur: Paramètre '${name}' contient du JSON invalide.`);
            console.error(`Invalid JSON for ${name}:`, input.value, e);
            return;  // Stop processing this input
          }
        } else if (isRequired) {
          setError(`Erreur: Paramètre JSON requis '${name}' est vide.`);
          return;
        } else {
          value = null;
        }  // Optional empty JSON -> null
      } else {  // Handle INPUT elements (text, number)
        if (input.type === 'number') {
          if (value !== '') {
            const numValue = Number(value);
            if (isNaN(numValue)) {
              setError(`Erreur: Paramètre numérique '${name}' invalide.`);
              return;
            } else {
              value = numValue;
            }
          } else if (isRequired) {
            setError(`Erreur: Paramètre numérique requis '${name}' vide.`);
            return;
          } else {
            value = null;
          }  // Optional empty number -> null
        } else {  // Text input (could be string, boolean as text)
          if (!value && isRequired) {
            setError(`Erreur: Paramètre requis '${name}' vide.`);
            return;
          }
          // Basic boolean conversion for 'true'/'false' strings
          if (value.toLowerCase() === 'true') {
            value = true;
          } else if (value.toLowerCase() === 'false') {
            value = false;
          }
          // Otherwise, leave as string
        }
      }

      // Only assign if no error occurred for this specific input
      if (!hasError) {
        params[name] = value;
      }
    });  // End input validation loop

    // Stop if any validation failed
    if (hasError) return;

    // --- Loading state and API call ---
    resultArea.innerHTML =
        '<div class="loader text-center my-4" style="width: 30px; height: 30px; border-width: 3px;"></div>';
    if (button) {
      button.disabled = true;
      button.classList.add('button-loading');
      button.innerHTML =
          '<i class="fas fa-spinner fa-spin mr-2"></i>Exécution...';
    }

    try {
      console.log(`Executing ${methodName} with params:`, params);
      const data = await fetchData('/sandbox/execute', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({method_name: methodName, params: params})
      });

      console.log('Sandbox API Result:', data);  // Log the raw result

      // Check if 'success' field exists and is true
      if (data && data.success === true) {
        let resultHtml;
        const resultValue = data.result;  // Use the actual result field

        // Format result based on type
        if (typeof resultValue === 'object' && resultValue !== null) {
          try {
            const jsonString = JSON.stringify(resultValue, null, 2);
            // Use highlight.js for syntax highlighting
            if (typeof hljs !== 'undefined') {
              resultHtml = `<pre><code class="language-json hljs">${
                  hljs.highlight(jsonString, {language: 'json'})
                      .value}</code></pre>`;
            } else {
              resultHtml =
                  `<pre>${jsonString}</pre>`;  // Fallback without highlight.js
            }
          } catch (e) {
            console.error('Error stringifying result object:', e);
            resultHtml =
                `<pre>${String(resultValue)}</pre>`;  // Fallback basic pre if
                                                      // stringify fails
          }
        } else {
          // Handle primitive types (string, number, boolean, null, undefined)
          const displayValue =
              (resultValue === undefined || resultValue === null) ?
              'null' :
              String(resultValue);
          resultHtml = `<pre>${displayValue}</pre>`;
        }

        resultArea.innerHTML = `<div class="mt-4">
              <strong class="text-green-500">Succès:</strong>
              ${resultHtml}
            </div>`;

      } else {  // Handle cases where success is false or data format is
                // unexpected
        const errorMessage =
            data?.error || 'Erreur inconnue renvoyée par le serveur.';
        resultArea.innerHTML = `<div class="status-message status-error mt-4">
            <strong class="font-bold">Échec!</strong><br>
            <pre class="text-xs whitespace-pre-wrap">${errorMessage}</pre>
          </div>`;
      }

    } catch (error) {  // Handle network errors or errors during fetchData
      console.error(`Error executing ${methodName}:`, error);
      // Display error message from the caught error object
      resultArea.innerHTML = `<div class="status-message status-error mt-4">
          <strong class="font-bold">Erreur!</strong><br>
          <pre class="text-xs whitespace-pre-wrap">${
          error.message ||
          'Impossible de contacter le serveur ou erreur inattendue.'}</pre>
        </div>`;
    } finally {
      // --- Re-enable button ---
      if (button) {
        button.disabled = false;
        button.classList.remove('button-loading');
        button.innerHTML = '<i class="fas fa-play mr-2"></i>Exécuter';
      }
    }
  }


  /**
   * Renders the Sandbox view with command cards.
   */
  function renderSandbox(commandsWithParams) {
    if (!commandsWithParams || !Array.isArray(commandsWithParams)) {
      console.error(
          'Invalid data received for renderSandbox:', commandsWithParams);
      content.innerHTML =
          `<div class="status-message status-error">Erreur: Impossible de charger les commandes Sandbox.</div>`;
      hideLoading();
      return;
    }

    // Store the parameter data in a Map for easy access later
    const commandDataMap = new Map();
    commandsWithParams.forEach(cmd => {
      // Ensure cmd and cmd.name exist before setting
      if (cmd && cmd.name) {
        commandDataMap.set(
            cmd.name,
            cmd.params || []);  // Default to empty array if params missing
      }
    });

    // Generate HTML for each command card
    const commandCardsHtml =
        commandsWithParams
            .filter(
                cmd => cmd &&
                    cmd.name)  // Filter out any potential invalid entries
            .map(
                cmd => `
      <div class="sandbox-card bg-white dark:bg-light-navy p-4 rounded-lg shadow mb-4 cursor-pointer" data-method-name="${
                    cmd.name}">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white pointer-events-none">${
                    cmd.name}</h3>
          <div>
             ${
                    cmd.kerberized ?
                        '<span class="text-xs bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-300 px-2 py-1 rounded-full font-medium pointer-events-none">Kerberized</span>' :
                        ''}
          </div>
        </div>

        <div class="params-area border-t border-gray-200 dark:border-lightest-navy pt-3 mt-3 hidden">

        </div>

        <div class="result-area mt-2">

        </div>
      </div>
    `).join('');

    // Set main content HTML
    content.innerHTML = `
      <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Sandbox Kerberos</h1>
      <div class="mb-6">
        <input type="search" id="sandboxSearch" placeholder="Rechercher une commande..." class="w-full md:w-1/2 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
      </div>
      <div id="commandList">
        ${commandCardsHtml}
        <p id="noResultsMessage" class="text-gray-500 dark:text-slate italic hidden">Aucune commande trouvée.</p>
      </div>
    `;

    // --- Add Event Listeners ---
    const commandList = document.getElementById('commandList');
    const searchInput = document.getElementById('sandboxSearch');
    const noResultsMessage = document.getElementById('noResultsMessage');

    // Search Functionality
    if (searchInput && commandList && noResultsMessage) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const cards = commandList.querySelectorAll('.sandbox-card');
        let visibleCount = 0;
        cards.forEach(card => {
          const methodName = card.dataset.methodName?.toLowerCase() ||
              '';  // Use dataset for robustness
          const isVisible = methodName.includes(searchTerm);
          card.style.display = isVisible ? 'block' : 'none';
          if (isVisible) visibleCount++;
        });
        noResultsMessage.style.display = visibleCount === 0 ? 'block' : 'none';
      });
    }

    // Event delegation for Card Clicks (Toggle) and Execute Button Clicks
    if (commandList) {
      commandList.addEventListener('click', (e) => {
        const card = e.target.closest('.sandbox-card');
        if (!card) return;  // Clicked outside a card

        const paramsArea = card.querySelector('.params-area');
        const resultArea = card.querySelector('.result-area');
        const executeButton = e.target.closest('.execute-sandbox-button');
        const methodName =
            card.dataset.methodName;  // Get method name from card dataset

        // --- Handle Execute Button Click ---
        if (executeButton) {
          // Ensure methodName is valid before executing
          if (methodName && paramsArea && resultArea) {
            executeSandboxCommand(
                methodName, paramsArea, resultArea, executeButton);
          } else {
            console.error(
                'Cannot execute: Missing method name, params area, or result area.');
          }
          return;  // Stop processing here for execute button
        }

        // --- Prevent Toggle if clicking inside interactive elements ---
        if (!paramsArea.classList.contains(
                'hidden')) {  // Only check if params area is visible
          if (e.target.closest('input, textarea, label, select, button')) {
            // Allow interaction with form elements within the params area
            // without toggling collapse
            return;
          }
        }
        // --- Prevent Toggle if clicking inside the result area ---
        if (e.target.closest('.result-area')) {
          return;  // Don't toggle if clicking results
        }

        // --- Handle Card Click for Toggling Details ---
        if (methodName && paramsArea && resultArea) {  // Check elements exist
          const isHidden = paramsArea.classList.contains('hidden');
          if (isHidden) {
            // Expand: Render parameters from stored data and show
            const paramsData = commandDataMap.get(methodName);
            renderParametersFromData(
                methodName, paramsData, paramsArea);  // Render inputs
            paramsArea.classList.remove('hidden');
            resultArea.innerHTML = '';  // Clear previous results when expanding
          } else {
            // Collapse: Hide and clear content
            paramsArea.classList.add('hidden');
            paramsArea.innerHTML = '';
            resultArea.innerHTML = '';  // Also clear results when collapsing
          }
        } else {
          console.error(
              'Cannot toggle: Missing method name or internal card elements.');
        }
      });
    }  // End if(commandList)

    hideLoading();  // Hide main loader once sandbox is rendered
  }  // --- End renderSandbox ---


  // --- Logique de Routage Côté Client ---
  async function handleRouteChange() {
    const hash = window.location.hash || '#dashboard';  // Default to dashboard
    setActiveLink(hash);  // Highlight the correct sidebar link
    showLoading();        // Show main loading indicator

    // Reset user list sort state if navigating away
    if (hash !== '#users' && !hash.startsWith('#user/')) {
      currentSortKey = 'username';
      currentSortDirection = 'asc';
    }

    try {
      // Clear previous errors shown in the main content area
      if (content.querySelector('.status-error')) content.innerHTML = '';

      // --- Route Handling ---
      if (hash === '#dashboard') {
        const data = await fetchData('/stats');
        renderDashboard(data);
      } else if (hash === '#users') {
        currentSortKey = 'username';
        currentSortDirection = 'asc';  // Reset sort for user list
        const data = await fetchData('/users');
        renderUserList(data);
      } else if (hash.startsWith('#user/')) {
        const username = decodeURIComponent(hash.substring(6));
        const data = await fetchData(`/user/${username}`);
        renderUserDetail(data);
      } else if (hash === '#compare') {
        const users = await fetchData('/users');
        renderCompareForm(users);  // Needs user list for dropdowns
      } else if (hash === '#sandbox') {
        // Fetch the command list *with parameters included*
        const commandsWithParams = await fetchData('/sandbox/commands');
        renderSandbox(commandsWithParams);  // Pass the enriched list to the
                                            // render function
      } else {                              // Fallback for unknown hash
        content.innerHTML =
            `<h1 class="text-xl text-red-500">Page non trouvée</h1><p>Le lien ${
                hash} ne correspond à aucune section connue.</p>`;
        hideLoading();  // Ensure loader is hidden even for error/unknown pages
      }
    } catch (error) {
      // Handle errors during fetch or rendering for the main content area
      console.error('Erreur lors du chargement de la route:', hash, error);
      // Display error message in the content area
      content.innerHTML = `<div class="status-message status-error">
          <strong class="font-bold">Erreur de chargement!</strong><br>
          Impossible de charger la section '${hash}'. Raison: ${error.message}
          ${error.status ? ` (Code: ${error.status})` : ''}
        </div>`;
      hideLoading();  // Ensure global loader is hidden on error
    }
  }  // --- End handleRouteChange ---

  // --- Met à jour le lien actif dans la sidebar ---
  function setActiveLink(hash) {
    navLinks.forEach(link => {
      const linkHref = link.getAttribute('href');
      let isActive = false;
      try {
        // Decode hash and href to handle encoded characters consistently
        const decodedHash = decodeURIComponent(hash);
        const decodedHref = decodeURIComponent(linkHref);

        // Special case: Highlight 'Users' link when viewing a user detail page
        if (decodedHash.startsWith('#user/') && decodedHref === '#users') {
          isActive = true;
        } else {
          isActive = decodedHref === decodedHash;  // Standard comparison
        }
      } catch (e) {
        // Fallback for potential decoding errors (less likely with simple
        // hashes)
        isActive = linkHref === hash;
      }

      // Apply/remove active classes based on state and dark mode
      link.classList.toggle('active', isActive);
      link.classList.toggle(
          'bg-gray-200',
          isActive && !document.documentElement.classList.contains('dark'));
      link.classList.toggle(
          'dark:bg-lightest-navy',
          isActive && document.documentElement.classList.contains('dark'));
      link.classList.toggle('font-semibold', isActive);
      // Specific text color for active link based on dark mode
      if (isActive) {
        link.classList.add(
            document.documentElement.classList.contains('dark') ?
                'dark:text-green' :
                'text-gray-900');
      } else {
        // Ensure active text colors are removed if not active
        link.classList.remove('dark:text-green', 'text-gray-900');
      }
    });
  }


  // --- Gestion Bouton Update DB ---
  if (updateDbButton && updateStatusDiv) {
    updateDbButton.addEventListener('click', async () => {
      updateDbButton.disabled = true;
      updateDbButton.classList.add('button-loading');
      updateDbButton.innerHTML =
          '<i class="fas fa-sync-alt fa-spin mr-2 w-4 text-center"></i>Mise à jour...';
      updateStatusDiv.innerHTML =
          '<div class="status-message status-info">Lancement de la mise à jour...</div>';
      try {
        const result = await fetchData('/update-db', {method: 'POST'});
        if (result && result.success) {
          updateStatusDiv.innerHTML =
              `<div class="status-message status-success">
                          <strong class="font-bold">Succès!</strong><br>
                          <pre class="text-xs whitespace-pre-wrap">${
                  result.message || 'Mise à jour terminée.'}</pre>
                       </div>`;
          // Optionally refresh current view after success
          setTimeout(handleRouteChange, 1500);
        } else {
          // Handle API returning success: false
          updateStatusDiv.innerHTML = `<div class="status-message status-error">
                          <strong class="font-bold">Échec!</strong><br>
                          <pre class="text-xs whitespace-pre-wrap">${
              result?.error || 'Erreur inconnue du serveur.'}</pre>
                       </div>`;
        }
      } catch (error) {  // Handle network errors or fetch exceptions
        updateStatusDiv.innerHTML = `<div class="status-message status-error">
                     <strong class="font-bold">Erreur!</strong><br>
                     <pre class="text-xs whitespace-pre-wrap">${
            error.message || 'Impossible de contacter le serveur.'}</pre>
                  </div>`;
      } finally {
        // Re-enable button after a short delay, regardless of outcome
        setTimeout(() => {
          updateDbButton.disabled = false;
          updateDbButton.classList.remove('button-loading');
          updateDbButton.innerHTML =
              '<i class="fas fa-sync-alt mr-2 w-4 text-center"></i>Actualiser DB';
          // Optionally clear status message after longer delay
          // setTimeout(() => { updateStatusDiv.innerHTML = ''; }, 8000);
        }, 1000);
      }
    });
  } else {
    console.warn(
        'Le bouton d\'update (#updateDbButton) ou le div de statut (#updateStatus) n\'a pas été trouvé.');
  }


  // --- Chargement Initial et Écouteurs d'Événements ---
  window.addEventListener(
      'hashchange', handleRouteChange);  // Listen for hash changes
  handleRouteChange();  // Load initial content based on current hash or default

  // Initialize highlight.js (check if it's loaded first)
  if (typeof hljs !== 'undefined') {
    // No need to call highlightAll, we apply it dynamically in
    // executeSandboxCommand
    console.log('highlight.js ready for dynamic highlighting.');
  } else {
    console.warn(
        'highlight.js not loaded - JSON results in Sandbox won\'t be syntax highlighted.');
  }
});  // End DOMContentLoaded