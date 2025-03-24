import json
import sys


def merge_data(temp_json_path, db_json_path):
    """
    Lit les données du fichier JSON temporaire et les fusionne avec le fichier de base de données.
    """
    try:
        with open(db_json_path, "r") as f:
            try:
                db_data = json.load(f)
            except json.JSONDecodeError:
                print(
                    f"Erreur: Le fichier de base de données '{db_json_path}' contient un JSON invalide. Initialisation avec une liste vide."
                )
                db_data = []
    except FileNotFoundError:
        print(
            f"Avertissement: Le fichier de base de données '{db_json_path}' n'a pas été trouvé. Création d'un nouveau fichier."
        )
        db_data = []

    try:
        with open(temp_json_path, "r") as f:
            try:
                new_data = json.load(f)
            except json.JSONDecodeError:
                print(
                    f"Erreur: Le fichier temporaire '{temp_json_path}' contient un JSON invalide. Les nouvelles données ne seront pas ajoutées."
                )
                return

        if isinstance(db_data, list) and isinstance(new_data, list):
            # Ajouter les nouveaux éléments à la base de données existante
            # Ici, une logique plus complexe pourrait être nécessaire pour éviter les doublons
            # en fonction d'un identifiant unique dans vos objets JSON.
            # Pour l'instant, nous allons simplement ajouter tous les nouveaux éléments.
            for item in new_data:
                if (
                    item not in db_data
                ):  # Vérification simple pour éviter les doublons exacts
                    db_data.append(item)
        else:
            print(
                "Avertissement: Les structures JSON des fichiers de base de données et temporaire ne sont pas des listes. La fusion pourrait ne pas fonctionner comme prévu."
            )

        with open(db_json_path, "w") as f:
            json.dump(db_data, f, indent=2)

    except FileNotFoundError:
        print(f"Erreur: Le fichier temporaire '{temp_json_path}' n'a pas été trouvé.")
    except Exception as e:
        print(
            f"Une erreur inattendue s'est produite lors de la fusion des données: {e}"
        )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Usage: python merge_data.py <chemin_fichier_temporaire.json> <chemin_fichier_base_de_données.json>"
        )
        sys.exit(1)

    temp_json_path = sys.argv[1]
    db_json_path = sys.argv[2]
    merge_data(temp_json_path, db_json_path)
