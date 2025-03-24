#!/bin/bash

# Configuration
INTERVAL=600 # Intervalle de scan en secondes (par exemple, 60 secondes = 1 minute)
TEMP_JSON="temp.json"
DB_JSON="db.json"
KERBEROS_SCRIPT="kerberos.py"
MERGE_SCRIPT="merge_data.py"

# Vérifier si le script kerberos existe
if [ ! -f "$KERBEROS_SCRIPT" ]; then
  echo "Erreur: Le script $KERBEROS_SCRIPT n'existe pas."
  exit 1
fi

# Vérifier si le script de fusion existe (nous allons le créer ensuite)
if [ ! -f "$MERGE_SCRIPT" ]; then
  echo "Avertissement: Le script $MERGE_SCRIPT n'existe pas encore. Il sera appelé après le premier scan."
fi

# Boucle infinie pour scanner à intervalles réguliers
while true; do
  echo "--- Début du scan à $(date) ---"

  # Exécuter le script kerberos et enregistrer la sortie dans un fichier temporaire
  python3 "$KERBEROS_SCRIPT" >"$TEMP_JSON"

  echo "Résultat du scan enregistré dans $TEMP_JSON"

  # Vérifier si le fichier de base de données existe, sinon le créer vide
  if [ ! -f "$DB_JSON" ]; then
    echo "Création du fichier de base de données initial: $DB_JSON"
    echo "" >"$DB_JSON" # Créer un tableau JSON vide
  fi

  # Exécuter le script de fusion pour mettre à jour la base de données
  if [ -f "$MERGE_SCRIPT" ]; then
    python3 "$MERGE_SCRIPT" "$TEMP_JSON" "$DB_JSON"
    echo "Base de données mise à jour dans $DB_JSON"
  else
    echo "Le script $MERGE_SCRIPT n'existe pas encore, la base de données n'a pas été mise à jour."
  fi

  echo "--- Fin du scan ---"

  # Attendre l'intervalle spécifié
  sleep "$INTERVAL"
done
