# -*- coding: utf-8 -*-
from kerberos import *
import sqlite3
import datetime
import os  # Import os pour créer le répertoire db si besoin
import tqdm

# --- Configuration ---
DB_DIR = "db"
DATABASE_FILE = os.path.join(
    DB_DIR, "game_data.db"
)  # Chemin vers le fichier de DB unique
# --- Fin Configuration ---


def initialize_database():
    """Crée le fichier de base de données unique et les tables si elles n'existent pas."""
    # Crée le répertoire 'db' s'il n'existe pas
    os.makedirs(DB_DIR, exist_ok=True)

    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()

    # Table users
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        profile BOOLEAN,
        filiere TEXT,
        blocked BOOLEAN,
        created_at TEXT
    )
    """
    )

    # Table worlds
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS worlds (
        username TEXT,
        world_ID TEXT PRIMARY KEY,
        location TEXT,
        room TEXT,
        created_at TEXT,
        UNIQUE (username, world_ID)
        -- Removed FOREIGN KEY for simplicity in migration, can be added later if needed
        -- FOREIGN KEY (username) REFERENCES users(username)
    )
    """
    )

    # Table flags
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS flags (
        username TEXT,
        flag TEXT PRIMARY KEY,
        date TEXT,
        created_at TEXT,
        UNIQUE (username, flag)
        -- Removed FOREIGN KEY for simplicity in migration, can be added later if needed
        -- FOREIGN KEY (username) REFERENCES users(username)
    )
    """
    )

    conn.commit()
    conn.close()
    print(
        f"Base de données '{DATABASE_FILE}' initialisée avec les tables users, worlds, flags."
    )


def add_user(user_data):
    conn = sqlite3.connect(DATABASE_FILE)  # Utilise la DB unique
    cursor = conn.cursor()
    username = user_data.get("username")
    if username:
        cursor.execute("SELECT username FROM users WHERE username=?", (username,))
        if cursor.fetchone() is None:
            created_at = datetime.datetime.now().isoformat()
            try:
                cursor.execute(
                    """
                INSERT INTO users (username, first_name, last_name, email, profile, filiere, blocked, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        user_data.get("username"),
                        user_data.get("first_name"),
                        user_data.get("last_name"),
                        user_data.get("email"),
                        user_data.get("profile"),
                        user_data.get("filiere"),
                        user_data.get("blocked"),
                        created_at,
                    ),
                )
                conn.commit()
                print(f"Utilisateur '{username}' ajouté à la table 'users'.")
            except sqlite3.Error as e:
                print(
                    f"Erreur SQLite lors de l'ajout de l'utilisateur '{username}': {e}"
                )
                conn.rollback()
        # else:
        #     print(f"Utilisateur '{username}' existe déjà dans la table 'users'.")
    else:
        print("Le champ 'username' est obligatoire pour ajouter un utilisateur.")
    conn.close()


def add_world(world_data):
    conn = sqlite3.connect(DATABASE_FILE)  # Utilise la DB unique
    cursor = conn.cursor()
    username = world_data.get("username")
    world_id = world_data.get("world_ID")

    if not (username and world_id):
        print(
            "Les champs 'username' et 'world_ID' sont requis pour ajouter/modifier une entrée dans la table 'worlds'."
        )
        conn.close()
        return

    created_at = (
        datetime.datetime.now().isoformat()
    )  # Utilisé seulement pour l'insertion
    new_location = world_data.get("location")
    new_room = world_data.get("room")

    try:
        cursor.execute(
            "SELECT location, room FROM worlds WHERE username = ? AND world_ID = ?",
            (username, world_id),
        )
        result = cursor.fetchone()

        if result:
            current_location, current_room = result
            update_parts = []
            update_values = []

            # Compare aussi avec None au cas où les nouvelles valeurs seraient None
            if new_location != current_location:
                update_parts.append("location = ?")
                update_values.append(new_location)
            if new_room != current_room:
                update_parts.append("room = ?")
                update_values.append(new_room)

            if update_parts:
                update_values.extend([username, world_id])
                update_query = (
                    "UPDATE worlds SET "
                    + ", ".join(update_parts)
                    + " WHERE username = ? AND world_ID = ?"
                )
                cursor.execute(update_query, tuple(update_values))
                conn.commit()
                print(
                    f"Entrée pour '{username}' dans le monde '{world_id}' mise à jour dans la table 'worlds'."
                )
            # else:
            #     print(f"Entrée pour '{username}'/'{world_id}' déjà à jour dans 'worlds'.")

        else:
            cursor.execute(
                """
                INSERT INTO worlds (username, world_ID, location, room, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, world_id, new_location, new_room, created_at),
            )
            conn.commit()
            print(
                f"Entrée pour '{username}' dans le monde '{world_id}' ajoutée à la table 'worlds'."
            )

    except sqlite3.Error as e:
        print(f"Erreur SQLite (worlds): {e}")
        conn.rollback()

    finally:
        conn.close()


def add_flag(flag_data):
    conn = sqlite3.connect(DATABASE_FILE)  # Utilise la DB unique
    cursor = conn.cursor()
    username = flag_data.get("username")
    flag = flag_data.get("flag")
    if username and flag:
        cursor.execute(
            "SELECT username FROM flags WHERE username=? AND flag=?", (username, flag)
        )
        if cursor.fetchone() is None:
            created_at = datetime.datetime.now().isoformat()
            try:
                cursor.execute(
                    """
                INSERT INTO flags (username, flag, date, created_at)
                VALUES (?, ?, ?, ?)
                """,
                    (
                        username,
                        flag,
                        flag_data.get("date"),
                        created_at,
                    ),
                )
                conn.commit()
                print(
                    f"Flag '{flag}' pour l'utilisateur '{username}' ajouté à la table 'flags'."
                )
            except sqlite3.Error as e:
                print(
                    f"Erreur SQLite lors de l'ajout du flag '{flag}' pour '{username}': {e}"
                )
                conn.rollback()
        # else:
        #     print(f"Flag '{flag}' pour '{username}' existe déjà dans la table 'flags'.")
    else:
        print("Les champs 'username' et 'flag' sont obligatoires pour ajouter un flag.")
    conn.close()


def scan_active_users(client: KerberosClient, protected=False):
    world_list = client.list_worlds()
    flags_db_lines = []
    user_db_lines = []
    world_db_lines = []

    # print(f"Scan de {len(world_list)} mondes...")
    count = 0
    for w in tqdm.tqdm(world_list):
        count += 1
        w_ID = w[0]
        # print(f"Traitement monde {count}/{len(world_list)} : {w_ID}")
        user = None  # Initialiser pour le bloc except
        try:
            user = client.use_from_world(w_ID)
            if not user:
                # print(f"  -> Aucun utilisateur trouvé pour {w_ID}, skip.")
                continue
            # print(f"  -> Utilisateur trouvé: {user}")

            location = client.location(w_ID)
            room = client.room_name(w_ID, location)
            # print(f"  -> Location: {location}, Room: {room}")

            data = client.data_collection(w_ID)

            if not isinstance(data, dict):
                # print(
                #     f"  -> ATTENTION: data_collection pour {w_ID} n'a pas retourné un dictionnaire (type: {type(data)}). Skip détails user/flags."
                # )
                world_db_lines.append(
                    {
                        "username": user,
                        "world_ID": w_ID,
                        "location": location,
                        "room": room,
                    }
                )
                continue

            # print(f"  -> Données brutes récupérées (type: {type(data)})")

            if protected:
                data.pop("email", None)  # Plus sûr que l'assignation

            # Initialise les détails utilisateur avec des valeurs par défaut sûres
            first_name = None
            last_name = None
            profile = None
            filiere = None
            blocked = None
            email = data.get(
                "email"
            )  # Email vient directement de 'data', pas de 'user_info'

            # Vérifie si la valeur récupérée pour 'user' EST un dictionnaire
            # if "user" in data:
            #     # C'est sûr d'utiliser .get() maintenant sur user_info_value
            #     print(
            #         "  -> La clé 'user' contient un dictionnaire. Extraction des détails."
            #     )
            first_name = data.get("first_name")
            last_name = data.get("last_name")
            profile = data.get("profile")
            filiere = data.get("filiere")
            blocked = data.get("blocked")
            # elif user_info_value is not None:  # Si 'user' existe mais n'est pas un dict
            #     print(
            #         f"  -> ATTENTION: La clé 'user' dans data pour {w_ID} n'est PAS un dictionnaire (type: {type(user_info_value)}). Détails utilisateur (nom, profil, etc.) non extraits."
            #     )
            # else:  # Si la clé 'user' n'existe pas du tout dans data
            #     print(
            #         f"  -> INFO: La clé 'user' n'existe pas dans data pour {w_ID}. Détails utilisateur (nom, profil, etc.) non extraits."
            #     )
            # ---> FIN AJUSTEMENT CORRECTION <---

            # Ajoute toujours la ligne utilisateur, même si certains détails sont None
            user_db_lines.append(
                {
                    "username": user,  # Username principal vient de use_from_world
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,  # Email récupéré plus haut
                    "profile": profile,
                    "filiere": filiere,
                    "blocked": blocked,
                }
            )

            # Ajoute toujours la ligne monde si on est arrivé ici
            world_db_lines.append(
                {"username": user, "world_ID": w_ID, "location": location, "room": room}
            )

            # Traitement des flags (ajout d'une vérification de type pour robustesse)
            flags_value = data.get("flags", [])
            if not isinstance(flags_value, list):
                # print(
                #     f"  -> ATTENTION: La clé 'flags' dans data pour {w_ID} n'est pas une liste (type: {type(flags_value)}). Flags ignorés."
                # )
                flags = []  # Assure que 'flags' est itérable
            else:
                flags = flags_value

            # print(f"  -> Trouvé {len(flags)} flags.")
            for elt in flags:
                if isinstance(elt, (list, tuple)) and len(elt) >= 3:
                    f = elt[0]
                    u = elt[1]  # Utilise le user associé au flag
                    d = elt[2]
                    flags_db_lines.append({"username": u, "flag": f, "date": d})
                # else:
                # print(f"  -> Flag malformé ignoré dans le monde {w_ID}: {elt}")

        except ValueError as e:
            print(f"Erreur (ValueError) processing world {w_ID}: {e}")
            continue
        except Exception as e:
            user_context = f" (utilisateur: {user})" if user else ""
            print(
                f"Erreur inattendue processing world {w_ID}{user_context}: {e.__class__.__name__}: {e}"
            )
            # Décommenter pour voir la trace complète si l'erreur persiste ou change
            # import traceback
            # traceback.print_exc()
            continue

    # ... (Fin de la fonction inchangée) ...
    # print("Nettoyage des doublons...")
    user_db_lines = [dict(fs) for fs in {frozenset(d.items()) for d in user_db_lines}]
    world_db_lines = [dict(fs) for fs in {frozenset(d.items()) for d in world_db_lines}]
    flags_db_lines = [dict(fs) for fs in {frozenset(d.items()) for d in flags_db_lines}]

    # print("Scan terminé.")
    return (
        user_db_lines,
        world_db_lines,
        flags_db_lines,
    )


if __name__ == "__main__":
    # 1. Initialiser la base de données unique (crée le fichier et les tables si besoin)
    initialize_database()
    # === Section de Migration (À exécuter UNE SEULE FOIS) ===
    # Décommentez cette section UNIQUEMENT si vous voulez lancer la migration
    # depuis ce script Python (moins recommandé que la méthode sqlite3 CLI)
    # Assurez-vous que les anciens fichiers .db sont présents dans db/
    # run_migration_from_python() # Fonction à créer si vous choisissez cette voie

    # === Section de Scan et Ajout/Mise à jour ===
    print("Initialisation du client Kerberos...")
    try:
        K_CLIENT = KerberosClient()
        print("Scan des utilisateurs actifs...")
        users, worlds, flags = scan_active_users(K_CLIENT)

        print(f"\nAjout/Mise à jour de {len(users)} utilisateurs...")
        for user in users:
            add_user(user)

        print(f"\nAjout/Mise à jour de {len(worlds)} entrées de mondes...")
        for world in worlds:
            add_world(world)

        print(f"\nAjout de {len(flags)} nouveaux flags...")
        for flag in flags:
            add_flag(flag)

        print("\nOpérations terminées.")

    except Exception as e:
        print(f"\nErreur lors de l'exécution principale: {e.__class__.__name__}: {e}")
