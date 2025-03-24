let userData = [];

function saveUserDataToLocalStorage(data) {
  localStorage.setItem('userData', JSON.stringify(data));
}

function loadUserDataFromLocalStorage() {
  const storedData = localStorage.getItem('userData');
  if (storedData) {
    return JSON.parse(storedData);
  }
  return null;
}

let currentSortCriteria = null;
function createUserCard(user) {
  // Création de la div principale user-card
  const card = document.createElement('div');
  card.classList.add('user-card', 'col-md-6', 'col-lg-4');

  // Ajout du nom d'utilisateur.
  const nameHeading = document.createElement('h2');
  nameHeading.textContent = user.user;
  card.appendChild(nameHeading);

  // Fonction pour créer les paragraphes
  function createParagraph(label, value) {
    const p = document.createElement('p');
    p.innerHTML = `<strong>${label}:</strong> ${value}`;
    card.appendChild(p);
  }

  // Ajout des informations, utilisation de la fonction createParagraph.
  createParagraph('World ID', user.world_id);
  createParagraph('Location', user.location);
  createParagraph('Room', user.room);

  if (user.data) {
    if (user.data.first_name && user.data.last_name) {
      createParagraph('Name', `${user.data.first_name} ${user.data.last_name}`);
    }
    createParagraph('Email', user.data.email || 'N/A');
    createParagraph(
        'Filière',
        user.data.filiere ? user.data.filiere.trim() :
                            'N/A');  // trim() pour enlever le \n

    // Affichage conditionnel du statut "blocked"
    const blockedStatus = document.createElement('p');
    blockedStatus.innerHTML = `<strong>Status:</strong> <span class="${
        user.data.blocked ? 'blocked' : 'not-blocked'}">${
        user.data.blocked ? 'Blocked' : 'Not Blocked'}</span>`;
    card.appendChild(blockedStatus);


    // Gestion des flags (s'ils existent)
    if (user.data.flags && user.data.flags.length > 0) {
      const flagsList = document.createElement('ul');
      flagsList.classList.add('flag-list');

      user.data.flags.forEach(flagArray => {
        // On itère sur chaque sous-tableau de flags
        flagArray.forEach(flag => {
          const flagItem = document.createElement('li');
          flagItem.classList.add('flag-item');
          flagItem.textContent = flag;
          flagsList.appendChild(flagItem);
        });
      });
      card.appendChild(flagsList);
    }
  }

  return card;
}


function displayUsers(dataToSort) {
  const userTableBody = document.getElementById('user-table-body');
  console.log('userTableBody:', userTableBody);
  if (!userTableBody) {
    console.error('Error: user-table-body element not found!');
    return;
  }
  userTableBody.innerHTML = '';  // Efface le contenu précédent du tableau

  dataToSort.forEach(user => {
    const row = document.createElement('tr');
    row.dataset.worldId = user.world_id;  // Ajouter world_id comme dataset
    const userNameCell = document.createElement('td');
    userNameCell.textContent = user.user;
    const flagsCountCell = document.createElement('td');
    const filiereCell = document.createElement('td');
    filiereCell.textContent =
        user.data && user.data.filiere ? user.data.filiere.trim() : 'N/A';

    // Calcul du nombre de flags
    const flagCount = user.data && user.data.flags ? user.data.flags.length : 0;
    flagsCountCell.textContent = flagCount;

    row.appendChild(userNameCell);
    row.appendChild(filiereCell);
    row.appendChild(flagsCountCell);
    userTableBody.appendChild(row);

    row.addEventListener('click', function() {
      // Vérifier si une ligne de détails est déjà affichée
      const existingDetailsRow = row.nextElementSibling;
      if (existingDetailsRow &&
          existingDetailsRow.classList.contains('user-details-row')) {
        // Si la ligne de détails existe et est visible, la supprimer (toggle)
        userTableBody.removeChild(existingDetailsRow);
      } else {
        // Supprimer toute ligne de détails existante avant d'en afficher une
        // nouvelle
        const currentDetailsRow =
            userTableBody.querySelector('.user-details-row');
        if (currentDetailsRow) {
          userTableBody.removeChild(currentDetailsRow);
        }
        // Créer une nouvelle ligne pour les détails
        const detailsRow = document.createElement('tr');
        detailsRow.classList.add('user-details-row');
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 2;  // Pour que la cellule occupe toute la largeur
        detailsCell.classList.add('user-details-cell');
        detailsRow.appendChild(detailsCell);


        // Récupérer l'utilisateur correspondant à cette ligne
        const selectedUser = dataToSort.find(
            u => u.user === userNameCell.textContent &&
                u.world_id === row.dataset.worldId);
        if (selectedUser) {
          // alert(JSON.stringify(selectedUser, null, 2)); // Afficher les
          // détails (pour test)

          // Afficher les détails dans la div userDetails
          const userDetailsDiv = detailsCell;
          if (userDetailsDiv) {
            userDetailsDiv.innerHTML = '';  // Effacer le contenu précédent

            // Créer un titre pour les détails
            const detailTitle = document.createElement('h3');
            detailTitle.textContent = `Utilisateur: ${selectedUser.user}`;
            userDetailsDiv.appendChild(detailTitle);

            // Créer un conteneur pour les sections en deux colonnes
            const twoColumnContainer = document.createElement('div');
            twoColumnContainer.classList.add(
                'two-column-container');  // Classe pour le style CSS
            userDetailsDiv.appendChild(twoColumnContainer);

            // Section "Utilisateur" (anciennement "Détails de l'utilisateur")
            const userDetailsSectionDiv = document.createElement('div');
            userDetailsSectionDiv.classList.add(
                'detail-section');  // Classe pour le style CSS
            userDetailsSectionDiv.innerHTML =
                '<h4>Utilisateur</h4>';  // Titre renommé

            // Fonction pour créer et ajouter un paragraphe de détail
            function createUserDetailParagraph(label, value) {
              const p = document.createElement('p');
              p.innerHTML = `<strong>${label}:</strong> ${value}`;
              userDetailsSectionDiv.appendChild(
                  p);  // Ajout à la section "Utilisateur"
            }

            // Section "Étudiant" (anciennement "Informations d'identification")
            const studentDetailsDiv = document.createElement('div');
            studentDetailsDiv.classList.add(
                'detail-section');  // Classe pour le style CSS
            studentDetailsDiv.innerHTML = '<h4>Étudiant</h4>';  // Titre renommé

            function createStudentDetailParagraph(label, value) {
              const p = document.createElement('p');
              p.innerHTML = `<strong>${label}:</strong> ${value}`;
              studentDetailsDiv.appendChild(p);
            }

            createUserDetailParagraph('World ID', selectedUser.world_id);
            createUserDetailParagraph('Location', selectedUser.location);
            createUserDetailParagraph('Room', selectedUser.room);
            if (selectedUser.data) {
              createStudentDetailParagraph(  // Utilisation de
                  'Nom',
                  `${selectedUser.data.first_name} ${
                      selectedUser.data.last_name}`);
              createStudentDetailParagraph(  // Utilisation de
                  'Email', selectedUser.data.email || 'N/A');
              createStudentDetailParagraph(  // Utilisation de
                  'Filière',
                  selectedUser.data.filiere ? selectedUser.data.filiere.trim() :
                                              'N/A');
              createUserDetailParagraph(
                  'Website access',
                  selectedUser.data.blocked ? 'Blocked' :
                                              'Enabled'  // Valeurs modifiées
              );
            }
            twoColumnContainer.appendChild(
                userDetailsSectionDiv);  // Ajout de la section "Utilisateur" au
            twoColumnContainer.appendChild(
                studentDetailsDiv);  // Ajout de la section "Étudiant" au

            // Section "Flags" - Création du tableau (reste inchangée)
            if (selectedUser.data.flags && selectedUser.data.flags.length > 0) {
              const flagsSectionDiv = document.createElement('div');
              // Modification du titre pour inclure le nombre de flags
              flagsSectionDiv.innerHTML =
                  `<h4>Flags : ${selectedUser.data.flags.length}</h4>`;
              const flagsTable = document.createElement(
                  'table');  // Le tableau des flags reste inchangé
              flagsTable.classList.add(
                  'table', 'flag-table');  // Ajout de classes pour le style
              flagsTable.innerHTML =
                  '<thead><tr><th>Nom du flag</th><th>Date</th></tr></thead><tbody></tbody>';
              const flagsTableBody = flagsTable.querySelector('tbody');
              selectedUser.data.flags.forEach(flagArray => {
                const flagName = flagArray[0];
                const flagDate = flagArray[2];  // Date est à l'index 2
                const row = flagsTableBody.insertRow();
                row.insertCell().textContent = flagName;
                row.insertCell().textContent = flagDate;
              });
              flagsSectionDiv.appendChild(flagsTable);
              userDetailsDiv.appendChild(flagsSectionDiv);
            }
          }
        }
        // Ajouter la ligne de détails après la ligne utilisateur
        row.parentNode.insertBefore(detailsRow, row.nextSibling);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded');
  // Charger les données depuis le localStorage au chargement de la page
  const storedUserData = loadUserDataFromLocalStorage();
  if (storedUserData) {
    userData = storedUserData;
  }

  displayUsers(userData);
});

document.getElementById('displayJsonButton')
    .addEventListener('click', function() {
      const jsonInput = document.getElementById('jsonInput').value;
      const jsonErrorDiv = document.getElementById('jsonError');
      try {
        const parsedJson = JSON.parse(jsonInput);
        userData = parsedJson;
        displayUsers(userData);
        jsonErrorDiv.style.display = 'none';
        saveUserDataToLocalStorage(userData);
      } catch (e) {
        jsonErrorDiv.textContent = 'JSON invalide: ' + e.message;
        jsonErrorDiv.style.display = 'block';  // Afficher le message d'erreur
        displayUsers([]);  // Effacer l'affichage précédent en cas d'erreur
      }
    });

function sortByUser() {
  userData.sort((a, b) => {
    const nameA = a.user.toUpperCase();
    const nameB = b.user.toUpperCase();
    if (nameA < nameB) {
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    return 0;
  });
  displayUsers(userData);
  saveUserDataToLocalStorage(userData);
}

function sortByFiliere() {
  userData.sort((a, b) => {
    const filiereA = (a.data && a.data.filiere ? a.data.filiere.trim() : 'N/A')
                         .toUpperCase();
    const filiereB = (b.data && b.data.filiere ? b.data.filiere.trim() : 'N/A')
                         .toUpperCase();
    if (filiereA < filiereB) {
      return -1;
    }
    if (filiereA > filiereB) {
      return 1;
    }
    return 0;
  });
  displayUsers(userData);
  saveUserDataToLocalStorage(userData);
}

function sortByFlags() {
  userData.sort((a, b) => {
    const flagsA = (a.data && a.data.flags ? a.data.flags.length : 0);
    const flagsB = (b.data && b.data.flags ? b.data.flags.length : 0);
    if (flagsA < flagsB) {
      return 1;
    }
    if (flagsA > flagsB) {
      return -1;
    }
    return 0;
  });
  displayUsers(userData);
  saveUserDataToLocalStorage(userData);
}