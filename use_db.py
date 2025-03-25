# -*- coding: utf-8 -*-
from kerberos import *  # Assumes jprint is available here
import sqlite3
import datetime
import os  # Import os

# --- Configuration ---
DB_DIR = "db"
DATABASE_FILE = os.path.join(
    DB_DIR, "game_data.db"
)  # Chemin vers le fichier de DB unique
# --- Fin Configuration ---


def user_flags(username, date=False):
    """Récupère les flags d'un utilisateur depuis la DB unique."""
    conn = None  # Initialiser pour le bloc finally
    try:
        conn = sqlite3.connect(DATABASE_FILE)  # <-- CHANGEMENT ICI
        cursor = conn.cursor()
        if date:
            # Utilise la colonne 'created_at' de la table flags pour la date d'ajout du flag
            # Ou 'date' si tu veux la date associée au flag lui-même (du jeu)
            cursor.execute(
                # "SELECT flag, created_at FROM flags WHERE username=?", # Date d'ajout à la DB
                "SELECT flag, date FROM flags WHERE username=?",  # Date du flag issue du jeu
                (username,),
            )
            flags_with_dates = []
            for row in cursor.fetchall():
                flag = row[0]
                original_date_str = row[1]  # C'est la date fournie par le jeu

                # Tentative de formatage si la date du jeu est exploitable, sinon on garde la string
                try:
                    # Adapte ce format si la date du jeu n'est pas en ISO
                    created_at_dt = datetime.datetime.fromisoformat(
                        original_date_str.replace("Z", "+00:00")
                    )
                    formatted_date = created_at_dt.strftime("%d/%m/%Y %H:%M")
                except (ValueError, TypeError):
                    # Si la date n'est pas au format ISO ou est None
                    formatted_date = original_date_str  # Retourne la date brute

                flags_with_dates.append((flag, formatted_date))
            return flags_with_dates
        else:
            cursor.execute("SELECT flag FROM flags WHERE username=?", (username,))
            flags = [row[0] for row in cursor.fetchall()]
            return flags
    except sqlite3.Error as e:
        print(f"Erreur SQLite dans user_flags pour {username}: {e}")
        return []  # Retourne une liste vide en cas d'erreur
    finally:
        if conn:
            conn.close()


def list_users():
    """Liste tous les utilisateurs depuis la DB unique."""
    conn = None
    try:
        conn = sqlite3.connect(DATABASE_FILE)  # <-- CHANGEMENT ICI
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users")
        users = [row[0] for row in cursor.fetchall()]
        return users
    except sqlite3.Error as e:
        print(f"Erreur SQLite dans list_users: {e}")
        return []
    finally:
        if conn:
            conn.close()


def users_flags():
    """Compte les flags pour chaque utilisateur."""
    users = list_users()
    res = {}
    print(f"Comptage des flags pour {len(users)} utilisateurs...")
    for user in users:
        # Note: user_flags retourne déjà une liste, len() est direct
        res[user] = len(user_flags(user))
    return res


def where_is(username):
    """Trouve la dernière position connue d'un utilisateur depuis la DB unique."""
    conn = None
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        # On assume que la colonne 'created_at' dans 'worlds' reflète la dernière mise à jour
        cursor.execute(
            """
            SELECT username, world_ID, location, room
            FROM worlds
            WHERE username=?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (username,),
        )
        pos = cursor.fetchone()
        if pos:
            return {"user": pos[0], "world": pos[1], "location": pos[2], "room": pos[3]}
        else:
            return None  # Retourne None si l'utilisateur n'est pas trouvé dans worlds
    except sqlite3.Error as e:
        print(f"Erreur SQLite dans where_is pour {username}: {e}")
        return None
    finally:
        if conn:
            conn.close()


def flags_diff(name1, name2):
    """Compare les flags entre deux utilisateurs."""
    # Récupère les listes de flags (sans la date)
    flags1_raw = user_flags(name1)
    flags2_raw = user_flags(name2)

    # NOTE: La logique split(':') est conservée au cas où tes flags ont ce format.
    # Si tes flags sont juste des strings simples, cette partie n'aura pas d'effet.
    # Adapte ou supprime le .split(':')[0] si nécessaire.
    flags1 = {elt.split(":")[0] for elt in flags1_raw}
    flags2 = {elt.split(":")[0] for elt in flags2_raw}

    ahead = list(flags1 - flags2)  # Flags que name1 a et name2 n'a pas
    behind = list(flags2 - flags1)  # Flags que name2 a et name1 n'a pas

    return {
        "ahead": sorted(ahead),  # Trie pour une sortie cohérente
        "behind": sorted(behind),
    }


def compare_user(user_to_compare):
    """Compare un utilisateur avec tous les autres."""
    users = list_users()
    if user_to_compare not in users:
        print(f"Utilisateur '{user_to_compare}' non trouvé dans la base de données.")
        return None

    res = {}
    print(
        f"Comparaison de '{user_to_compare}' avec {len(users)-1} autres utilisateurs..."
    )
    for user in users:
        if user == user_to_compare:
            continue
        diff = flags_diff(user_to_compare, user)
        # On peut choisir de ne stocker que s'il y a des différences
        if diff["ahead"] or diff["behind"]:
            res[user] = diff
    return res


if __name__ == "__main__":
    jprint(where_is("mbidault"))
