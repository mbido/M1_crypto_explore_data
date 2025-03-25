# backend/api.py
import sqlite3
import os
from flask import Flask, jsonify, g, render_template, abort, request
from flask_cors import CORS  # Pour autoriser les requêtes depuis le JS

# --- Configuration ---
# Le chemin est relatif à l'emplacement de api.py
DATABASE = os.path.join("..", "db", "game_data.db")
# --- Fin Configuration ---

# Vérifie si la DB existe au démarrage
if not os.path.exists(DATABASE):
    raise FileNotFoundError(
        f"ERREUR: Base de données non trouvée à {os.path.abspath(DATABASE)}. Assurez-vous qu'elle existe."
    )

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
        user_count = query_db("SELECT COUNT(DISTINCT username) FROM users", one=True)[
            "COUNT(DISTINCT username)"
        ]
        # Compte les mondes uniques dans la table worlds
        world_count = query_db("SELECT COUNT(DISTINCT world_ID) FROM worlds", one=True)[
            "COUNT(DISTINCT world_ID)"
        ]
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
    print(f"Interface disponible à: http://127.0.0.1:5002")  # Changer le port si besoin
    print("*" * 50)
    # host='0.0.0.0' rend le serveur accessible depuis d'autres machines sur le réseau
    # debug=True active le rechargement automatique et le débogueur (NE PAS utiliser en production)
    app.run(debug=True, host="0.0.0.0", port=5002)
