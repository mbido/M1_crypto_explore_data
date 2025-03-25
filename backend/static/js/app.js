// backend/static/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // Références aux éléments DOM principaux
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const navLinks = document.querySelectorAll('.nav-link');
  const darkModeToggle = document.getElementById('darkModeToggle');

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

  // --- Fonction générique pour récupérer les données de l'API ---
  async function fetchData(url) {
    // Ne pas montrer le loader global ici si on en montre un spécifique (ex:
    // compare) showLoading(); // Remplacé par des loaders plus spécifiques si
    // besoin
    try {
      const response = await fetch(`${API_BASE_URL}${url}`);
      if (!response.ok) {
        const errorData = await response.json().catch(
            () => ({error: `Erreur HTTP ${response.status}`}));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Erreur lors de la récupération des données:', error);
      content.innerHTML =  // Display error in main content area if fetch fails
                           // significantly
          `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
              <strong class="font-bold">Erreur!</strong>
              <span class="block sm:inline"> ${error.message}</span>
           </div>`;
      hideLoading();  // Ensure loader is hidden even on fetch error
      return null;
    } finally {
      // hideLoading() is called by individual render functions or error
      // handlers
    }
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

  // Fonction pour générer les lignes du tableau (tbody)
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

  // Fonction pour mettre à jour les icônes de tri dans les en-têtes
  function updateUserTableHeaderIcons(activeKey, direction) {
    document.querySelectorAll('th.sortable-header').forEach(th => {
      const iconSpan = th.querySelector('.sort-icon');
      if (!iconSpan) return;

      const key = th.getAttribute('data-sort-key');
      // Use specific classes, removing general 'fas' if needed, adding it back
      // if icon shown
      iconSpan.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
      iconSpan.classList.add(
          'fas');  // Ensure fas is always there if an icon should show

      if (key === activeKey) {
        iconSpan.classList.add(
            direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      } else {
        iconSpan.classList.add('fa-sort');  // Default icon
      }
    });
  }

  // Fonction de tri des utilisateurs
  function sortUsers(key) {
    // Détermine la nouvelle direction
    const newDirection =
        (key === currentSortKey && currentSortDirection === 'asc') ? 'desc' :
                                                                     'asc';

    currentUsersData.sort((a, b) => {
      let valA, valB;

      // Gère les clés spéciales comme 'name'
      if (key === 'name') {
        valA =
            `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase().trim();
        valB =
            `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase().trim();
      } else {
        valA = a[key];
        valB = b[key];
      }

      // Gestion basique des types (à améliorer si nécessaire pour
      // null/undefined etc.)
      const typeA = typeof valA;
      const typeB = typeof valB;  // Check both types in case of mixed data

      // Traitement des null/undefined ou N/A comme "inférieur" ou vide
      // Consistent handling ensures they group together
      let isANullish = valA === null || valA === undefined || valA === 'N/A';
      let isBNullish = valB === null || valB === undefined || valB === 'N/A';

      if (isANullish && isBNullish) return 0;  // Both nullish, treat as equal
      if (isANullish)
        return newDirection === 'asc' ? -1 :
                                        1;  // A is nullish, comes first in asc
      if (isBNullish)
        return newDirection === 'asc' ? 1 :
                                        -1;  // B is nullish, comes first in asc

      // Now compare non-nullish values
      let comparison = 0;
      if (typeA === 'string' ||
          typeB === 'string') {  // If either is string, compare as strings
        comparison = String(valA).toLowerCase().localeCompare(
            String(valB).toLowerCase());
      } else if (typeA === 'number' || typeB === 'number') {  // If either is
                                                              // number, compare
                                                              // as numbers
        comparison = Number(valA) - Number(valB);
      } else if (typeA === 'boolean' || typeB === 'boolean') {  // If either is
                                                                // boolean
        // false < true
        comparison = (valA === valB) ? 0 : (valA ? 1 : -1);
      } else if (key === 'blocked') {  // Handle null boolean case explicitly
        const blockedA = a.blocked === true;  // Convert null/undefined to false
        const blockedB = b.blocked === true;
        comparison = (blockedA === blockedB) ?
            0 :
            (blockedA ? 1 : -1);  // Blocked (true) sorts later in asc
      }

      // Apply direction (comparison already handles non-nullish)
      return newDirection === 'asc' ? comparison : comparison * -1;
    });

    // Met à jour l'état global du tri
    currentSortKey = key;
    currentSortDirection = newDirection;

    // Met à jour le tbody et les icônes d'en-tête
    const userTableBody = document.getElementById('userTableBody');
    if (userTableBody) {
      userTableBody.innerHTML = generateUserTableRows(currentUsersData);
    }
    updateUserTableHeaderIcons(currentSortKey, currentSortDirection);
  }


  // Génère le HTML de la liste des utilisateurs (initial)
  function renderUserList(users) {
    // Stocke les données pour le tri ultérieur
    currentUsersData =
        [...users];  // Crée une copie pour éviter de modifier l'original

    // Appliquer le tri actuel (important si on revient sur la page)
    // Tri par défaut est username asc (soit par API, soit par état initial)
    sortUsers(currentSortKey);  // Applique le tri en cours ou initial
    // Note: La ligne ci-dessus va aussi générer le HTML via
    // generateUserTableRows et l'insérer.
    const tableBodyHtml =
        generateUserTableRows(currentUsersData);  // Génère le HTML trié

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
                                <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="username">
                                    Username <span class="sort-icon fas ml-1"></span>
                                </th>
                                <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="name">
                                    Nom <span class="sort-icon fas ml-1"></span>
                                </th>
                                <th class="sortable-header py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="filiere">
                                    Filière <span class="sort-icon fas ml-1"></span>
                                </th>
                                <th class="sortable-header py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="flag_count">
                                    Flags <span class="sort-icon fas ml-1"></span>
                                </th>
                                <th class="sortable-header py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider cursor-pointer" data-sort-key="blocked">
                                    Statut <span class="sort-icon fas ml-1"></span>
                                </th>
                                <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-light-slate uppercase tracking-wider">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody id="userTableBody" class="divide-y divide-gray-200 dark:divide-lightest-navy">
                            ${tableBodyHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    // --- Ajout des écouteurs pour le tri ---
    document.querySelectorAll('th.sortable-header').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-key');
        if (key) {
          sortUsers(key);  // This will re-render the tbody and update icons
        }
      });
    });

    // Met à jour les icônes pour le tri initial (ou actuel si re-rendu)
    updateUserTableHeaderIcons(currentSortKey, currentSortDirection);

    // Active la fonctionnalité de recherche après l'insertion du HTML
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

    hideLoading();  // Masquer le loader une fois tout rendu et configuré
  }


  // Génère le HTML de la page de détail d'un utilisateur
  function renderUserDetail(data) {
    const {details, flags, last_position} = data;

    const flagsHtml = flags.length > 0 ?
        flags
            .map(
                flag => `
            <span class="flag-tag inline-block bg-gray-200 dark:bg-lightest-navy rounded-full px-3 py-1 text-sm font-semibold text-gray-700 dark:text-light-slate mr-2 mb-2 cursor-default" title="Date: ${
                    formatDate(flag.date) || 'N/A'}">
                ${flag.flag}
            </span>
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

    // Active le filtrage des flags
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
      // Show 'no result' only if search term is not empty and nothing is
      // visible
      noResultMessage.classList.toggle('hidden', anyVisible || !searchTerm);
    });
    hideLoading();  // Masquer le loader
  }

  // Génère le HTML du formulaire de comparaison (avec dropdowns recherchables)
  function renderCompareForm(users) {
    // Store users data for filtering, sorted for initial display perhaps
    const availableUsers =
        [...users].sort((a, b) => a.username.localeCompare(b.username));

    // Structure HTML - Replaced <select> with input + dropdown div
    content.innerHTML = `
        <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Comparer les Flags (Bases)</h1>
        <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow mb-6">
            <form id="compareForm" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <!-- User 1 Selector -->
                <div class="relative">
                    <label for="user1Input" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Utilisateur 1</label>
                    <input type="text" id="user1Input" placeholder="Rechercher utilisateur..." autocomplete="off"
                           class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                    <input type="hidden" name="user1" id="user1Value">
                    <div id="user1Dropdown" class="user-dropdown absolute z-20 w-full bg-white dark:bg-lightest-navy border border-gray-300 dark:border-slate rounded mt-1 max-h-60 overflow-y-auto hidden shadow-lg">
                        <!-- Options will be populated here -->
                    </div>
                </div>

                <!-- User 2 Selector -->
                <div class="relative">
                    <label for="user2Input" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Utilisateur 2</label>
                    <input type="text" id="user2Input" placeholder="Rechercher utilisateur..." autocomplete="off"
                           class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                    <input type="hidden" name="user2" id="user2Value">
                    <div id="user2Dropdown" class="user-dropdown absolute z-20 w-full bg-white dark:bg-lightest-navy border border-gray-300 dark:border-slate rounded mt-1 max-h-60 overflow-y-auto hidden shadow-lg">
                        <!-- Options will be populated here -->
                    </div>
                </div>

                <button type="submit" class="bg-blue-500 hover:bg-blue-600 md:bg-green md:hover:opacity-90 text-white md:text-navy font-bold py-2 px-4 rounded h-10">
                    Comparer
                </button>
            </form>
        </div>
        <div id="compareResult" class="mt-6"></div>
    `;

    // --- Logic for Searchable Dropdowns ---
    function setupSearchableDropdown(inputId, dropdownId, valueId) {
      const inputElement = document.getElementById(inputId);
      const dropdownElement = document.getElementById(dropdownId);
      const valueElement = document.getElementById(valueId);
      let blurTimeout;  // To handle click vs blur race condition

      // Function to render dropdown options
      const renderOptions = (filterTerm = '') => {
        const lowerFilterTerm = filterTerm.toLowerCase();
        // Filter based on username containing the filter term
        const filteredUsers = availableUsers.filter(
            user => user.username.toLowerCase().includes(lowerFilterTerm));

        if (filteredUsers.length === 0 &&
            filterTerm) {  // Show 'not found' only if searching
          dropdownElement.innerHTML =
              `<div class="p-2 text-sm text-gray-500 dark:text-slate italic">Aucun utilisateur trouvé</div>`;
        } else if (filteredUsers.length === 0 && !filterTerm) {  // Show all if
                                                                 // input is
                                                                 // empty
          dropdownElement.innerHTML = availableUsers
                                          .map(
                                              user => `
            <div class="dropdown-item p-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-navy" data-value="${
                                                  user.username}">
              ${user.username}
            </div>
          `).join('');
        } else {  // Show filtered results
          dropdownElement.innerHTML = filteredUsers
                                          .map(
                                              user => `
            <div class="dropdown-item p-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-navy" data-value="${
                                                  user.username}">
              ${user.username}
            </div>
          `).join('');
        }
        dropdownElement.classList.remove('hidden');
      };

      // Event Listener: Input typing
      inputElement.addEventListener('input', () => {
        valueElement.value =
            '';  // Clear hidden value if user types manually (selection needed)
        renderOptions(inputElement.value);
      });

      // Event Listener: Focus on input
      inputElement.addEventListener('focus', () => {
        clearTimeout(blurTimeout);  // Cancel pending blur hide
        renderOptions(
            inputElement
                .value);  // Show dropdown, potentially filtered or full list
      });

      // Event Listener: Blur from input (hide dropdown with delay)
      inputElement.addEventListener('blur', () => {
        // Delay hiding to allow click event on dropdown items to register
        blurTimeout = setTimeout(() => {
          dropdownElement.classList.add('hidden');
          // Optional: Validate if the text input matches the hidden value after
          // blur
          if (inputElement.value !== valueElement.value) {
            // If user typed something but didn't select, revert to selected
            // value or clear
            inputElement.value =
                valueElement.value;  // Revert to last valid selection
          }
        }, 200);  // 200ms delay feels about right
      });

      // Event Listener: Click on a dropdown item (using delegation on
      // mousedown)
      dropdownElement.addEventListener('mousedown', (e) => {
        // Use mousedown to register before blur potentially hides the dropdown
        const item =
            e.target.closest('.dropdown-item');  // Find the item even if click
                                                 // is on child element
        if (item) {
          const selectedValue = item.getAttribute('data-value');
          inputElement.value = selectedValue;  // Update visible input
          valueElement.value =
              selectedValue;  // Update hidden input (used for form submission)
          dropdownElement.classList.add('hidden');  // Hide dropdown
          clearTimeout(
              blurTimeout);     // Prevent the blur timeout from hiding again
          inputElement.blur();  // Optionally remove focus after selection
        }
      });

      // Initialize dropdown content (show all initially on focus)
      // renderOptions(); // Optionally pre-populate on render, but focus
      // handles it
    }

    // Setup for both dropdowns
    setupSearchableDropdown('user1Input', 'user1Dropdown', 'user1Value');
    setupSearchableDropdown('user2Input', 'user2Dropdown', 'user2Value');

    // Add event listener for form submission (reads from hidden inputs)
    document.getElementById('compareForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      // Read values from the hidden inputs now
      const user1 = document.getElementById('user1Value').value;
      const user2 = document.getElementById('user2Value').value;
      const resultDiv = document.getElementById('compareResult');
      resultDiv.innerHTML = '';  // Clear previous results

      // --- Validation ---
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

      // Check if selected values are valid users (they should be if selected
      // via dropdown) This is a safety check in case something went wrong.
      const user1Exists = availableUsers.some(u => u.username === user1);
      const user2Exists = availableUsers.some(u => u.username === user2);

      if (!user1Exists || !user2Exists) {
        // This case should ideally not happen if selection logic is correct
        resultDiv.innerHTML =
            '<p class="text-red-500">Erreur interne: Un ou les deux utilisateurs sélectionnés sont invalides.</p>';
        return;
      }

      // --- Proceed with comparison API call ---
      resultDiv.innerHTML =
          '<div class="loader my-4"></div>';  // Show specific loader for
                                              // comparison result area
      // Don't show the main content loader via fetchData if we show a local one
      const data = await fetchData(`/compare?user1=${
          encodeURIComponent(user1)}&user2=${encodeURIComponent(user2)}`);
      if (data) {
        renderCompareResult(data);  // Renders the results, replaces the loader
      } else {
        // Error message is already shown by fetchData in the main content.
        // Clear the local loader/result area in case of fetch error.
        resultDiv.innerHTML =
            '<p class="text-red-500">Erreur lors de la récupération de la comparaison. Voir message ci-dessus.</p>';
      }
    });

    hideLoading();  // Hide global loader after form is rendered and setup
  }


  // Génère le HTML pour afficher les résultats de la comparaison
  function renderCompareResult(data) {
    const resultDiv = document.getElementById(
        'compareResult');    // Should exist from renderCompareForm
    if (!resultDiv) return;  // Safety check

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
            </div>
        `;

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
    // No need to call hideLoading() here, it was handled by the caller or
    // fetchData
  }

  // --- Helper pour formater les dates ISO en format lisible ---
  function formatDate(dateString) {
    if (!dateString || dateString === 'N/A')
      return 'N/A';  // Handle explicit N/A
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime()))
        return dateString;  // Return original if invalid date
      // Format to DD/MM/YYYY HH:MM
      return date.toLocaleDateString(
                 'fr-FR', {day: '2-digit', month: '2-digit', year: 'numeric'}) +
          ' ' +
          date.toLocaleTimeString(
              'fr-FR', {hour: '2-digit', minute: '2-digit'});
    } catch (e) {
      console.error('Error formatting date:', dateString, e);
      return dateString;  // Fallback to original string on error
    }
  }

  // --- Logique de Routage côté Client ---
  async function handleRouteChange() {
    const hash = window.location.hash || '#dashboard';
    setActiveLink(hash);
    showLoading();  // Show global loader before any fetch/render

    // Réinitialise l'état du tri quand on quitte/revient à la page users
    if (hash !== '#users' && !hash.startsWith('#user/')) {
      currentSortKey = 'username';  // Reset sort state if navigating away from
                                    // user list/detail
      currentSortDirection = 'asc';
      // currentUsersData = []; // Clear cached user data only if necessary,
      // might speed up return
    }

    try {
      if (hash === '#dashboard') {
        const data = await fetchData('/stats');
        if (data)
          renderDashboard(data);
        else
          hideLoading();  // Hide if fetch failed
      } else if (hash === '#users') {
        // Explicitly set default sort when navigating TO #users
        currentSortKey = 'username';
        currentSortDirection = 'asc';
        const data =
            await fetchData('/users');  // API provides default sort by username
        if (data) {
          renderUserList(
              data);  // This function now calls hideLoading internally
        } else {
          hideLoading();  // Hide if fetch failed
        }
      } else if (hash.startsWith('#user/')) {
        const username = decodeURIComponent(hash.substring(6));
        const data = await fetchData(`/user/${username}`);
        if (data)
          renderUserDetail(data);
        else
          hideLoading();  // Hide if fetch failed
      } else if (hash === '#compare') {
        // Fetch users needed for the dropdowns
        const users = await fetchData('/users');
        if (users) {
          renderCompareForm(
              users);  // This function now calls hideLoading internally
        } else {
          // Error already shown by fetchData, just make sure loader is hidden
          hideLoading();
          // Optionally add context: content.innerHTML += '<p
          // class="text-red-500">Impossible de charger les utilisateurs pour la
          // comparaison.</p>';
        }
      } else {
        // Handle unknown hash
        content.innerHTML =
            `<h1 class="text-xl">Page non trouvée</h1><p>Le lien ${
                hash} ne correspond à aucune section.</p>`;
        hideLoading();  // Hide for unknown route
      }
    } catch (error) {
      // Catch unexpected errors during routing/rendering process
      console.error('Erreur inattendue pendant le changement de route:', error);
      if (!content.querySelector(
              '.bg-red-100')) {  // Avoid duplicate error messages if fetchData
                                 // already showed one
        content.innerHTML =
            `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
              <strong class="font-bold">Erreur!</strong>
              <span class="block sm:inline"> Une erreur système s'est produite lors du chargement de la page.</span>
             </div>`;
      }
      hideLoading();  // Ensure loader is hidden on any error
    }
  }

  // Met à jour la classe 'active' sur le lien de navigation courant
  function setActiveLink(hash) {
    navLinks.forEach(link => {
      const linkHref = link.getAttribute('href');
      let isActive = false;
      try {
        // Special case: Make "Utilisateurs" link active when viewing a specific
        // user detail page
        if (hash.startsWith('#user/') && linkHref === '#users') {
          isActive = true;
        } else {
          // Standard comparison, decode both for safety with special chars in
          // usernames
          isActive = decodeURIComponent(linkHref) === decodeURIComponent(hash);
        }
      } catch (e) {
        // Fallback if decoding fails (unlikely)
        isActive = linkHref === hash;
        console.warn(
            'Failed to decode URI component for link comparison:', linkHref,
            hash, e);
      }

      link.classList.toggle('active', isActive);
      // Apply visual styles based on active state and dark mode
      link.classList.toggle(
          'bg-gray-200',
          isActive && !document.documentElement.classList.contains('dark'));
      link.classList.toggle(
          'dark:bg-lightest-navy',
          isActive && document.documentElement.classList.contains('dark'));
      link.classList.toggle('font-semibold', isActive);
      link.classList.toggle(
          'text-gray-900',
          isActive &&
              !document.documentElement.classList.contains(
                  'dark'));  // Ensure active text color in light mode
      link.classList.toggle(
          'dark:text-green',
          isActive &&
              document.documentElement.classList.contains(
                  'dark'));  // Ensure active text color in dark mode
                             // Reset non-active styles explicitly if needed,
                             // though Tailwind's base usually handles this
      if (!isActive) {
        link.classList.remove('text-gray-900', 'dark:text-green');
      }
    });
  }

  // --- Chargement Initial et Écouteurs d'Événements ---
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();  // Load initial content based on current hash or default
                        // #dashboard
});