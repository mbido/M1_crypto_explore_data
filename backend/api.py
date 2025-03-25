# backend/api.py
import sqlite3
import os
import subprocess  # <-- Added import
import sys  # <-- Added import
from flask import Flask, jsonify, g, render_template, abort, request
from flask_cors import CORS  # Pour autoriser les requêtes depuis le JS

# --- Configuration ---
# Le chemin est relatif à l'emplacement de api.py
DATABASE = os.path.join("..", "db", "game_data.db")
# Determine the path to update_db.py relative to api.py
# Assuming api.py is in backend/ and update_db.py is in the parent directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
UPDATE_SCRIPT_PATH = os.path.join(SCRIPT_DIR, "..", "update_db.py")
# --- Fin Configuration ---

# Vérifie si la DB existe au démarrage
if not os.path.exists(DATABASE):
    raise FileNotFoundError(
        f"ERREUR: Base de données non trouvée à {os.path.abspath(DATABASE)}. Assurez-vous qu'elle existe."
    )
# Vérifie si le script d'update existe
if not os.path.exists(UPDATE_SCRIPT_PATH):
    print(
        f"AVERTISSEMENT: Script d'update non trouvé à {UPDATE_SCRIPT_PATH}. Le bouton d'update ne fonctionnera pas."
    )
    # Ne pas lever d'erreur, l'API peut fonctionner sans

app = Flask(
    __name__, static_folder="static", template_folder="templates"  # Dossier pour JS/CSS
)  # Dossier pour index.html

CORS(app)  # Active CORS pour toutes les routes - permet au JS d'appeler l'API


# --- Gestion de la connexion DB (style Flask) ---
def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        try:
            # Utilise check_same_thread=False SEULEMENT si tu rencontres des problèmes liés aux threads,
            # mais sois conscient des implications de concurrence avec SQLite. Pour de la lecture simple, c'est souvent OK.
            db = g._database = sqlite3.connect(DATABASE, check_same_thread=False)
            # Renvoie les lignes comme des dictionnaires
            db.row_factory = sqlite3.Row
        except sqlite3.Error as e:
            print(f"Erreur de connexion à la base de données: {e}")
            abort(500, description="Erreur de connexion à la base de données")
    return db


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def query_db(query, args=(), one=False):
    """Helper pour exécuter des requêtes"""
    try:
        cur = get_db().execute(query, args)
        rv = cur.fetchall()
        # La connexion est fermée par teardown_appcontext, pas besoin de fermer cur explicitement ici
        # cur.close()
        return (dict(rv[0]) if rv else None) if one else [dict(row) for row in rv]
    except sqlite3.Error as e:
        print(f"Erreur SQLite: {e}\nQuery: {query}\nArgs: {args}")
        # Retourne None ou lève une exception selon la criticité
        return None  # Pour l'instant, retourne None en cas d'erreur


# --- Routes de l'API ---


@app.route("/api/stats")
def get_stats():
    """Récupère des statistiques globales."""
    try:
        # Compte les utilisateurs uniques dans la table users
        user_count_res = query_db(
            "SELECT COUNT(DISTINCT username) FROM users", one=True
        )
        user_count = user_count_res["COUNT(DISTINCT username)"] if user_count_res else 0

        # Compte les mondes uniques dans la table worlds
        world_count_res = query_db(
            "SELECT COUNT(DISTINCT world_ID) FROM worlds", one=True
        )
        world_count = (
            world_count_res["COUNT(DISTINCT world_ID)"] if world_count_res else 0
        )

        # Compte les bases de flags uniques (avant le ':')
        flags_raw = query_db("SELECT DISTINCT flag FROM flags")
        if flags_raw is None:
            flags_raw = []  # Gestion si query_db retourne None
        # Utilise un set pour compter les bases uniques des flags qui contiennent ':'
        flag_bases = {
            row["flag"].split(":", 1)[0]
            for row in flags_raw
            if row.get("flag") and ":" in row["flag"]
        }
        flag_count = len(flag_bases)

        return jsonify(
            {
                "users": user_count,
                "worlds": world_count,
                "flags": flag_count,  # Nombre de bases de flags uniques
            }
        )
    except Exception as e:
        print(f"Erreur API stats: {e}")
        return jsonify({"error": "Impossible de récupérer les statistiques"}), 500


@app.route("/api/users")
def get_users():
    """Liste tous les utilisateurs avec quelques infos et compte de flags."""
    # Jointure pour compter les flags par utilisateur
    query = """
        SELECT
            u.username,
            u.first_name,
            u.last_name,
            u.filiere,
            u.blocked,
            COALESCE(fc.flag_count, 0) as flag_count -- Utilise COALESCE pour afficher 0 si aucun flag
        FROM users u
        LEFT JOIN (
            SELECT username, COUNT(flag) as flag_count
            FROM flags
            GROUP BY username
        ) fc ON u.username = fc.username
        ORDER BY u.username COLLATE NOCASE ASC
    """
    users = query_db(query)
    if users is None:
        return (
            jsonify({"error": "Erreur lors de la récupération des utilisateurs"}),
            500,
        )
    return jsonify(users)


@app.route("/api/user/<username>")
def get_user_detail(username):
    """Récupère les détails complets d'un utilisateur."""
    user_info = query_db("SELECT * FROM users WHERE username = ?", [username], one=True)

    # Même si l'utilisateur n'est pas dans la table 'users', il peut avoir des flags/worlds
    if user_info is None:
        # Vérifier s'il existe ailleurs
        exists_elsewhere = query_db(
            "SELECT 1 FROM flags WHERE username = ? LIMIT 1", [username], one=True
        ) or query_db(
            "SELECT 1 FROM worlds WHERE username = ? LIMIT 1", [username], one=True
        )
        if not exists_elsewhere:
            # L'utilisateur n'existe nulle part
            return jsonify({"error": f"Utilisateur '{username}' non trouvé"}), 404
        # Créer une entrée minimale s'il existe ailleurs mais pas dans 'users'
        user_info = {
            "username": username,
            "first_name": "N/A",
            "last_name": "N/A",
            "email": "N/A",
            "profile": None,
            "filiere": "N/A",
            "blocked": None,
            "created_at": "N/A",
        }

    # Récupère les flags de l'utilisateur
    flags = query_db(
        "SELECT flag, date FROM flags WHERE username = ? ORDER BY date DESC", [username]
    )
    # Récupère la dernière position connue de l'utilisateur
    position = query_db(
        "SELECT world_ID, location, room, created_at FROM worlds WHERE username = ? ORDER BY created_at DESC LIMIT 1",
        [username],
        one=True,
    )

    # Assure que 'flags' est une liste, même si aucun flag n'est trouvé ou en cas d'erreur
    if flags is None:
        flags = []

    return jsonify({"details": user_info, "flags": flags, "last_position": position})


@app.route("/api/compare")
def compare_users():
    """Compare les bases de flags entre deux utilisateurs."""
    user1 = request.args.get("user1")
    user2 = request.args.get("user2")

    if not user1 or not user2:
        return jsonify({"error": "Les paramètres 'user1' et 'user2' sont requis"}), 400

    # Récupère les flags pour chaque utilisateur
    flags1_raw = query_db("SELECT flag FROM flags WHERE username = ?", [user1])
    flags2_raw = query_db("SELECT flag FROM flags WHERE username = ?", [user2])

    # Gère le cas où la requête échoue pour l'un des utilisateurs
    if flags1_raw is None or flags2_raw is None:
        return (
            jsonify(
                {
                    "error": "Erreur lors de la récupération des flags pour la comparaison"
                }
            ),
            500,
        )

    # Extrait la partie avant le premier ':' pour la comparaison.
    # Utilise row.get('flag', '') pour éviter une erreur si la colonne 'flag' manque (peu probable).
    # Ajoute 'if f' pour ignorer les cas où le split donnerait une chaîne vide.
    flags1_bases = {
        f.split(":", 1)[0] for row in flags1_raw if (f := row.get("flag")) and ":" in f
    }
    flags2_bases = {
        f.split(":", 1)[0] for row in flags2_raw if (f := row.get("flag")) and ":" in f
    }

    # Calcule les différences et l'intersection
    ahead = sorted(
        list(flags1_bases - flags2_bases)
    )  # Flags que user1 a et user2 n'a pas
    behind = sorted(
        list(flags2_bases - flags1_bases)
    )  # Flags que user2 a et user1 n'a pas
    common = sorted(list(flags1_bases & flags2_bases))  # Flags en commun

    return jsonify(
        {
            "user1": user1,
            "user2": user2,
            "ahead_count": len(ahead),
            "behind_count": len(behind),
            "common_count": len(common),
            "ahead": ahead,  # Bases de flags que user1 a en plus
            "behind": behind,  # Bases de flags que user2 a en plus
            "common": common,  # Bases de flags en commun
        }
    )


# --- NOUVELLE ROUTE ---
@app.route("/api/update-db", methods=["POST"])
def trigger_db_update():
    """Exécute le script update_db.py."""
    if not os.path.exists(UPDATE_SCRIPT_PATH):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Script d'update non configuré ou non trouvé sur le serveur.",
                }
            ),
            501,
        )  # 501 Not Implemented

    print(f"Tentative d'exécution du script: {UPDATE_SCRIPT_PATH}")
    try:
        # Exécute le script en utilisant le même interpréteur Python que celui qui exécute Flask
        # Capture stdout et stderr, décode en UTF-8
        # Ajout d'un timeout (par exemple, 5 minutes) pour éviter les blocages indéfinis
        # ATTENTION: Ceci bloque toujours le worker Flask pendant l'exécution.
        # Pour des scripts très longs, une solution asynchrone (Celery, RQ) est préférable.
        process = subprocess.run(
            [sys.executable, UPDATE_SCRIPT_PATH],
            capture_output=True,
            text=True,
            check=False,  # Ne pas lever d'exception si le script retourne un code non nul
            timeout=300,  # Timeout de 5 minutes (ajuster si nécessaire)
        )

        print(f"Script terminé avec le code: {process.returncode}")
        # print(f"stdout:\n{process.stdout}") # Optionnel: log stdout
        # print(f"stderr:\n{process.stderr}") # Optionnel: log stderr

        if process.returncode == 0:
            # Succès - peut inclure une partie du stdout si pertinent
            output_summary = process.stdout.strip().splitlines()
            message = f"Mise à jour terminée avec succès."
            if output_summary:
                # Prend les 5 dernières lignes de la sortie comme résumé
                message += "\n" + "\n".join(output_summary[-5:])
            return jsonify({"success": True, "message": message})
        else:
            # Échec - inclure stderr dans la réponse d'erreur
            error_message = (
                f"Le script de mise à jour a échoué (code: {process.returncode})."
            )
            if process.stderr:
                error_details = process.stderr.strip().splitlines()
                error_message += "\n" + "\n".join(
                    error_details[-5:]
                )  # Dernières 5 lignes de l'erreur
            elif process.stdout:  # Parfois l'erreur est sur stdout
                error_details = process.stdout.strip().splitlines()
                error_message += "\n" + "\n".join(error_details[-5:])

            print(f"Erreur lors de l'exécution du script: {error_message}")
            return jsonify({"success": False, "error": error_message}), 500

    except subprocess.TimeoutExpired:
        print(f"Erreur: Le script de mise à jour a dépassé le timeout de 300 secondes.")
        return (
            jsonify(
                {
                    "success": False,
                    "error": "L'opération de mise à jour a pris trop de temps et a été interrompue.",
                }
            ),
            500,
        )
    except Exception as e:
        print(f"Erreur inattendue lors de la tentative d'exécution du script: {e}")
        return (
            jsonify(
                {
                    "success": False,
                    "error": f"Erreur serveur inattendue lors du lancement de la mise à jour: {e}",
                }
            ),
            500,
        )


# --- FIN NOUVELLE ROUTE ---


# --- Route pour servir l'interface HTML ---
@app.route("/")
def index():
    """Sert le fichier HTML principal."""
    return render_template("index.html")


# --- Démarrage ---
if __name__ == "__main__":
    print("*" * 50)
    print(f"Démarrage du serveur API Kerberos Data")
    print(f"Base de données: {os.path.abspath(DATABASE)}")
    if os.path.exists(UPDATE_SCRIPT_PATH):
        print(f"Script d'update: {UPDATE_SCRIPT_PATH}")
    else:
        print(f"Script d'update: NON TROUVÉ à {UPDATE_SCRIPT_PATH}")
    print(f"Interface disponible à: http://127.0.0.1:5002")  # Changer le port si besoin
    print("*" * 50)
    # host='0.0.0.0' rend le serveur accessible depuis d'autres machines sur le réseau
    # debug=True active le rechargement automatique et le débogueur (NE PAS utiliser en production)
    app.run(debug=True, host="0.0.0.0", port=5002)
