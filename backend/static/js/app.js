// backend/static/js/app.js

document
    .addEventListener(
        'DOMContentLoaded', () => {
          // --- Références DOM et Constantes ---
          const content = document.getElementById('content');
          const loading = document.getElementById('loading');
          const navLinks = document.querySelectorAll('.nav-link');
          const darkModeToggle = document.getElementById('darkModeToggle');
          const updateDbButton = document.getElementById('updateDbButton');
          const updateStatusDiv = document.getElementById('updateStatus');
          const updateWorldsButton =
              document.getElementById('updateWorldsButton');
          const updateWorldsStatusDiv =
              document.getElementById('updateWorldsStatus');
          const notesArea = document.getElementById('notesArea');
          const API_BASE_URL =
              '/api';  // Assuming Flask runs on the same domain/port

          // --- Variables d'état ---
          let currentSortKey = 'username';
          let currentSortDirection = 'asc';
          let currentUsersData = [];
          // NOUVEAU: Garder une trace du world_id utilisé pour le dernier DFS
          let currentTeleportWorldId = null;

          // --- Gestion Mode Sombre ---
          // ... (code inchangé) ...
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


          // --- Indicateur de chargement ---
          // ... (code inchangé) ...
          const showLoading = () => {
            loading.classList.remove('hidden');
            content.classList.add('hidden');
          };
          const hideLoading = () => {
            loading.classList.add('hidden');
            content.classList.remove('hidden');
          };

          // --- Fonction générique pour récupérer les données de l'API ---
          // ... (code inchangé - gestion des erreurs améliorée déjà présente)
          // ...
          async function fetchData(url, options = {}) {
            // Default headers
            const defaultHeaders = {
              'Accept': 'application/json',  // Expect JSON response
            };
            // Add Content-Type header if body exists and is not FormData
            if (options.body && !(options.body instanceof FormData)) {
              defaultHeaders['Content-Type'] = 'application/json';
              // Stringify body if it's an object
              if (typeof options.body !== 'string') {
                options.body = JSON.stringify(options.body);
              }
            }

            // Merge default headers with provided headers
            options.headers = {...defaultHeaders, ...options.headers};


            try {
              console.log(
                  `Fetching: ${API_BASE_URL}${url}`,
                  options);  // Log the request
              const response = await fetch(`${API_BASE_URL}${url}`, options);

              // --- Enhanced Error Handling ---
              let responseData = null;
              const contentType = response.headers.get('content-type');

              // Try parsing JSON regardless of status code, as errors might
              // have JSON body
              if (contentType && contentType.includes('application/json')) {
                try {
                  responseData = await response.json();
                  console.log(
                      `Response JSON for ${url}:`,
                      responseData);  // Log parsed JSON
                } catch (e) {
                  console.error(`Failed to parse JSON response for ${url}`, e);
                  // If parsing fails on non-OK status, create a generic error
                  if (!response.ok) {
                    throw new Error(`Erreur HTTP ${
                        response.status} (Réponse non-JSON ou invalide)`);
                  }
                  // If parsing fails on OK status, maybe return a success
                  // indicator? Or throw, depending on expected behavior for
                  // that endpoint
                  responseData = {
                    success: true,
                    warning: 'Réponse OK mais JSON invalide.'
                  };
                }
              } else if (!response.ok) {
                // Handle non-JSON errors
                const textResponse =
                    await response.text();  // Get text for context
                console.error(
                    `Non-JSON Error Response Text for ${url}:`, textResponse);
                throw new Error(`Erreur HTTP ${response.status}. Réponse: ${
                    textResponse.substring(0, 100)}...`);
              } else {
                // Handle non-JSON success (e.g., 204 No Content)
                console.log(`Successful non-JSON response for ${url}, Status: ${
                    response.status}`);
                responseData = {success: true, status: response.status};
              }


              // --- Check response status AFTER attempting to parse body ---
              if (!response.ok) {
                // Use error message from parsed JSON if available, otherwise
                // construct one
                const errorMessage = responseData?.error ||
                    responseData?.message || `Erreur HTTP ${response.status}`;
                console.error(
                    'API Error Response:', errorMessage,
                    'Status:', response.status, 'Payload:', responseData);
                const error = new Error(errorMessage);
                error.status = response.status;
                error.payload = responseData;  // Attach full payload
                throw error;
              }

              // Return the parsed data (or the constructed success object for
              // non-JSON OK)
              return responseData;

            } catch (error) {
              // Catch network errors or errors thrown from response handling
              console.error(`Erreur lors de l'appel API vers ${url}:`, error);
              // Re-throw the error so the calling function can handle it
              // specifically
              throw error;
            }
          }


          // --- Fonctions de rendu pour Dashboard, UserList, UserDetail,
          // Compare ---
          // ... (renderDashboard, generateUserTableRows,
          // updateUserTableHeaderIcons, sortUsers, renderUserList,
          // renderUserDetail, renderCompareForm, renderCompareResult,
          // formatDate - INCHANGÉS) ... MODIFIED: renderDashboard to include
          // teleport section
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

      <div id="teleport" class="mt-8 p-6 bg-white dark:bg-light-navy rounded-lg shadow-md">
          <h2 class="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
              <i class="fas fa-rocket mr-2 text-green"></i>Téléportation Rapide
          </h2>
          <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-end mb-4">
               <div class="flex-grow w-full sm:w-auto">
                   <label for="worldIdInput" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">ID du Monde</label>
                   <input type="text" id="worldIdInput" placeholder="Entrez l'ID du monde..." class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
               </div>
               <button id="findRoomsButton" class="py-2 px-4 bg-green text-navy font-medium rounded hover:bg-opacity-80 transition duration-150 ease-in-out dark:text-navy flex-shrink-0 w-full sm:w-auto">
                   <i class="fas fa-search-location mr-2"></i>Chercher Salles Accessibles
               </button>
          </div>
          <div id="teleportStatus" class="mt-4 text-sm mb-4"></div>

          <div class="mb-4">
               <label for="teleportSearchInput" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">Filtrer les salles</label>
               <input type="search" id="teleportSearchInput" placeholder="Rechercher par nom ou ID..." class="w-full md:w-1/2 p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
          </div>
          <h3 class="text-lg font-semibold mb-3 text-gray-700 dark:text-light-slate">Salles Accessibles :</h3>
          <div id="reachableRoomsContainer" class="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <p class="text-gray-500 dark:text-slate italic col-span-full text-center py-4">
                 Entrez un ID de monde et cliquez sur "Chercher Salles Accessibles".
              </p>
          </div>
          <p id="teleportNoResults" class="text-gray-500 dark:text-slate italic mt-4 hidden text-center">
              Aucune salle trouvée correspondant à votre recherche.
          </p>
           </div>
      `;
            // Ré-attacher les listeners spécifiques à cette vue
            attachTeleportElements();  // IMPORTANT: Attacher après rendu HTML
            hideLoading();
          }


          // --- Fonctions UserList, UserDetail, Compare (inchangées) ---
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
                            '<span class="text-gray-500 italic">Inconnu</span>' :  // More
                                                                                   // explicit
                                                                                   // than
                                                                                   // N/A
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
            `).join('');
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
                (key === currentSortKey && currentSortDirection === 'asc') ?
                'desc' :
                'asc';

            currentUsersData.sort((a, b) => {
              let valA, valB;

              // Handle combined name sort
              if (key === 'name') {
                valA = `${a.first_name || ''} ${a.last_name || ''}`
                           .toLowerCase()
                           .trim();
                valB = `${b.first_name || ''} ${b.last_name || ''}`
                           .toLowerCase()
                           .trim();
              } else {
                valA = a[key];
                valB = b[key];
              }

              // Consistent handling of nullish values (null, undefined, '',
              // 'N/A')
              const isANullish = valA === null || valA === undefined ||
                  valA === '' || valA === 'N/A';
              const isBNullish = valB === null || valB === undefined ||
                  valB === '' || valB === 'N/A';

              if (isANullish && isBNullish) return 0;
              // Sort nullish values based on direction (e.g., first on
              // ascending)
              if (isANullish) return newDirection === 'asc' ? -1 : 1;
              if (isBNullish) return newDirection === 'asc' ? 1 : -1;

              // Actual comparison for non-nullish values
              let comparison = 0;
              if (key === 'flag_count') {
                comparison = Number(valA) - Number(valB);
              } else if (key === 'blocked') {
                // Explicit boolean comparison (false comes before true)
                comparison = (valA === valB) ? 0 : (valA ? 1 : -1);
              } else {
                // Default to locale-aware string comparison
                comparison = String(valA).toLowerCase().localeCompare(
                    String(valB).toLowerCase());
              }


              return newDirection === 'asc' ? comparison : comparison * -1;
            });

            currentSortKey = key;
            currentSortDirection = newDirection;

            // Re-render table body and update headers
            const userTableBody = document.getElementById('userTableBody');
            if (userTableBody) {
              userTableBody.innerHTML = generateUserTableRows(currentUsersData);
            }
            updateUserTableHeaderIcons(currentSortKey, currentSortDirection);
          }
          function renderUserList(users) {
            if (!users) {
              users = [];
            }
            currentUsersData = [...users];  // Store a mutable copy
            // Apply initial sort (e.g., by username asc) before rendering
            sortUsers(currentSortKey);  // This now sorts and sets direction

            const tableBodyHtml =
                generateUserTableRows(currentUsersData);  // Use the sorted data

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
                if (key)
                  sortUsers(
                      key);  // sortUsers handles direction toggle and re-render
              });
            });
            // Set initial sort icons based on currentSortKey and
            // currentSortDirection
            updateUserTableHeaderIcons(currentSortKey, currentSortDirection);

            // Add listener for search input
            document.getElementById('userSearch')
                .addEventListener('input', (e) => {
                  const searchTerm = e.target.value.toLowerCase();
                  let visibleCount = 0;
                  document.querySelectorAll('#userTableBody tr')
                      .forEach(row => {
                        const username =
                            row.cells[0]?.textContent.toLowerCase() || '';
                        const name =
                            row.cells[1]?.textContent.toLowerCase() || '';
                        const isVisible = username.includes(searchTerm) ||
                            name.includes(searchTerm);
                        row.style.display = isVisible ? '' : 'none';
                        if (isVisible) visibleCount++;
                      });
                  // Optional: Show a message if no results found from search
                  // const noResultsRow =
                  // document.getElementById('noSearchResultsRow'); if
                  // (noResultsRow) noResultsRow.style.display = visibleCount
                  // === 0 ? '' : 'none';
                });
            hideLoading();
          }
          function renderUserDetail(data) {
            if (!data || !data.details) {
              content.innerHTML =
                  `<div class="status-message status-error">Erreur: Données utilisateur invalides ou utilisateur non trouvé.</div>`;
              hideLoading();
              return;
            }
            const {details, flags = [], last_position} = data;

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
                <p><strong class="text-gray-600 dark:text-slate">Monde:</strong> <span class="font-mono text-xs">${
                    last_position.world_ID || 'N/A'}</span></p>
                <p><strong class="text-gray-600 dark:text-slate">Location:</strong> <span class="font-mono text-xs">${
                    last_position.location || 'N/A'}</span></p>
                <p><strong class="text-gray-600 dark:text-slate">Salle:</strong> ${
                    last_position.room || 'N/A'}</p>
                <p><strong class="text-gray-600 dark:text-slate">Vu le:</strong> ${
                    formatDate(last_position.created_at)}</p>` :
                '<p class="text-gray-500 dark:text-slate italic">Aucune position récente enregistrée.</p>';

            // Helper for displaying potentially null values
            const displayValue = (value, fallback = 'N/A') =>
                value !== null && value !== undefined ? value : fallback;


            content.innerHTML = `
                <a href="#users" class="text-blue-500 dark:text-green hover:underline mb-6 block"><i class="fas fa-arrow-left mr-2"></i>Retour à la liste</a>
                <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">${
                details.username}</h1>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                        <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Informations</h2>
                        <p><strong class="text-gray-600 dark:text-slate w-28 inline-block">Nom:</strong> ${
                displayValue(
                    details.first_name)} ${displayValue(details.last_name)}</p>
                        <p><strong class="text-gray-600 dark:text-slate w-28 inline-block">Email:</strong> ${
                displayValue(details.email)}</p>
                        <p><strong class="text-gray-600 dark:text-slate w-28 inline-block">Filière:</strong> ${
                displayValue(details.filiere)}</p>
                        <p><strong class="text-gray-600 dark:text-slate w-28 inline-block">Profil:</strong> ${
                displayValue(details.profile)}</p>
                        <p><strong class="text-gray-600 dark:text-slate w-28 inline-block">Statut:</strong>
                             ${
                details.blocked === null || details.blocked === undefined ?
                    '<span class="text-gray-500 italic">Inconnu</span>' :
                    details.blocked ?
                    '<span class="text-red-500 font-semibold">Bloqué</span>' :
                    '<span class="text-green-500 font-semibold">Actif</span>'}
                        </p>
                        <p><strong class="text-gray-600 dark:text-slate w-28 inline-block">Créé le (DB):</strong> ${
                formatDate(details.created_at)}</p>
                    </div>
                    <div class="bg-white dark:bg-light-navy p-6 rounded-lg shadow">
                        <h2 class="text-xl font-semibold mb-4 text-gray-700 dark:text-light-slate border-b pb-2 dark:border-lightest-navy">Dernière Position Vue</h2>
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
            const flagTags =
                flagTagsWrapper?.querySelectorAll('.flag-tag') || [];
            const noResultMessage =
                flagsContainer?.querySelector('.no-result-message');

            if (flagSearchInput && noResultMessage &&
                flagTagsWrapper) {  // Check wrapper exists
              flagSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                let anyVisible = false;
                flagTags.forEach(tag => {
                  const flagText = tag.textContent?.trim().toLowerCase() || '';
                  const isVisible = flagText.includes(searchTerm);
                  // Use 'inline-block' as it was set initially
                  tag.style.display = isVisible ? 'inline-block' : 'none';
                  if (isVisible) anyVisible = true;
                });
                // Show message only if search yields no results AND there were
                // flags initially
                noResultMessage.classList.toggle(
                    'hidden', anyVisible || flags.length === 0);
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
                    user =>
                        user.username.toLowerCase().includes(lowerFilterTerm));
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
                valueElement.value = '';  // Clear hidden value on input change
                renderOptions(inputElement.value);
              });
              inputElement.addEventListener('focus', () => {
                clearTimeout(blurTimeout);
                renderOptions(inputElement.value);  // Show dropdown on focus
              });
              inputElement.addEventListener('blur', () => {
                // Delay hiding to allow click on dropdown item
                blurTimeout = setTimeout(() => {
                  dropdownElement.classList.add('hidden');
                }, 200);
              });
              // Use mousedown to register click before blur hides the dropdown
              dropdownElement.addEventListener('mousedown', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (item) {
                  const selectedValue = item.getAttribute('data-value');
                  inputElement.value = selectedValue;  // Update visible input
                  valueElement.value = selectedValue;  // Update hidden input
                  dropdownElement.classList.add('hidden');  // Hide dropdown
                  clearTimeout(
                      blurTimeout);      // Prevent blur from hiding too soon
                  inputElement.focus();  // Optionally refocus input or trigger
                                         // next step
                }
              });
            }
            setupSearchableDropdown(
                'user1Input', 'user1Dropdown', 'user1Value');
            setupSearchableDropdown(
                'user2Input', 'user2Dropdown', 'user2Value');

            // Form submission listener
            document.getElementById('compareForm')
                .addEventListener('submit', async (e) => {
                  e.preventDefault();
                  const user1 = document.getElementById('user1Value').value;
                  const user2 = document.getElementById('user2Value').value;
                  const resultDiv = document.getElementById('compareResult');
                  resultDiv.innerHTML = '';  // Clear previous results

                  if (!user1 || !user2) {
                    resultDiv.innerHTML =
                        '<p class="status-message status-error">Veuillez sélectionner deux utilisateurs valides.</p>';
                    return;
                  }
                  if (user1 === user2) {
                    resultDiv.innerHTML =
                        '<p class="status-message status-error">Veuillez sélectionner deux utilisateurs différents.</p>';
                    return;
                  }

                  resultDiv.innerHTML =
                      '<div class="loader my-4"></div>';  // Show loader
                  try {
                    const data = await fetchData(
                        `/compare?user1=${encodeURIComponent(user1)}&user2=${
                            encodeURIComponent(user2)}`);
                    if (data.error) {  // Handle specific error from backend
                                       // compare endpoint
                      throw new Error(data.error);
                    }
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
                    `${data.user1} a en plus (Bases)`, data.ahead_count,
                    data.ahead)}
                    </div>
                    <div class="bg-white dark:bg-light-navy p-4 rounded shadow">
                        ${
                renderList(
                    `${data.user2} a en plus (Bases)`, data.behind_count,
                    data.behind)}
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
              // Attempt parsing ISO format (common from Python's isoformat())
              const date = new Date(dateString);
              // Check if date is valid
              if (isNaN(date.getTime())) {
                // If ISO fails, try common variations or return original string
                // Example: Handle 'YYYY-MM-DD HH:MM:SS' if needed
                // const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})
                // (\d{2}):(\d{2}):(\d{2})/); if (parts) {
                //     date = new Date(parts[1], parts[2] - 1, parts[3],
                //     parts[4], parts[5], parts[6]);
                // } else {
                //    return dateString; // Give up if format is unknown
                // }
                console.warn(
                    'formatDate: Invalid date string received:', dateString);
                return dateString;  // Return original string if parsing fails
              }
              // Format to French locale DD/MM/YYYY HH:MM
              return date.toLocaleDateString(
                         'fr-FR',
                         {day: '2-digit', month: '2-digit', year: 'numeric'}) +
                  ' ' +
                  date.toLocaleTimeString(
                      'fr-FR', {hour: '2-digit', minute: '2-digit'});
            } catch (e) {
              console.error('Error formatting date:', dateString, e);
              return dateString;  // Return original string if formatting fails
            }
          }


          // --- SANDBOX FUNCTIONS ---
          // ... (renderParametersFromData, executeSandboxCommand, renderSandbox
          // - INCHANGÉS) ...
          function renderParametersFromData(
              methodName, paramsData, paramsArea) {
            paramsArea.innerHTML = '';  // Clear previous

            if (paramsData && Array.isArray(paramsData) &&
                paramsData.length > 0) {
              paramsData.forEach(param => {
                if (!param || !param.name) return;  // Skip malformed params

                const paramId =
                    `param-${methodName.replace('.', '-')}-${param.name}`;
                const typeHint = param.type || 'string';
                const placeholder = param.description || '';
                const required = param.required === true;

                let inputHtml = '';
                const labelHtml = `
                    <label for="${
                    paramId}" class="block text-sm font-medium text-gray-700 dark:text-light-slate mb-1">
                        ${param.name} <span class="text-xs italic">(${
                    typeHint})</span>
                        ${
                    required ? '<span class="text-red-500 ml-1">*</span>' : ''}
                    </label>`;

                // Use textarea for JSON types or lists/dicts
                if (typeHint.toLowerCase().includes('json') ||
                    typeHint.toLowerCase().includes('list') ||
                    typeHint.toLowerCase().includes('dict') ||
                    typeHint.toLowerCase().includes('array') ||
                    typeHint.toLowerCase().includes('object')) {
                  inputHtml = `
                        ${labelHtml}
                        <textarea id="${paramId}" name="${
                      param.name}" rows="3" placeholder="${placeholder}${
                      placeholder ?
                          ' ' :
                          ''}(Entrer JSON valide)" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"></textarea>
                    `;
                }
                // Use specific input types where applicable
                else if (typeHint === 'boolean') {
                  // Simple select for boolean
                  inputHtml = `
                         ${labelHtml}
                         <select id="${paramId}" name="${
                      param
                          .name}" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                             <option value="">(Optionnel)</option>
                             <option value="true">True</option>
                             <option value="false">False</option>
                         </select>
                     `;
                } else if (typeHint === 'int' || typeHint === 'number') {
                  inputHtml = `
                        ${labelHtml}
                        <input type="number" step="any" id="${paramId}" name="${
                      param.name}" placeholder="${
                      placeholder}" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                    `;
                } else {  // Default to text input for 'string' or unknown types
                  inputHtml = `
                        ${labelHtml}
                        <input type="text" id="${paramId}" name="${
                      param.name}" placeholder="${
                      placeholder}" class="w-full p-2 border border-gray-300 rounded dark:bg-lightest-navy dark:border-slate dark:text-white focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent">
                    `;
                }
                paramsArea.innerHTML += `<div class="mb-3">${inputHtml}</div>`;
              });
            } else {
              paramsArea.innerHTML =
                  '<p class="text-sm text-gray-500 dark:text-slate italic">Cette commande ne prend aucun paramètre.</p>';
            }

            // Add Execute button
            paramsArea.innerHTML += `
            <button class="execute-sandbox-button bg-green hover:opacity-90 text-navy font-bold py-2 px-4 rounded text-sm mt-2" data-method="${
                methodName}">
                <i class="fas fa-play mr-2"></i>Exécuter
            </button>`;
          }

          async function executeSandboxCommand(
              methodName, paramsArea, resultArea, button) {
            const params = {};
            let hasError = false;
            const inputs = paramsArea.querySelectorAll(
                'input, textarea, select');  // Include select

            // Clear previous errors and results
            resultArea.innerHTML = '';
            inputs.forEach(input => input.classList.remove('border-red-500'));

            // --- Parameter Gathering and Basic Validation ---
            inputs.forEach(input => {
              if (hasError || !input.name)
                return;  // Skip if error already found or input has no name

              const name = input.name;
              let value = input.value.trim();
              const label =
                  paramsArea.querySelector(`label[for="${input.id}"]`);
              const isRequired = label?.querySelector('.text-red-500') !== null;
              const typeHint = label?.querySelector('.text-xs.italic')
                                   ?.textContent.replace(/[()]/g, '') ||
                  'string';  // Extract type hint

              const setError = (message) => {
                input.classList.add(
                    'border-red-500',
                    'dark:border-red-500');  // Add error class for both modes
                resultArea.innerHTML =
                    `<div class="status-message status-error text-xs">${
                        message}</div>`;
                hasError = true;
              };

              // Handle required fields
              if (isRequired && !value &&
                  input.tagName !==
                      'SELECT') {  // Empty required field (except select
                                   // which might have "" as optional)
                setError(`Erreur: Paramètre requis '${name}' est vide.`);
                return;
              }
              if (isRequired && input.tagName === 'SELECT' &&
                  value === '') {  // Explicitly empty required select
                setError(`Erreur: Sélection requise pour '${name}'.`);
                return;
              }


              // Handle type conversions based on original hint or input type
              try {
                if (input.tagName === 'TEXTAREA' || typeHint.includes('json') ||
                    typeHint.includes('list') ||
                    typeHint.includes('dict')) {  // Expecting JSON
                  if (value) {
                    value = JSON.parse(value);  // Parse JSON
                  } else if (!isRequired) {
                    value = null;  // Optional empty JSON -> null (or maybe {}
                                   // or [] depending on backend)
                  }  // Required empty JSON already handled
                } else if (
                    input.type === 'number' || typeHint === 'int' ||
                    typeHint === 'number') {
                  if (value !== '') {
                    const numValue = Number(value);
                    if (isNaN(numValue)) {
                      setError(
                          `Erreur: Valeur numérique invalide pour '${name}'.`);
                      return;
                    }
                    value = numValue;  // Store as number
                  } else if (!isRequired) {
                    value = null;  // Optional empty number -> null
                  }  // Required empty number already handled
                } else if (
                    input.tagName === 'SELECT' &&
                    typeHint === 'boolean') {  // Boolean from select
                  if (value === 'true')
                    value = true;
                  else if (value === 'false')
                    value = false;
                  else if (!isRequired)
                    value =
                        null;  // Optional unselected boolean -> null
                               // Required unselected boolean already handled
                } else {
                  // Treat as string (or potentially convert 'true'/'false' text
                  // if boolean type hint was missed)
                  if (typeHint === 'boolean' && value.toLowerCase() === 'true')
                    value = true;
                  else if (
                      typeHint === 'boolean' && value.toLowerCase() === 'false')
                    value = false;
                  // Otherwise keep as string (required empty string handled
                  // above)
                }

                // Assign if no error and value is not undefined/null for
                // required optional fields
                if (!hasError &&
                    (value !== null ||
                     value !== undefined)) {  // Assign if value is valid
                  params[name] = value;
                } else if (
                    !hasError && !isRequired &&
                    (value === null || value === undefined)) {
                  // Don't add optional null/undefined parameters unless backend
                  // expects them explicitly params[name] = null; // Uncomment
                  // if backend needs explicit nulls
                }


              } catch (e) {
                if (e instanceof SyntaxError && input.tagName === 'TEXTAREA') {
                  setError(
                      `Erreur: JSON invalide pour le paramètre '${name}'.`);
                } else {
                  setError(`Erreur de traitement pour '${name}': ${e.message}`);
                }
                console.error(`Error processing parameter ${name}:`, e);
                return;
              }
            });  // End input validation loop


            if (hasError) return;  // Stop if validation failed


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
              console.log(
                  `Executing ${methodName} with processed params:`, params);
              const data = await fetchData('/sandbox/execute', {
                method: 'POST',
                // fetchData handles headers and stringify
                body: {method_name: methodName, params: params}
              });

              console.log('Sandbox API Result:', data);

              // Backend now returns {success: true/false, result: ..., error:
              // ...}
              if (data && data.success === true) {
                let resultHtml;
                const resultValue = data.result;  // Use the actual result field

                if (typeof resultValue === 'object' && resultValue !== null) {
                  try {
                    const jsonString = JSON.stringify(resultValue, null, 2);
                    // Use highlight.js if available
                    if (typeof hljs !== 'undefined' && hljs.highlight) {
                      resultHtml = `<pre><code class="language-json hljs">${
                          hljs.highlight(jsonString, {
                                language: 'json',
                                ignoreIllegals: true
                              })  // Added ignoreIllegals
                              .value}</code></pre>`;
                    } else {
                      resultHtml = `<pre>${jsonString}</pre>`;  // Fallback
                    }
                  } catch (e) {
                    console.error(
                        'Error stringifying/highlighting result object:', e);
                    resultHtml =
                        `<pre>${String(resultValue)}</pre>`;  // Basic fallback
                  }
                } else {
                  // Handle primitives (string, number, boolean, null,
                  // undefined)
                  const displayValue =
                      (resultValue === undefined || resultValue === null) ?
                      'null' :
                      String(resultValue);
                  resultHtml = `<pre>${displayValue}</pre>`;
                }

                resultArea.innerHTML = `<div class="mt-4">
                    <strong class="text-green-500 dark:text-green">Succès:</strong>
                    ${resultHtml}
                    </div>`;

              } else {  // Handle success: false or unexpected format
                const errorMessage =
                    data?.error || 'Erreur inconnue renvoyée par le serveur.';
                resultArea.innerHTML =
                    `<div class="status-message status-error mt-4">
                     <strong class="font-bold">Échec!</strong><br>
                     <pre class="text-xs whitespace-pre-wrap">${
                        errorMessage}</pre>
                     </div>`;
              }

            } catch (error) {  // Handle network errors or errors from fetchData
                               // itself
              console.error(`Error executing ${methodName}:`, error);
              resultArea
                  .innerHTML = `<div class="status-message status-error mt-4">
                <strong class="font-bold">Erreur!</strong><br>
                <pre class="text-xs whitespace-pre-wrap">${
                  error.message ||
                  'Impossible de contacter le serveur ou erreur inattendue.'}${
                  error.status ? ` (Code: ${error.status})` : ''}</pre>
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

          function renderSandbox(commandsWithParams) {
            if (!commandsWithParams || !Array.isArray(commandsWithParams)) {
              console.error(
                  'Invalid data received for renderSandbox:',
                  commandsWithParams);
              content.innerHTML =
                  `<div class="status-message status-error">Erreur: Impossible de charger les commandes Sandbox.</div>`;
              hideLoading();
              return;
            }

            const commandDataMap = new Map();
            commandsWithParams.forEach(cmd => {
              if (cmd && cmd.name) {
                commandDataMap.set(
                    cmd.name,
                    cmd.params || []);  // Store params for later rendering
              }
            });

            const commandCardsHtml =
                commandsWithParams
                    .filter(cmd => cmd && cmd.name)  // Filter invalid entries
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
                    <p class="text-xs text-gray-500 dark:text-slate mb-2 pointer-events-none">${
                            cmd.description ||
                            ''}</p> <!-- Display description -->

                    <div class="params-area border-t border-gray-200 dark:border-lightest-navy pt-3 mt-3 hidden">
                       <!-- Parameters will be rendered here on click -->
                    </div>
                    <div class="result-area mt-2">
                       <!-- Results will be rendered here after execution -->
                    </div>
                </div>
            `).join('');

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
            const noResultsMessage =
                document.getElementById('noResultsMessage');

            // Search Functionality
            if (searchInput && commandList && noResultsMessage) {
              searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const cards = commandList.querySelectorAll('.sandbox-card');
                let visibleCount = 0;
                cards.forEach(card => {
                  const methodName =
                      card.dataset.methodName?.toLowerCase() || '';
                  const description = card.querySelector('.text-xs')
                                          ?.textContent.toLowerCase() ||
                      '';  // Search description too
                  const isVisible = methodName.includes(searchTerm) ||
                      description.includes(searchTerm);
                  card.style.display = isVisible ? 'block' : 'none';
                  if (isVisible) visibleCount++;
                });
                noResultsMessage.style.display =
                    visibleCount === 0 ? 'block' : 'none';
              });
            }

            // Event delegation for Card Clicks (Toggle) and Execute Button
            // Clicks
            if (commandList) {
              commandList.addEventListener('click', (e) => {
                const card = e.target.closest('.sandbox-card');
                if (!card) return;  // Clicked outside a card

                const paramsArea = card.querySelector('.params-area');
                const resultArea = card.querySelector('.result-area');
                const executeButton =
                    e.target.closest('.execute-sandbox-button');
                const methodName = card.dataset.methodName;

                // --- Handle Execute Button Click ---
                if (executeButton) {
                  e.stopPropagation();  // Prevent card toggle when clicking
                                        // execute
                  if (methodName && paramsArea && resultArea) {
                    executeSandboxCommand(
                        methodName, paramsArea, resultArea, executeButton);
                  } else {
                    console.error(
                        'Cannot execute: Missing method name, params area, or result area.');
                    resultArea.innerHTML =
                        `<div class="status-message status-error text-xs">Erreur interne: Impossible d'exécuter.</div>`;
                  }
                  return;  // Stop processing here for execute button
                }


                // --- Handle Card Click for Toggling Details ---
                // Prevent toggle if clicking inside already visible interactive
                // elements
                if (!paramsArea.classList.contains('hidden')) {
                  if (e.target.closest(
                          'input, textarea, label, select, button, .result-area')) {
                    // Allow interaction without toggling collapse
                    return;
                  }
                }


                if (methodName && paramsArea &&
                    resultArea) {  // Check elements exist
                  const isHidden = paramsArea.classList.contains('hidden');
                  if (isHidden) {
                    // Expand: Render parameters from stored data and show
                    const paramsData = commandDataMap.get(methodName);
                    renderParametersFromData(
                        methodName, paramsData, paramsArea);  // Render inputs
                    paramsArea.classList.remove('hidden');
                    resultArea.innerHTML =
                        '';  // Clear previous results when expanding
                  } else {
                    // Collapse: Hide and clear content
                    paramsArea.classList.add('hidden');
                    paramsArea.innerHTML = '';
                    resultArea.innerHTML =
                        '';  // Also clear results when collapsing
                  }
                } else {
                  console.error(
                      'Cannot toggle: Missing method name or internal card elements.');
                }
              });
            }  // End if(commandList)

            hideLoading();  // Hide main loader once sandbox is rendered
          }


          // === GESTION DU BLOC-NOTES ===
          // ... (code inchangé) ...
          if (notesArea) {
            try {
              const savedNotes = localStorage.getItem('userNotes');
              if (savedNotes !== null) {
                notesArea.value = savedNotes;
              }
            } catch (e) {
              console.error(
                  'Erreur lors du chargement des notes depuis localStorage:',
                  e);
              notesArea.placeholder =
                  'Impossible de charger les notes sauvegardées.';
              notesArea.disabled = true;
            }

            notesArea.addEventListener('input', () => {
              try {
                localStorage.setItem('userNotes', notesArea.value);
              } catch (e) {
                console.error(
                    'Erreur lors de la sauvegarde des notes dans localStorage:',
                    e);
                // Optionally inform user if saving fails repeatedly
              }
            });
          } else {
            console.warn(
                'L\'élément #notesArea n\'a pas été trouvé dans le DOM.');
          }


          // ==============================================
          // === NOUVELLE LOGIQUE POUR LA TÉLÉPORTATION ===
          // ==============================================

          // Fonction pour afficher les cartes de salles accessibles
          function displayReachableRooms(rooms, container, statusDiv) {
            if (!container || !statusDiv) {
              console.error(
                  'displayReachableRooms: Conteneur ou div de statut manquant.');
              return;
            }

            container.innerHTML = '';  // Nettoyer avant d'ajouter
            statusDiv.innerHTML = '';  // Nettoyer le statut précédent

            if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
              container.innerHTML = `
                <p class="text-gray-500 dark:text-slate italic col-span-full text-center py-4">
                    Aucune salle accessible trouvée depuis cette position ou erreur lors de la recherche.
                </p>`;
              return;
            }

            rooms.sort((a, b) => {
              // Utilise le nom s'il existe, sinon l'ID, pour le tri
              const nameA = (a.name || a.id ||
                             '').toLowerCase();  // || '' pour éviter erreur si
                                                 // null/undefined
              const nameB = (b.name || b.id || '').toLowerCase();
              return nameA.localeCompare(
                  nameB);  // Tri alphabétique insensible à la casse
            });

            statusDiv.innerHTML =
                `<div class="status-message status-info">Cliquez sur une salle pour vous y téléporter. (${
                    rooms.length} trouvées)</div>`;

            rooms.forEach(room => {
              if (!room || !room.id) return;  // Skip invalid room data

              const card = document.createElement('div');
              // Utilisation de classes Tailwind pour le style des cartes
              card.className =
                  'room-card bg-gray-100 dark:bg-lightest-navy p-3 rounded shadow hover:shadow-md hover:bg-gray-200 dark:hover:bg-navy transition duration-150 ease-in-out cursor-pointer text-center';
              card.textContent = room.name ||
                  room.id;  // Affiche le nom si disponible, sinon l'ID
              card.title = `ID: ${room.id}\nNom: ${
                  room.name || 'N/A'}`;  // Tooltip avec l'ID
              card.dataset.roomId =
                  room.id;  // Stocke l'ID de la salle pour le clic

              // Attacher l'écouteur de clic directement à la carte
              card.addEventListener('click', handleRoomCardClick);
              container.appendChild(card);
            });
          }

          // Fonction appelée lors du clic sur une carte de salle
          // Fonction appelée lors du clic sur une carte de salle
          async function handleRoomCardClick(event) {
            // event.currentTarget se réfère à l'élément auquel l'écouteur est
            // attaché (la carte)
            const clickedCard = event.currentTarget;

            // Récupérer les données nécessaires depuis la carte et l'état
            // global/DOM
            const targetRoomId = clickedCard.dataset.roomId;
            const statusDiv = document.getElementById(
                'teleportStatus');  // Référence au div de statut
            const roomsContainer = document.getElementById(
                'reachableRoomsContainer');  // Référence au conteneur des
                                             // cartes
            const worldId =
                currentTeleportWorldId;  // Utilise l'ID du monde stocké
                                         // lors du dernier DFS

            // --- Vérifications Préliminaires ---
            if (!statusDiv) {
              console.error(
                  'handleRoomCardClick: Element #teleportStatus non trouvé.');
              // Optionnel: Afficher une alerte ou un message d'erreur plus
              // visible
              return;  // Arrêter si le div de statut manque
            }
            if (!targetRoomId) {
              console.error(
                  'handleRoomCardClick: ID de salle cible (data-room-id) manquant sur la carte cliquée.');
              statusDiv.innerHTML =
                  `<div class="status-message status-error">Erreur interne: ID de salle cible manquant.</div>`;
              return;  // Arrêter si l'ID de la salle manque
            }
            if (!worldId) {
              console.error(
                  'handleRoomCardClick: ID du monde (currentTeleportWorldId) manquant ou null.');
              statusDiv.innerHTML =
                  `<div class="status-message status-error">Erreur: ID du monde non défini. Veuillez relancer la recherche de salles.</div>`;
              return;  // Arrêter si l'ID du monde manque
            }

            // --- Mise à jour UI : Indicateur de Chargement et Désactivation
            // des Cartes
            // ---
            console.log(`Demande de téléportation: Monde=${worldId}, Salle=${
                targetRoomId}`);
            statusDiv.innerHTML =
                `<div class="status-message status-info"><i class="fas fa-spinner fa-spin mr-2"></i>Téléportation vers ${
                    clickedCard.textContent || targetRoomId}...</div>`;

            // Trouver toutes les cartes de salle dans le conteneur
            // Utiliser optional chaining (?) au cas où roomsContainer serait
            // null
            const allRoomCards = roomsContainer?.querySelectorAll('.room-card');

            // Désactiver visuellement toutes les cartes et empêcher les clics
            if (allRoomCards) {
              allRoomCards.forEach(card => {
                card.classList.add('room-card-disabled');  // Appliquer le style
                                                           // de désactivation
                // Optionnel: Mettre en évidence la carte spécifique cliquée
                if (card === clickedCard) {
                  card.classList.add(
                      'room-card-teleporting');  // Appliquer style/animation
                                                 // spécifique
                }
              });
            } else {
              // Avertissement si le conteneur n'est pas trouvé, mais on
              // continue quand même
              console.warn(
                  'handleRoomCardClick: Conteneur des cartes non trouvé (#reachableRoomsContainer), impossible de désactiver visuellement.');
            }

            // --- Appel API ---
            try {
              // Appel à l'endpoint backend pour la téléportation
              // fetchData gère l'URL de base, les headers JSON, et stringify le
              // body
              const result = await fetchData('/teleport', {
                method: 'POST',
                body: {
                  world_id: worldId,            // ID du monde actuel
                  target_room_id: targetRoomId  // ID de la salle cible
                }
              });

              // --- Gestion de la Réponse (Succès) ---
              // Vérifier le flag 'success' renvoyé par le backend
              if (result.success) {
                const newLocation =
                    result.new_location;  // Détails de la nouvelle position (si
                                          // fournie)
                // Construire le message de succès, en utilisant le message du
                // backend si disponible
                let successMsg = `<i class="fas fa-check-circle mr-2"></i> ${
                    result.message ||
                    `Téléportation réussie vers ${
                        newLocation?.name || targetRoomId}!`}`;
                if (newLocation) {
                  // Ajouter l'ID de la nouvelle position pour confirmation
                  successMsg +=
                      `<br><span class="text-xs">Nouvelle position ID: ${
                          newLocation.id}</span>`;
                }
                // Afficher le message de succès dans le div de statut
                statusDiv.innerHTML =
                    `<div class="status-message status-success">${
                        successMsg}</div>`;

                // Optionnel : Déclencher automatiquement une nouvelle recherche
                // DFS depuis la nouvelle position après un délai setTimeout(()
                // => {
                //   const findRoomsBtn =
                //   document.getElementById('findRoomsButton'); if
                //   (findRoomsBtn) {
                //      console.log("Rafraîchissement automatique du DFS depuis
                //      la nouvelle position..."); findRoomsBtn.click(); //
                //      Simuler un clic sur le bouton de recherche
                //   }
                // }, 1500); // Délai de 1.5 secondes

              } else {
                // Si le backend renvoie { success: false, error: "..." }, le
                // traiter comme une erreur contrôlée
                throw new Error(
                    result.error ||
                    'La téléportation a échoué sans message spécifique du serveur.');
              }

            } catch (error) {
              // --- Gestion des Erreurs ---
              // Gère les erreurs réseau, les statuts HTTP non-OK, ou les
              // erreurs levées (comme celle du bloc 'else' ci-dessus)
              console.error('Erreur lors de la téléportation:', error);
              // Afficher le message d'erreur dans le div de statut
              statusDiv.innerHTML =
                  `<div class="status-message status-error"><i class="fas fa-exclamation-triangle mr-2"></i>Échec de la téléportation: ${
                      error.message} ${
                      error.status ? `(Code: ${error.status})` : ''}</div>`;
              // Le bloc 'finally' ci-dessous réactivera les cartes même en cas
              // d'erreur

            } finally {
              // --- Nettoyage UI : Réactivation des Cartes ---
              // Ce bloc s'exécute toujours, que le 'try' réussisse ou échoue
              if (allRoomCards) {
                console.log('Réactivation des cartes de salle.');
                allRoomCards.forEach(card => {
                  // Retirer les classes de désactivation et de mise en évidence
                  card.classList.remove(
                      'room-card-disabled', 'room-card-teleporting');
                });
              }
            }
          }  // --- Fin de handleRoomCardClick ---

          // Dans backend/static/js/app.js

          function attachTeleportElements() {
            const findRoomsBtn = document.getElementById('findRoomsButton');
            const roomsContainer =
                document.getElementById('reachableRoomsContainer');
            const statusDiv = document.getElementById('teleportStatus');
            const worldIdInput = document.getElementById('worldIdInput');
            // *** DEBUT : Ajout des références pour la recherche ***
            const searchInput = document.getElementById('teleportSearchInput');
            const noResultsMessage =
                document.getElementById('teleportNoResults');
            // *** FIN : Ajout des références pour la recherche ***


            // *** MODIFIÉ : Inclure searchInput et noResultsMessage dans la
            // vérification ***
            if (findRoomsBtn && roomsContainer && statusDiv && worldIdInput &&
                searchInput && noResultsMessage) {
              console.log('Attaching teleport listeners including search...');

              const newFindRoomsBtn = findRoomsBtn.cloneNode(true);
              findRoomsBtn.parentNode.replaceChild(
                  newFindRoomsBtn, findRoomsBtn);

              newFindRoomsBtn.addEventListener('click', async () => {
                const worldId = worldIdInput.value.trim();
                if (!worldId) {
                  statusDiv.innerHTML =
                      `<div class="status-message status-error">Veuillez entrer un ID de monde.</div>`;
                  worldIdInput.focus();
                  return;
                }

                // *** DEBUT : Réinitialisation de la recherche ***
                searchInput.value = '';  // Vider le champ de recherche
                noResultsMessage.classList.add(
                    'hidden');  // Cacher le message "aucun résultat"
                // *** FIN : Réinitialisation de la recherche ***

                currentTeleportWorldId = worldId;
                roomsContainer.innerHTML = '';
                statusDiv.innerHTML =
                    `<div class="status-message status-info"><i class="fas fa-spinner fa-spin mr-2"></i>Recherche des salles accessibles pour le monde ${
                        worldId}...</div>`;
                newFindRoomsBtn.disabled = true;
                newFindRoomsBtn.classList.add('button-loading');

                try {
                  const rooms = await fetchData(`/reachable_rooms?world_id=${
                      encodeURIComponent(worldId)}`);
                  displayReachableRooms(rooms, roomsContainer, statusDiv);

                  // *** DEBUT : Appliquer le filtre initial si nécessaire ***
                  // Si l'utilisateur avait déjà tapé quelque chose avant de
                  // cliquer (peu probable mais par sécurité)
                  filterRoomCards();
                  // *** FIN : Appliquer le filtre initial ***

                } catch (error) {
                  console.error(
                      'Erreur lors de la récupération des salles accessibles:',
                      error);
                  statusDiv.innerHTML = '';
                  roomsContainer.innerHTML = '';
                } finally {
                  newFindRoomsBtn.disabled = false;
                  newFindRoomsBtn.classList.remove('button-loading');
                }
              });

              // *** DEBUT : Ajout du listener et de la fonction de filtrage ***
              searchInput.addEventListener('input', filterRoomCards);

              function filterRoomCards() {
                const searchTerm = searchInput.value.toLowerCase().trim();
                const cards = roomsContainer.querySelectorAll('.room-card');
                let visibleCount = 0;

                cards.forEach(card => {
                  const cardText = card.textContent?.toLowerCase() || '';
                  const cardTitle = card.title?.toLowerCase() ||
                      '';  // Recherche aussi dans le tooltip (ID: ...)
                  const isVisible = cardText.includes(searchTerm) ||
                      cardTitle.includes(searchTerm);

                  card.style.display = isVisible ? '' : 'none';
                  if (isVisible) {
                    visibleCount++;
                  }
                });

                noResultsMessage.classList.toggle(
                    'hidden',
                    visibleCount > 0 ||
                        cards.length ===
                            0);  // Cacher si visible ou si pas de carte
              }
              // *** FIN : Ajout du listener et de la fonction de filtrage ***


            } else {
              console.warn(
                  'Éléments DOM pour la téléportation ou la recherche non trouvés lors de attachTeleportElements.');
              // Lister les éléments manquants pour le débogage
              if (!findRoomsBtn) console.warn('Manquant: #findRoomsButton');
              if (!roomsContainer)
                console.warn('Manquant: #reachableRoomsContainer');
              if (!statusDiv) console.warn('Manquant: #teleportStatus');
              if (!worldIdInput) console.warn('Manquant: #worldIdInput');
              if (!searchInput)
                console.warn('Manquant: #teleportSearchInput');  // Ajouté
              if (!noResultsMessage)
                console.warn('Manquant: #teleportNoResults');  // Ajouté
            }
          }

          // ==============================================
          // === FIN LOGIQUE TÉLÉPORTATION ================
          // ==============================================


          // --- Logique de Routage Côté Client ---
          async function handleRouteChange() {
            const hash = window.location.hash || '#dashboard';
            setActiveLink(hash);
            showLoading();

            // Reset user list sort state if navigating away from users
            // list/detail
            if (hash !== '#users' && !hash.startsWith('#user/')) {
              // Keep current sort if just navigating between users/detail?
              // Debateable. Let's reset for simplicity unless specifically on
              // users list/detail currentSortKey = 'username'; // Resetting
              // might be annoying for users currentSortDirection = 'asc';
            }
            // Reset teleport world ID when navigating away? Or keep it? Let's
            // keep it for now. currentTeleportWorldId = null;


            try {
              // Clear previous errors shown in the main content area if needed
              // if (content.querySelector('.status-error')) content.innerHTML =
              // '';

              // --- Route Handling ---
              if (hash === '#dashboard') {
                const data = await fetchData('/stats');
                renderDashboard(data);  // renderDashboard includes the teleport
                                        // section HTML now
                attachTeleportElements();  // Attach listeners after rendering
                                           // dashboard
              } else if (hash === '#users') {
                // Reset sort ONLY when explicitly navigating TO the user list
                currentSortKey = 'username';
                currentSortDirection = 'asc';
                const data = await fetchData('/users');
                renderUserList(data);
                // attachTeleportElements(); // Pas de téléport dans la liste
                // user
              } else if (hash.startsWith('#user/')) {
                const username = decodeURIComponent(hash.substring(6));
                const data = await fetchData(`/user/${username}`);
                renderUserDetail(data);
                // attachTeleportElements(); // Pas de téléport dans le détail
                // user
              } else if (hash === '#compare') {
                const usersData =
                    await fetchData('/users');  // Fetch user list for dropdowns
                // Pass only usernames if that's all needed, or full data if
                // sort/filter required in form
                renderCompareForm(usersData);
                // attachTeleportElements(); // Pas de téléport dans la
                // comparaison
              } else if (hash === '#sandbox') {
                const commandsWithParams = await fetchData('/sandbox/commands');
                renderSandbox(commandsWithParams);
                // Pas besoin d'attachTeleportElements ici
              }
              // --- Route dédiée pour la téléportation (si nécessaire) ---
              // else if (hash === '#teleport') {
              //    content.innerHTML = `<!-- HTML spécifique à la page téléport
              //    ici
              //    -->`; attachTeleportElements(); hideLoading();
              // }
              else {  // Fallback for unknown hash
                content.innerHTML =
                    `<h1 class="text-xl text-red-500">Page non trouvée</h1><p>Le lien ${
                        hash} ne correspond à aucune section connue.</p>`;
                hideLoading();
              }
            } catch (error) {
              // Handle errors during fetch or rendering for the main content
              // area
              console.error(
                  'Erreur lors du chargement de la route:', hash, error);
              content.innerHTML = `<div class="status-message status-error">
                <strong class="font-bold">Erreur de chargement!</strong><br>
                Impossible de charger la section '${hash}'. Raison: ${
                  error.message}
                ${error.status ? ` (Code: ${error.status})` : ''}
                </div>`;
              hideLoading();  // Ensure global loader is hidden on error
            }
          }  // --- End handleRouteChange ---


          // --- Met à jour le lien actif dans la sidebar ---
          // ... (code inchangé) ...
          function setActiveLink(hash) {
            navLinks.forEach(link => {
              const linkHref = link.getAttribute('href');
              let isActive = false;
              try {
                const decodedHash = decodeURIComponent(hash);
                const decodedHref = decodeURIComponent(linkHref);

                if (decodedHash.startsWith('#user/') &&
                    decodedHref === '#users') {
                  isActive =
                      true;  // Highlight 'Users' link for user detail pages
                } else {
                  isActive = decodedHref === decodedHash;  // Standard match
                }
              } catch (e) {
                console.warn('Error decoding hash/href for active link:', e);
                isActive = linkHref === hash;  // Fallback to exact match
              }

              // Apply/remove classes based on active state and dark mode
              const isDark =
                  document.documentElement.classList.contains('dark');
              link.classList.toggle('active', isActive);
              link.classList.toggle('bg-gray-200', isActive && !isDark);
              link.classList.toggle(
                  'dark:bg-lightest-navy', isActive && isDark);
              link.classList.toggle('font-semibold', isActive);

              if (isActive) {
                link.classList.add(
                    isDark ? 'dark:text-green' : 'text-gray-900');
              } else {
                link.classList.remove('dark:text-green', 'text-gray-900');
              }
              // Ensure default colors are present if not active
              if (!isActive) {
                link.classList.add(
                    'text-gray-600',
                    'dark:text-light-slate');  // Default text colors
                link.classList.remove(
                    'text-gray-900',
                    'dark:text-green');  // Remove active colors
              } else {
                link.classList.remove(
                    'text-gray-600',
                    'dark:text-light-slate');  // Remove default colors
              }
            });
          }


          // --- Gestion Bouton Update DB ---
          // ... (code inchangé) ...
          if (updateDbButton && updateStatusDiv) {
            updateDbButton.addEventListener('click', async () => {
              updateDbButton.disabled = true;
              updateDbButton.classList.add('button-loading');
              updateDbButton.innerHTML =
                  '<i class="fas fa-sync-alt fa-spin mr-2 w-4 text-center"></i>Mise à jour...';
              updateStatusDiv.innerHTML =
                  '<div class="status-message status-info">Lancement de la mise à jour...</div>';
              try {
                // Use fetchData for consistency
                const result = await fetchData('/update-db', {method: 'POST'});

                // Check backend's success flag
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
                  // Handle API returning success: false or error structure
                  const errorMessage = result?.error ||
                      'Erreur inconnue renvoyée par le serveur.';
                  updateStatusDiv.innerHTML =
                      `<div class="status-message status-error">
                          <strong class="font-bold">Échec!</strong><br>
                          <pre class="text-xs whitespace-pre-wrap">${
                          errorMessage}</pre>
                       </div>`;
                }
              } catch (error) {  // Handle network errors or exceptions from
                                 // fetchData
                console.error('Error during DB update:', error);
                updateStatusDiv.innerHTML =
                    `<div class="status-message status-error">
                     <strong class="font-bold">Erreur!</strong><br>
                     <pre class="text-xs whitespace-pre-wrap">${
                        error.message ||
                        'Impossible de contacter le serveur.'}${
                        error.status ? ` (Code: ${error.status})` : ''}</pre>
                  </div>`;
              } finally {
                // Re-enable button after a short delay
                setTimeout(() => {
                  if (updateDbButton) {  // Check if button still exists
                    updateDbButton.disabled = false;
                    updateDbButton.classList.remove('button-loading');
                    updateDbButton.innerHTML =
                        '<i class="fas fa-sync-alt mr-2 w-4 text-center"></i>Actualiser DB';
                  }
                  // Optionally clear status message after longer delay
                  // setTimeout(() => { if(updateStatusDiv)
                  // updateStatusDiv.innerHTML =
                  // ''; }, 8000);
                }, 1000);
              }
            });
          } else {
            console.warn(
                'Le bouton d\'update (#updateDbButton) ou le div de statut (#updateStatus) n\'a pas été trouvé.');
          }

          // --- Gestion Bouton Update WORLDS ---

          if (updateWorldsButton && updateWorldsStatusDiv) {
            updateWorldsButton.addEventListener('click', async () => {
              updateWorldsButton.disabled = true;
              updateWorldsButton.classList.add('button-loading');
              updateWorldsButton.innerHTML =
                  '<i class="fas fa-map-marker-alt fa-spin mr-2 w-5 text-center"></i>MAJ Positions...';
              updateWorldsStatusDiv.innerHTML =
                  '<div class="status-message status-info text-xs p-1">Lancement MAJ positions...</div>';

              try {
                // Appel au NOUVEL endpoint API
                const result = await fetchData(
                    '/update-worlds', {method: 'POST'});  // Chemin corrigé

                if (result && result.success) {
                  updateWorldsStatusDiv.innerHTML =
                      `<div class="status-message status-success text-xs p-1">
                            <strong class="font-bold">Succès!</strong><br>
                            <pre class="text-[0.7rem] whitespace-pre-wrap">${
                          result.message ||
                          'Mise à jour des positions terminée.'}</pre>
                         </div>`;
                  // Optionnel: rafraîchir la vue si nécessaire
                  // setTimeout(handleRouteChange, 1500);
                } else {
                  const errorMessage =
                      result?.error || 'Erreur inconnue serveur.';
                  updateWorldsStatusDiv.innerHTML =
                      `<div class="status-message status-error text-xs p-1">
                            <strong class="font-bold">Échec!</strong><br>
                            <pre class="text-[0.7rem] whitespace-pre-wrap">${
                          errorMessage}</pre>
                         </div>`;
                }
              } catch (error) {
                console.error('Error during WORLDS update:', error);
                updateWorldsStatusDiv.innerHTML =
                    `<div class="status-message status-error text-xs p-1">
                       <strong class="font-bold">Erreur!</strong><br>
                       <pre class="text-[0.7rem] whitespace-pre-wrap">${
                        error.message ||
                        'Impossible de contacter le serveur.'}${
                        error.status ? ` (Code: ${error.status})` : ''}</pre>
                    </div>`;
              } finally {
                setTimeout(() => {
                  if (updateWorldsButton) {
                    updateWorldsButton.disabled = false;
                    updateWorldsButton.classList.remove('button-loading');
                    updateWorldsButton.innerHTML =
                        '<i class="fas fa-map-marker-alt mr-2 w-5 text-center"></i>Actualiser Positions Joueurs';
                  }
                  // setTimeout(() => { if(updateWorldsStatusDiv)
                  // updateWorldsStatusDiv.innerHTML = ''; }, 8000); // Clear
                  // status later
                }, 1000);
              }
            });
          } else {
            console.warn(
                'Bouton MAJ positions (#updateWorldsButton) ou statut (#updateWorldsStatus) non trouvé.');
          }


          // --- Chargement Initial et Écouteurs d'Événements ---
          window.addEventListener(
              'hashchange', handleRouteChange);  // Listen for hash changes
          handleRouteChange();  // Load initial content based on current hash or
                                // default

          // Initialize highlight.js (check if loaded)
          if (typeof hljs !== 'undefined' && hljs.configure) {
            hljs.configure({
              ignoreUnescapedHTML: true
            });  // Useful if results contain HTML chars
            console.log('highlight.js ready.');
            // No need to call highlightAll, dynamic highlighting is used
          } else {
            console.warn(
                'highlight.js not loaded - JSON results in Sandbox won\'t be syntax highlighted.');
          }
        });  // End DOMContentLoaded