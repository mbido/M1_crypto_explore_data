# backend/api.py
import sqlite3
import os
import subprocess
import sys
import json
from flask import Flask, jsonify, g, render_template, abort, request
from flask_cors import CORS

# --- Import from kerberos.py ---
SCRIPT_DIR_API = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.join(SCRIPT_DIR_API, "..")
sys.path.insert(0, PARENT_DIR)
try:
    # ConnectionError is built-in, OpensslError is custom
    from kerberos import (
        KerberosClient,
        KERBERIZED_METHODS,
        NON_KERBERIZED_METHODS,
        OpensslError,
    )
except ImportError as e:
    print(f"ERREUR: Impossible d'importer depuis kerberos.py: {e}")
    raise ImportError(f"Kerberos module import failed: {e}") from e
finally:
    if PARENT_DIR in sys.path:
        sys.path.remove(PARENT_DIR)

# --- Configuration ---
DATABASE = os.path.join("..", "db", "game_data.db")
UPDATE_SCRIPT_PATH = os.path.join(SCRIPT_DIR_API, "..", "update_db.py")

# --- Database & Update Script Checks ---
if not os.path.exists(DATABASE):
    raise FileNotFoundError(
        f"ERREUR: Base de données non trouvée: {os.path.abspath(DATABASE)}"
    )
if not os.path.exists(UPDATE_SCRIPT_PATH):
    print(f"AVERTISSEMENT: Script d'update non trouvé: {UPDATE_SCRIPT_PATH}")

# --- Flask App Initialization ---
app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)


# --- Database Connection Management (get_db, close_connection, query_db) ---
def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        try:
            db = g._database = sqlite3.connect(DATABASE, check_same_thread=False)
            db.row_factory = sqlite3.Row
        except sqlite3.Error as e:
            print(f"Erreur connexion DB: {e}")
            abort(500, description="Erreur connexion DB")
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
        return (dict(rv[0]) if rv else None) if one else [dict(row) for row in rv]
    except sqlite3.Error as e:
        print(f"Erreur SQLite: {e}\nQuery: {query}\nArgs: {args}")
        return None


# --- Standard API Routes (/api/stats, /api/users, /api/user/<username>, /api/compare) ---


@app.route("/api/stats")
def get_stats():
    """Récupère des statistiques globales."""
    try:
        user_count_res = query_db(
            "SELECT COUNT(DISTINCT username) FROM users", one=True
        )
        user_count = user_count_res["COUNT(DISTINCT username)"] if user_count_res else 0

        world_count_res = query_db(
            "SELECT COUNT(DISTINCT world_ID) FROM worlds", one=True
        )
        world_count = (
            world_count_res["COUNT(DISTINCT world_ID)"] if world_count_res else 0
        )

        flags_raw = query_db("SELECT DISTINCT flag FROM flags")
        if flags_raw is None:
            flags_raw = []
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
                "flags": flag_count,
            }
        )
    except Exception as e:
        print(f"Erreur API stats: {e}")
        return jsonify({"error": "Impossible de récupérer les statistiques"}), 500


@app.route("/api/users")
def get_users():
    """Liste tous les utilisateurs avec quelques infos et compte de flags."""
    query = """
        SELECT
            u.username,
            u.first_name,
            u.last_name,
            u.filiere,
            u.blocked,
            COALESCE(fc.flag_count, 0) as flag_count
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

    if user_info is None:
        exists_elsewhere = query_db(
            "SELECT 1 FROM flags WHERE username = ? LIMIT 1", [username], one=True
        ) or query_db(
            "SELECT 1 FROM worlds WHERE username = ? LIMIT 1", [username], one=True
        )
        if not exists_elsewhere:
            return jsonify({"error": f"Utilisateur '{username}' non trouvé"}), 404
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

    flags = query_db(
        "SELECT flag, date FROM flags WHERE username = ? ORDER BY date DESC", [username]
    )
    if flags is None:
        flags = []

    position = query_db(
        "SELECT world_ID, location, room, created_at FROM worlds WHERE username = ? ORDER BY created_at DESC LIMIT 1",
        [username],
        one=True,
    )

    return jsonify({"details": user_info, "flags": flags, "last_position": position})


@app.route("/api/compare")
def compare_users():
    """Compare les bases de flags entre deux utilisateurs."""
    user1 = request.args.get("user1")
    user2 = request.args.get("user2")

    if not user1 or not user2:
        return jsonify({"error": "Les paramètres 'user1' et 'user2' sont requis"}), 400

    flags1_raw = query_db("SELECT flag FROM flags WHERE username = ?", [user1])
    flags2_raw = query_db("SELECT flag FROM flags WHERE username = ?", [user2])

    if flags1_raw is None or flags2_raw is None:
        return jsonify({"error": "Erreur lors de la récupération des flags"}), 500

    flags1_bases = {
        f.split(":", 1)[0] for row in flags1_raw if (f := row.get("flag")) and ":" in f
    }
    flags2_bases = {
        f.split(":", 1)[0] for row in flags2_raw if (f := row.get("flag")) and ":" in f
    }

    ahead = sorted(list(flags1_bases - flags2_bases))
    behind = sorted(list(flags2_bases - flags1_bases))
    common = sorted(list(flags1_bases & flags2_bases))

    return jsonify(
        {
            "user1": user1,
            "user2": user2,
            "ahead_count": len(ahead),
            "behind_count": len(behind),
            "common_count": len(common),
            "ahead": ahead,
            "behind": behind,
            "common": common,
        }
    )


# --- DB Update Route (/api/update-db) ---
@app.route("/api/update-db", methods=["POST"])
def trigger_db_update():
    """Exécute le script update_db.py."""
    if not os.path.exists(UPDATE_SCRIPT_PATH):
        return (
            jsonify({"success": False, "error": "Script d'update non configuré."}),
            501,
        )

    print(f"Tentative d'exécution du script: {UPDATE_SCRIPT_PATH}")
    try:
        process = subprocess.run(
            [sys.executable, UPDATE_SCRIPT_PATH],
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
        print(f"Script terminé avec le code: {process.returncode}")

        if process.returncode == 0:
            output_summary = process.stdout.strip().splitlines()
            message = "Mise à jour terminée avec succès."
            if output_summary:
                message += "\n" + "\n".join(output_summary[-5:])
            return jsonify({"success": True, "message": message})
        else:
            error_message = (
                f"Le script de mise à jour a échoué (code: {process.returncode})."
            )
            details = (
                process.stderr.strip().splitlines()
                or process.stdout.strip().splitlines()
            )
            if details:
                error_message += "\n" + "\n".join(details[-5:])
            print(f"Erreur lors de l'exécution du script: {error_message}")
            return jsonify({"success": False, "error": error_message}), 500

    except subprocess.TimeoutExpired:
        print(f"Erreur: Le script de mise à jour a dépassé le timeout.")
        return jsonify({"success": False, "error": "Timeout dépassé."}), 500
    except Exception as e:
        print(f"Erreur inattendue: {e}")
        return jsonify({"success": False, "error": f"Erreur serveur: {e}"}), 500


# --- SANDBOX Definitions ---

# Define parameters for known methods here
# Structure: { 'method_name': [ { 'name': 'param_name', 'type': 'hint', 'required': True/False, 'description': '...' }, ... ] }
# Type hints: 'string', 'int', 'boolean', 'list[string]', 'list[int]', 'json' (for complex dicts/lists needing JSON input)
METHOD_PARAMETERS = {
    "man": [
        {
            "name": "method",
            "type": "string",
            "required": True,
            "description": "Nom de la méthode pour obtenir le manuel.",
        }
    ],
    "echo": [
        {
            "name": "message",
            "type": "string",
            "required": True,
            "description": "Message à renvoyer.",
        }
    ],
    "world.list": [],
    "world.create": [
        {
            "name": "ip",
            "type": "string",
            "required": True,
            "description": "Adresse IP pour le nouveau monde.",
        },
        {
            "name": "protocol",
            "type": "string",
            "required": True,
            "description": "Protocole (ex: 'TCP').",
        },
        {
            "name": "extended_client",
            "type": "boolean",
            "required": True,
            "description": "Client étendu (true/false).",
        },
    ],
    "world.destroy": [  # Assuming it takes world_id based on common patterns
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde à détruire.",
        }
    ],
    "server.status": [],
    "server.history": [],  # Assuming no params, adjust if needed
    "kerberos.authentication-service": [
        {
            "name": "username",
            "type": "string",
            "required": True,
            "description": "Nom d'utilisateur pour l'authentification initiale.",
        }
    ],
    "kerberos.ticket-granting-service": [
        {
            "name": "ticket",
            "type": "string",
            "required": True,
            "description": "Ticket TGT obtenu de l'AS.",
        },
        {
            "name": "authenticator",
            "type": "string",
            "required": True,
            "description": "Authentificateur chiffré avec la clé de session.",
        },
        {
            "name": "method",
            "type": "string",
            "required": True,
            "description": "Nom de la méthode pour laquelle obtenir un ticket de service.",
        },
    ],
    "kerberos.echo": [
        {
            "name": "message",
            "type": "string",
            "required": True,
            "description": "Message à renvoyer (via Kerberos).",
        }
    ],
    "protagonist.location": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde pour obtenir la localisation.",
        }
    ],
    "protagonist.data-collection": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde pour collecter les données.",
        }
    ],
    "protagonist.username": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde pour obtenir le nom d'utilisateur associé.",
        }
    ],
    "protagonist.move": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde où se déplacer.",
        },
        {
            "name": "room",
            "type": "string",
            "required": True,
            "description": "Nom ou ID de la salle destination.",
        },
    ],
    "room.name": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "room",
            "type": "string",
            "required": True,
            "description": "ID de la salle pour obtenir son nom.",
        },
    ],
    "room.find-by-name": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "name",
            "type": "string",
            "required": True,
            "description": "Nom de la salle à rechercher.",
        },
    ],
    "room.items": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "room",
            "type": "string",
            "required": True,
            "description": "ID de la salle pour lister les items.",
        },
    ],
    "room.neighbor": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "room",
            "type": "string",
            "required": True,
            "description": "ID de la salle actuelle.",
        },
        {
            "name": "direction",
            "type": "string",
            "required": True,
            "description": "Direction (ex: 'north', 'south', 'east', 'west').",
        },
    ],
    "item.description": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "item",
            "type": "string",
            "required": True,
            "description": "ID de l'item pour obtenir sa description.",
        },
    ],
    "item.location": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "item",
            "type": "string",
            "required": True,
            "description": "ID de l'item pour obtenir sa localisation.",
        },
    ],
    "item.move": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "item",
            "type": "string",
            "required": True,
            "description": "ID de l'item à déplacer.",
        },
        {
            "name": "destination",
            "type": "string",
            "required": True,
            "description": "ID de la salle destination.",
        },
    ],
    "chip.whisperer": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "ciphertexts",
            "type": "list[string]",
            "required": True,
            "description": 'Liste de textes chiffrés (entrer comme JSON: ["c1", "c2"]).',
        },
    ],
    "walkman.get-tracks": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        }
    ],
    "action.is_done": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "name",
            "type": "string",
            "required": True,
            "description": "Nom de l'action à vérifier.",
        },
    ],
    "action.do": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "name",
            "type": "string",
            "required": True,
            "description": "Nom de l'action à effectuer.",
        },
        # Assuming 'args' might be needed, treat as flexible JSON
        {
            "name": "args",
            "type": "json",
            "required": False,
            "description": 'Arguments optionnels pour l\'action (entrer comme JSON: {} ou {"key": "value"}).',
        },
    ],
    # Add any other methods from kerberos.py if needed
}

# --- SANDBOX API Routes ---


@app.route("/api/sandbox/commands")
def get_sandbox_commands():
    """Retourne la liste des commandes Kerberos avec leurs paramètres."""
    # --- ADD THIS LINE ---
    print("--- Endpoint /api/sandbox/commands reached! ---")
    # --- END ADDITION ---
    try:
        all_method_names = sorted(
            list(set(KERBERIZED_METHODS + NON_KERBERIZED_METHODS))
        )

        commands_with_params = []
        for name in all_method_names:
            params = METHOD_PARAMETERS.get(
                name, []
            )  # Get params from our dict, default to empty list
            commands_with_params.append(
                {
                    "name": name,
                    "kerberized": name in KERBERIZED_METHODS,
                    "params": params,
                }
            )

        return jsonify(commands_with_params)
    except NameError:
        # --- ADD THIS PRINT ---
        print(
            "--- ERROR in get_sandbox_commands: NameError (KERBERIZED_METHODS etc. not found?) ---"
        )
        return (
            jsonify(
                {
                    "error": "Listes de commandes Kerberos non trouvées (KERBERIZED_METHODS, etc.)."
                }
            ),
            500,
        )
    except Exception as e:
        # --- ADD THIS PRINT ---
        print(f"--- ERROR in get_sandbox_commands: {e} ---")
        print(f"Erreur récupération commandes sandbox: {e}")
        return jsonify({"error": f"Erreur serveur: {e}"}), 500


@app.route("/api/sandbox/execute", methods=["POST"])
def execute_sandbox_command():
    """Exécute une commande Kerberos via KerberosClient."""
    data = request.get_json()
    if not data or "method_name" not in data:
        return (
            jsonify({"success": False, "error": "Nom méthode ('method_name') requis."}),
            400,
        )

    method_name = data.get("method_name")
    params_dict = data.get("params", {})  # Expects a dict from frontend

    if not isinstance(params_dict, dict):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Paramètres ('params') doit être un objet JSON.",
                }
            ),
            400,
        )

    print(f"Sandbox Execute: '{method_name}' avec params: {params_dict}")

    try:
        # Instantiate client. Assumes KerberosClient handles its own credential loading (e.g., from .env)
        client = KerberosClient()
        print(f"Sandbox: Client Kerberos instancié pour '{client.username}'.")

        # Call the method using keyword arguments
        result = client.call_method(method_name, **params_dict)

        print(f"Sandbox: Exécution '{method_name}' réussie.")
        return jsonify({"success": True, "result": result})

    except (ValueError, OpensslError, ConnectionError, RuntimeError, TypeError) as e:
        # Handle known errors from client or invalid input
        error_message = f"Erreur exécution '{method_name}': {e}"
        print(f"Sandbox Error: {error_message}")
        # Determine appropriate HTTP status code based on error type
        status_code = (
            400
            if isinstance(e, (ValueError, TypeError))
            and ("parameter" in str(e).lower() or "argument" in str(e).lower())
            else 500
        )
        if isinstance(e, ConnectionError):
            status_code = 503  # Service unavailable for connection issues
        if isinstance(e, OpensslError) and ("decrypt" in str(e).lower()):
            status_code = (
                401  # Unauthorized likely for decryption failure (bad ticket/key)
            )
        return jsonify({"success": False, "error": error_message}), status_code
    except AttributeError:
        # Handle cases where the method doesn't exist on the client instance
        error_message = f"Erreur: Méthode '{method_name}' non trouvée/implémentée dans KerberosClient."
        print(f"Sandbox Error: {error_message}")
        return jsonify({"success": False, "error": error_message}), 404  # Not Found
    except Exception as e:
        # Catch-all for any other unexpected errors
        error_message = f"Erreur serveur inattendue exécution '{method_name}': {e}"
        print(f"Sandbox Unexpected Error: {error_message}")
        import traceback

        traceback.print_exc()  # Log full traceback for server-side debugging
        return jsonify({"success": False, "error": error_message}), 500


# --- FIN SANDBOX API Routes ---


# --- Route pour servir l'interface HTML ---
@app.route("/")
def index():
    """Sert le fichier HTML principal."""
    return render_template("index.html")


# --- Démarrage ---
if __name__ == "__main__":
    print("*" * 50)
    print(f"Démarrage Serveur API Kerberos Data")
    print(f"DB: {os.path.abspath(DATABASE)}")
    print(
        f"Script Update: {UPDATE_SCRIPT_PATH if os.path.exists(UPDATE_SCRIPT_PATH) else 'NON TROUVÉ'}"
    )
    try:
        # Verify Kerberos methods and parameters definition are loaded
        print(
            f"Méthodes Kerberos: {len(KERBERIZED_METHODS)} Kerb, {len(NON_KERBERIZED_METHODS)} Non-Kerb"
        )
        print(f"Paramètres définis pour {len(METHOD_PARAMETERS)} méthodes.")
    except NameError:
        print("AVERTISSEMENT: Listes/Params méthodes Kerberos non chargées.")
    print(f"Interface disponible: http://127.0.0.1:5002")
    print("*" * 50)
    # debug=True enables auto-reload and debugger (NOT for production)
    # host='0.0.0.0' makes the server accessible on your network
    app.run(debug=True, host="0.0.0.0", port=5002)
