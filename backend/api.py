# backend/api.py
import sqlite3
import os
import subprocess
import sys
import json
from flask import Flask, jsonify, g, render_template, abort, request
from flask_cors import CORS
import datetime
import tqdm


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

    # --- NOUVEL IMPORT ---
    # Assumes depth_first_search_map.py is in the parent directory
    from depth_first_search_map import get_all_rooms as perform_dfs_search

except ImportError as e:
    print(f"ERREUR: Impossible d'importer depuis les modules parents: {e}")
    # Try to remove the path if it was added, even on error
    if PARENT_DIR in sys.path:
        sys.path.remove(PARENT_DIR)
    raise ImportError(f"Module import failed: {e}") from e
# finally: # Removed finally block as we might need the path later if other imports fail
#     if PARENT_DIR in sys.path:
#         sys.path.remove(PARENT_DIR)

# --- Configuration ---
DATABASE = os.path.join(PARENT_DIR, "db", "game_data.db")  # Adjusted path
UPDATE_SCRIPT_PATH = os.path.join(PARENT_DIR, "update_db.py")  # Adjusted path

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
# ... (code inchangé) ...
def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        try:
            # Use the absolute path to the database in the parent directory
            db_path = os.path.abspath(DATABASE)
            print(f"Connecting to DB: {db_path}")
            db = g._database = sqlite3.connect(db_path, check_same_thread=False)
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
        # Return None or raise an exception depending on desired handling
        # Returning None might hide errors, raising could be better
        # For now, let's return None to match existing behavior but log clearly
        return None
    except Exception as e:  # Catch other potential errors during DB interaction
        print(f"Erreur inattendue pendant query_db: {e}")
        return None


# --- Standard API Routes (/api/stats, /api/users, /api/user/<username>, /api/compare) ---
# ... (code inchangé) ...


@app.route("/api/stats")
def get_stats():
    """Récupère des statistiques globales."""
    try:
        user_count_res = query_db(
            "SELECT COUNT(DISTINCT username) as count FROM users", one=True
        )
        user_count = user_count_res["count"] if user_count_res else 0

        world_count_res = query_db(
            "SELECT COUNT(DISTINCT world_ID) as count FROM worlds", one=True
        )
        world_count = world_count_res["count"] if world_count_res else 0

        # Recalculate flag bases correctly
        flags_raw = query_db("SELECT DISTINCT flag FROM flags")
        if flags_raw is None:  # query_db might return None on error
            print("Warning: Failed to fetch flags for stats.")
            flags_raw = []

        flag_bases = set()
        for row in flags_raw:
            flag_value = row.get("flag")
            if flag_value and ":" in flag_value:
                base = flag_value.split(":", 1)[0]
                flag_bases.add(base)
            # Optionally handle flags without ":" if needed
            # elif flag_value:
            #    flag_bases.add(flag_value) # Treat flags without ':' as their own base?

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
        # Log the full traceback for debugging
        import traceback

        traceback.print_exc()
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
            SELECT username, COUNT(DISTINCT flag) as flag_count -- Use DISTINCT flag
            FROM flags
            GROUP BY username
        ) fc ON u.username = fc.username
        ORDER BY u.username COLLATE NOCASE ASC
    """
    users = query_db(query)
    if users is None:  # Check if query_db returned None due to error
        return (
            jsonify({"error": "Erreur lors de la récupération des utilisateurs"}),
            500,
        )
    return jsonify(users)


@app.route("/api/user/<username>")
def get_user_detail(username):
    """Récupère les détails complets d'un utilisateur."""
    # Fetch user details or create placeholder if user exists only in flags/worlds
    user_info = query_db("SELECT * FROM users WHERE username = ?", [username], one=True)

    if user_info is None:
        # Check if the user exists in other tables before declaring not found
        exists_in_flags = query_db(
            "SELECT 1 FROM flags WHERE username = ? LIMIT 1", [username], one=True
        )
        exists_in_worlds = query_db(
            "SELECT 1 FROM worlds WHERE username = ? LIMIT 1", [username], one=True
        )

        if not exists_in_flags and not exists_in_worlds:
            # User truly not found anywhere
            return jsonify({"error": f"Utilisateur '{username}' non trouvé"}), 404
        else:
            # User exists but not in 'users' table, provide minimal info
            user_info = {
                "username": username,
                "first_name": None,  # Explicitly None instead of "N/A"
                "last_name": None,
                "email": None,
                "profile": None,
                "filiere": None,
                "blocked": None,  # Status unknown
                "created_at": None,  # Creation date unknown
            }
            print(f"User '{username}' found in flags/worlds but not in users table.")

    # Fetch flags (handle potential None from query_db)
    flags = query_db(
        "SELECT flag, date FROM flags WHERE username = ? ORDER BY date DESC", [username]
    )
    if flags is None:
        print(f"Warning: Failed to fetch flags for user '{username}'.")
        flags = []  # Return empty list on error

    # Fetch last position (handle potential None from query_db)
    position = query_db(
        "SELECT world_ID, location, room, created_at FROM worlds WHERE username = ? ORDER BY created_at DESC LIMIT 1",
        [username],
        one=True,
    )
    # No need to check if position is None here, frontend handles it

    return jsonify({"details": user_info, "flags": flags, "last_position": position})


@app.route("/api/compare")
def compare_users():
    """Compare les bases de flags entre deux utilisateurs."""
    user1 = request.args.get("user1")
    user2 = request.args.get("user2")

    if not user1 or not user2:
        return jsonify({"error": "Les paramètres 'user1' et 'user2' sont requis"}), 400

    if user1 == user2:
        return (
            jsonify({"error": "Veuillez sélectionner deux utilisateurs différents"}),
            400,
        )

    # Helper function to get flag bases for a user
    def get_flag_bases(username):
        flags_raw = query_db("SELECT flag FROM flags WHERE username = ?", [username])
        if flags_raw is None:  # Handle DB error
            return None
        bases = set()
        for row in flags_raw:
            flag_value = row.get("flag")
            if flag_value and ":" in flag_value:
                bases.add(flag_value.split(":", 1)[0])
            # elif flag_value: # Decide if non-base flags should be included/handled
            #     bases.add(flag_value)
        return bases

    flags1_bases = get_flag_bases(user1)
    flags2_bases = get_flag_bases(user2)

    if flags1_bases is None or flags2_bases is None:
        return (
            jsonify(
                {
                    "error": "Erreur lors de la récupération des flags pour un ou plusieurs utilisateurs"
                }
            ),
            500,
        )

    # Perform set operations
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
# ... (code inchangé) ...
@app.route("/api/update-db", methods=["POST"])
def trigger_db_update():
    """Exécute le script update_db.py."""
    update_script_abs_path = os.path.abspath(UPDATE_SCRIPT_PATH)
    if not os.path.exists(update_script_abs_path):
        print(
            f"ERROR: Update script not found at expected location: {update_script_abs_path}"
        )
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Script d'update non configuré ou non trouvé sur le serveur.",
                }
            ),
            501,  # Not Implemented or Internal Server Error might be suitable
        )

    print(f"Tentative d'exécution du script: {update_script_abs_path}")
    try:
        # Ensure using the correct python executable (the one running Flask)
        python_executable = sys.executable
        process = subprocess.run(
            [python_executable, update_script_abs_path],
            capture_output=True,
            text=True,
            check=False,  # Don't raise exception on non-zero exit code
            timeout=300,  # 5 minutes timeout
            cwd=PARENT_DIR,  # Run script from the parent directory if it expects relative paths
            env=os.environ.copy(),  # Pass environment variables (like potential DB credentials if used differently)
        )
        print(f"Script terminé avec le code: {process.returncode}")
        print("--- Script STDOUT ---")
        print(process.stdout)
        print("--- Script STDERR ---")
        print(process.stderr)
        print("---------------------")

        if process.returncode == 0:
            # Extract last few lines of output for summary
            output_lines = process.stdout.strip().splitlines()
            summary = (
                "\n".join(output_lines[-10:])
                if output_lines
                else "(Pas de sortie standard)"
            )
            message = f"Mise à jour terminée avec succès.\n\nRésumé:\n{summary}"
            return jsonify({"success": True, "message": message})
        else:
            # Try to get error details from stderr first, then stdout
            error_details_lines = (
                process.stderr.strip().splitlines()
                or process.stdout.strip().splitlines()
            )
            error_summary = (
                "\n".join(error_details_lines[-10:])
                if error_details_lines
                else "(Pas de sortie d'erreur)"
            )
            error_message = (
                f"Le script de mise à jour a échoué (code: {process.returncode}).\n\n"
                f"Détails:\n{error_summary}"
            )
            print(f"Erreur lors de l'exécution du script: {error_message}")
            return jsonify({"success": False, "error": error_message}), 500

    except subprocess.TimeoutExpired:
        error_msg = f"Timeout dépassé ({300}s) lors de l'exécution du script d'update."
        print(f"Erreur: {error_msg}")
        return jsonify({"success": False, "error": error_msg}), 504  # Gateway Timeout
    except FileNotFoundError:
        error_msg = f"Erreur: Le chemin vers l'interpréteur Python '{sys.executable}' ou le script '{update_script_abs_path}' est invalide."
        print(error_msg)
        return jsonify({"success": False, "error": error_msg}), 500
    except Exception as e:
        error_msg = (
            f"Erreur serveur inattendue lors du lancement du script d'update: {e}"
        )
        print(f"Erreur inattendue: {e}")
        import traceback

        traceback.print_exc()
        return jsonify({"success": False, "error": error_msg}), 500


# --- NOUVELLE ROUTE: Update Worlds Only ---
@app.route("/api/update-worlds", methods=["POST"])
def trigger_worlds_update():
    """
    Scanne rapidement les mondes pour mettre à jour uniquement
    la table 'worlds' (position des joueurs).
    """
    print("Début de la mise à jour rapide des positions (worlds)...")
    processed_worlds = 0
    updated_entries = 0
    added_entries = 0
    skipped_worlds = 0
    error_count = 0

    try:
        client = KerberosClient()
        world_list = client.list_worlds()
        print(f"Scan de {len(world_list)} mondes...")

        db = get_db()  # Récupère la connexion DB pour ce contexte de requête
        cursor = db.cursor()

        # Utilise tqdm pour une barre de progression côté serveur (optionnel)
        for world_info in tqdm.tqdm(world_list, desc="Scanning Worlds", unit=" world"):
            world_id = world_info[0]  # world_list contient des tuples/listes [id, ...]
            user = None  # Réinitialiser pour chaque monde
            try:
                user = client.user_from_world(world_id)
                if not user:
                    # print(f"  -> Aucun utilisateur pour {world_id}, skip.")
                    skipped_worlds += 1
                    continue

                location = client.location(world_id)
                room = client.room_name(world_id, location) if location else None

                # Logique d'insertion/mise à jour similaire à add_world de update_db.py
                # mais directement ici avec le curseur actuel.
                cursor.execute(
                    "SELECT location, room FROM worlds WHERE username = ? AND world_ID = ?",
                    (user, world_id),
                )
                existing_entry = cursor.fetchone()

                current_time_iso = datetime.datetime.now().isoformat()

                if existing_entry:
                    # Convert row to dict if row_factory was used, otherwise access by index
                    current_location = (
                        existing_entry["location"]
                        if isinstance(existing_entry, sqlite3.Row)
                        else existing_entry[0]
                    )
                    current_room = (
                        existing_entry["room"]
                        if isinstance(existing_entry, sqlite3.Row)
                        else existing_entry[1]
                    )

                    if location != current_location or room != current_room:
                        cursor.execute(
                            """
                            UPDATE worlds
                            SET location = ?, room = ?, created_at = ?
                            WHERE username = ? AND world_ID = ?
                            """,
                            (location, room, current_time_iso, user, world_id),
                        )
                        updated_entries += 1
                    # else: # Entry exists and is identical, do nothing
                    # pass
                else:
                    # Insert new entry
                    cursor.execute(
                        """
                        INSERT INTO worlds (username, world_ID, location, room, created_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (user, world_id, location, room, current_time_iso),
                    )
                    added_entries += 1

                db.commit()  # Commit après chaque ajout/màj réussie ou à la fin
                processed_worlds += 1

            except (
                ValueError,
                OpensslError,
                ConnectionError,
                RuntimeError,
                TypeError,
                KeyError,
            ) as api_err:
                print(
                    f"Erreur API Kerberos pour monde {world_id} (User: {user}): {type(api_err).__name__} - {api_err}"
                )
                error_count += 1
                db.rollback()  # Annule la transaction pour ce monde si erreur API/DB
                continue  # Passe au monde suivant
            except sqlite3.Error as db_err:
                print(f"Erreur DB pour monde {world_id} (User: {user}): {db_err}")
                error_count += 1
                db.rollback()  # Annule la transaction pour ce monde
                continue  # Passe au monde suivant

        # Fin de la boucle
        # Commit final (au cas où le dernier commit dans la boucle n'a pas été fait)
        db.commit()

        summary = (
            f"MAJ Positions terminée.\n"
            f"Mondes traités: {processed_worlds}\n"
            f"Mondes sans user/skippés: {skipped_worlds}\n"
            f"Entrées MàJ: {updated_entries}\n"
            f"Entrées Ajoutées: {added_entries}\n"
            f"Erreurs rencontrées: {error_count}"
        )
        print(summary)
        return jsonify({"success": True, "message": summary})

    except Exception as e:
        # Erreur générale (ex: connexion Kerberos initiale, liste des mondes impossible...)
        error_msg = f"Erreur générale lors de la mise à jour des positions: {type(e).__name__} - {e}"
        print(error_msg)
        import traceback

        traceback.print_exc()
        # Assurer un rollback en cas d'erreur générale avant la boucle ou pendant l'init
        try:
            get_db().rollback()
        except Exception as rollback_err:
            print(f"Erreur lors du rollback général: {rollback_err}")

        return jsonify({"success": False, "error": error_msg}), 500
    # finally: # La connexion DB est gérée par le contexte Flask (@teardown_appcontext)
    #     pass


# --- SANDBOX Definitions ---

# {
#     "doc": "Log the thoughts of the protagonist for posterity (and data mining).",
#     "kerberized": true,
#     "restricted": false,
#     "signature": "(world_id: str, thought: str)",
# }

METHOD_PARAMETERS = {
    "protagonist.think": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "Identifiant du monde",
        },
        {
            "name": "thought",
            "type": "string",
            "required": True,
            "description": "Pensée du joueur",
        },
    ],
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
    "world.destroy": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde à détruire.",
        }
    ],
    "server.status": [],
    "server.history": [],
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
            "name": "room",  # Garde 'room' comme nom de paramètre pour correspondre à kerberos.py
            "type": "string",
            "required": True,
            "description": "ID de la salle destination.",
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
            "name": "room",  # Garde 'room'
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
            "name": "room",  # Garde 'room'
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
            "name": "room",  # Garde 'room'
            "type": "string",
            "required": True,
            "description": "ID de la salle actuelle.",
        },
        {
            "name": "direction",
            "type": "string",
            "required": True,
            "description": "Direction (N, W, S, E, IN, OUT, UP, DOWN).",
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
    "chip.whisperer-pro": [
        {
            "name": "world_id",
            "type": "string",
            "required": True,
            "description": "ID du monde.",
        },
        {
            "name": "ciphertext",
            "type": "string",
            "required": True,
            "description": "ciphertext to study",
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
        {
            "name": "args",
            "type": "json",
            "required": False,
            "description": 'Arguments optionnels pour l\'action (entrer comme JSON: {} ou {"key": "value"}).',
        },
    ],
}


# --- SANDBOX API Routes ---
# ... (get_sandbox_commands et execute_sandbox_command inchangés) ...
@app.route("/api/sandbox/commands")
def get_sandbox_commands():
    """Retourne la liste des commandes Kerberos avec leurs paramètres."""
    print("--- Endpoint /api/sandbox/commands reached! ---")
    try:
        all_method_names = sorted(
            list(set(KERBERIZED_METHODS + NON_KERBERIZED_METHODS))
        )

        commands_with_params = []
        for name in all_method_names:
            params = METHOD_PARAMETERS.get(name, [])
            # Attempt to get description from 'man' if not manually defined
            description = ""  # Placeholder
            # try:
            #     # Be cautious: Calling 'man' for every command can be slow
            #     # client = KerberosClient() # Instantiating client repeatedly is inefficient
            #     # man_result = client.man(name)
            #     # description = man_result.get('description', '')
            #     pass # Keep it simple for now, avoid calling 'man' here
            # except Exception as man_error:
            #     print(f"Warning: Could not fetch 'man' for {name}: {man_error}")

            commands_with_params.append(
                {
                    "name": name,
                    "kerberized": name in KERBERIZED_METHODS,
                    "params": params,
                    "description": description,  # Add description field
                }
            )

        return jsonify(commands_with_params)
    except NameError:
        print(
            "--- ERROR in get_sandbox_commands: NameError (KERBERIZED_METHODS etc. not found?) ---"
        )
        return (
            jsonify(
                {
                    "error": "Listes de commandes Kerberos non définies ou non importées côté serveur."
                }
            ),
            500,
        )
    except Exception as e:
        print(f"--- ERROR in get_sandbox_commands: {e} ---")
        import traceback

        traceback.print_exc()
        return (
            jsonify(
                {
                    "error": f"Erreur serveur inattendue lors de la récupération des commandes: {e}"
                }
            ),
            500,
        )


@app.route("/api/sandbox/execute", methods=["POST"])
def execute_sandbox_command():
    """Exécute une commande Kerberos via KerberosClient."""
    data = request.get_json()
    if not data or "method_name" not in data:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Le champ 'method_name' est requis dans le corps JSON.",
                }
            ),
            400,
        )

    method_name = data.get("method_name")
    params_dict = data.get("params", {})  # params should be a dictionary

    # Validate params_dict type
    if not isinstance(params_dict, dict):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Le champ 'params' doit être un objet JSON (dictionnaire).",
                }
            ),
            400,
        )

    print(
        f"Sandbox Execute: Tentative d'appel de '{method_name}' avec params: {params_dict}"
    )

    # --- Parameter Type Conversion/Validation (Optional but Recommended) ---
    # You could add logic here to validate/convert types based on METHOD_PARAMETERS
    # For example, convert string 'true'/'false' to boolean, string numbers to int/float.
    # For simplicity, we assume the frontend sends correctly typed JSON values for now.
    # Example (conceptual):
    # validated_params = {}
    # expected_params = METHOD_PARAMETERS.get(method_name, [])
    # for p_info in expected_params:
    #     p_name = p_info['name']
    #     p_type = p_info.get('type', 'string')
    #     p_required = p_info.get('required', False)
    #     if p_name in params_dict:
    #         value = params_dict[p_name]
    #         # Add conversion logic based on p_type (e.g., int(), bool(), etc.)
    #         validated_params[p_name] = value # Assign converted value
    #     elif p_required:
    #          return jsonify({"success": False, "error": f"Paramètre requis '{p_name}' manquant."}), 400
    # params_to_use = validated_params # Use validated/converted params

    params_to_use = params_dict  # Using raw params for now

    # --- Kerberos Client Interaction ---
    try:
        # Instantiate the client for each request (simplest approach for Flask context)
        # Ensure KerberosClient() can load credentials (e.g., from env vars)
        client = KerberosClient()
        print(f"Sandbox: Client Kerberos instancié pour '{client.username}'.")

        # Call the method using keyword arguments (**params_dict)
        result = client.call_method(method_name, **params_to_use)

        print(f"Sandbox: Exécution de '{method_name}' réussie.")
        # Return the raw result from the Kerberos API call
        return jsonify({"success": True, "result": result})

    # --- Error Handling ---
    except (
        ValueError,
        OpensslError,
        ConnectionError,
        RuntimeError,
        TypeError,
        KeyError,
    ) as e:
        # Handle known client/parameter errors
        error_message = (
            f"Erreur lors de l'exécution de '{method_name}': {type(e).__name__}: {e}"
        )
        print(f"Sandbox Error: {error_message}")
        # Determine appropriate HTTP status code
        status_code = 500  # Default to Internal Server Error
        if isinstance(e, (ValueError, TypeError, KeyError)):
            # Errors related to bad parameters or unexpected data types
            status_code = 400  # Bad Request
        elif isinstance(e, ConnectionError):
            status_code = 503  # Service Unavailable (Kerberos server might be down)
        elif isinstance(e, OpensslError):
            # Often indicates authentication/decryption issues (bad password, bad ticket)
            status_code = 401  # Unauthorized or 400 Bad Request depending on context
            error_message += " (Vérifiez mot de passe, tickets, ou arguments chiffrés)"

        # Specific check for 'method not found' which might raise AttributeError
        # Although call_method should handle it via API error, check just in case
        elif isinstance(
            e, AttributeError
        ) and f"object has no attribute '{method_name}'" in str(e):
            error_message = (
                f"Erreur: Méthode '{method_name}' non trouvée ou non implémentée."
            )
            status_code = 404  # Not Found

        return jsonify({"success": False, "error": error_message}), status_code

    except Exception as e:
        # Catch-all for truly unexpected errors
        error_message = f"Erreur serveur inattendue lors de l'exécution de '{method_name}': {type(e).__name__}: {e}"
        print(f"Sandbox Unexpected Error: {error_message}")
        import traceback

        traceback.print_exc()  # Log full stack trace for debugging
        return jsonify({"success": False, "error": error_message}), 500


# --- NOUVEAUX ENDPOINTS POUR LA TÉLÉPORTATION ---


@app.route("/api/reachable_rooms", methods=["GET"])
def get_reachable_rooms_endpoint():
    """
    Trouve les salles accessibles via DFS depuis la position actuelle dans un monde donné.
    Attend 'world_id' comme paramètre de requête.
    """
    world_id = request.args.get("world_id")
    if not world_id:
        return (
            jsonify({"success": False, "error": "Le paramètre 'world_id' est requis."}),
            400,
        )

    print(f"Recherche DFS demandée pour le monde: {world_id}")

    try:
        client = KerberosClient()
        print(f"DFS: Client Kerberos instancié pour '{client.username}'.")

        # 1. Obtenir la position actuelle
        # current_location_id = client.location(world_id=world_id)
        # if not current_location_id:
        #     raise ValueError(
        #         "Impossible d'obtenir la position de départ."
        #     )  # Raise specific error
        # print(f"DFS: Position de départ obtenue: {current_location_id}")

        # 2. Lancer le DFS
        # perform_dfs_search (get_all_rooms) retourne une liste de tuples (id, name)
        rooms_tuples = perform_dfs_search(client, world_id)
        print(
            f"DFS: Recherche terminée, {len(rooms_tuples)} salles trouvées (avec doublons potentiels d'ID si noms différents)."
        )

        # 3. Formatter le résultat en JSON [{id: ..., name: ...}]
        # Utiliser un dict pour dédoublonner par ID, en gardant le premier nom trouvé
        unique_rooms_dict = {}
        for room_id, room_name in rooms_tuples:
            if room_id and room_id not in unique_rooms_dict:
                unique_rooms_dict[room_id] = (
                    room_name if room_name else room_id
                )  # Use ID if name is missing

        reachable_rooms_list = [
            {"id": room_id, "name": name} for room_id, name in unique_rooms_dict.items()
        ]

        print(f"DFS: Résultat formaté: {len(reachable_rooms_list)} salles uniques.")
        return jsonify(reachable_rooms_list)  # Retourne directement la liste

    except (ValueError, OpensslError, ConnectionError, RuntimeError, TypeError) as e:
        error_message = f"Erreur lors de la recherche DFS pour '{world_id}': {type(e).__name__}: {e}"
        print(f"DFS Error: {error_message}")
        status_code = 500
        if isinstance(e, ConnectionError):
            status_code = 503
        if isinstance(e, OpensslError):
            status_code = 401  # Auth likely failed
        if "Location not found" in str(e) or "World not found" in str(e):
            status_code = 404  # Specific Not Found
        return jsonify({"success": False, "error": error_message}), status_code
    except Exception as e:
        error_message = f"Erreur serveur inattendue pendant DFS pour '{world_id}': {type(e).__name__}: {e}"
        print(f"DFS Unexpected Error: {error_message}")
        import traceback

        traceback.print_exc()
        return jsonify({"success": False, "error": error_message}), 500


@app.route("/api/teleport", methods=["POST"])
def teleport_endpoint():
    """
    Exécute la commande 'protagonist.move' et vérifie la nouvelle position.
    Attend { "world_id": "...", "target_room_id": "..." } dans le corps JSON.
    """
    data = request.get_json()
    if not data or "world_id" not in data or "target_room_id" not in data:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Les champs 'world_id' et 'target_room_id' sont requis.",
                }
            ),
            400,
        )

    world_id = data.get("world_id")
    target_room_id = data.get("target_room_id")

    print(f"Téléportation demandée: Monde='{world_id}', Cible='{target_room_id}'")

    try:
        client = KerberosClient()
        print(f"Teleport: Client Kerberos instancié pour '{client.username}'.")

        # 1. Exécuter le déplacement (Kerberisé)
        # client.move appelle client.call_method qui gère la kerberisation
        move_result = client.move(world_id=world_id, room=target_room_id)
        # move() retourne le résultat décrypté de l'appel API, qui peut être utile
        print(
            f"Teleport: Appel 'protagonist.move' effectué. Résultat brut: {move_result}"
        )

        # 2. Vérifier la nouvelle position
        new_location_id = client.location(world_id=world_id)
        print(f"Teleport: Vérification position après déplacement: '{new_location_id}'")

        if new_location_id == target_room_id:
            print("Teleport: Vérification réussie.")
            # 3. (Optionnel) Obtenir le nom de la nouvelle salle
            new_room_name = None
            try:
                new_room_name = client.room_name(
                    world_id=world_id, room=new_location_id
                )
                print(f"Teleport: Nom de la nouvelle salle: '{new_room_name}'")
            except Exception as name_error:
                print(
                    f"Teleport Warning: Impossible d'obtenir le nom de la nouvelle salle: {name_error}"
                )

            return jsonify(
                {
                    "success": True,
                    "message": f"Téléportation vers {new_room_name or target_room_id} réussie!",
                    "new_location": {
                        "id": new_location_id,
                        "name": new_room_name,  # Peut être None si l'appel room_name échoue
                    },
                }
            )
        else:
            error_message = f"Échec de la vérification après téléportation. Attendu: '{target_room_id}', Obtenu: '{new_location_id}'."
            print(f"Teleport Error: {error_message}")
            # Consider 409 Conflict or 500 Internal Server Error
            return jsonify({"success": False, "error": error_message}), 500

    except (ValueError, OpensslError, ConnectionError, RuntimeError, TypeError) as e:
        error_message = f"Erreur lors de la téléportation vers '{target_room_id}' dans '{world_id}': {type(e).__name__}: {e}"
        print(f"Teleport Error: {error_message}")
        status_code = 500
        if isinstance(e, ConnectionError):
            status_code = 503
        if isinstance(e, OpensslError):
            status_code = 401
        # Check if the error message indicates an invalid room or move
        if "invalid room" in str(e).lower() or "cannot move" in str(e).lower():
            status_code = 400  # Bad Request (invalid target room)
        elif "World not found" in str(e):
            status_code = 404
        return jsonify({"success": False, "error": error_message}), status_code
    except Exception as e:
        error_message = f"Erreur serveur inattendue pendant la téléportation: {type(e).__name__}: {e}"
        print(f"Teleport Unexpected Error: {error_message}")
        import traceback

        traceback.print_exc()
        return jsonify({"success": False, "error": error_message}), 500


# --- FIN NOUVEAUX ENDPOINTS ---


# --- Route pour servir l'interface HTML ---
@app.route("/")
def index():
    """Sert le fichier HTML principal."""
    return render_template("index.html")


# --- Démarrage ---
if __name__ == "__main__":
    print("*" * 50)
    print(f"Démarrage Serveur API Kerberos Data")
    # Use absolute paths for clarity in logs
    db_abs_path = os.path.abspath(DATABASE)
    update_script_abs_path = os.path.abspath(UPDATE_SCRIPT_PATH)
    print(f"DB: {db_abs_path}")
    print(
        f"Script Update: {update_script_abs_path if os.path.exists(update_script_abs_path) else 'NON TROUVÉ'}"
    )
    try:
        # Verify Kerberos methods and parameters definition are loaded
        print(
            f"Méthodes Kerberos: {len(KERBERIZED_METHODS)} Kerb, {len(NON_KERBERIZED_METHODS)} Non-Kerb"
        )
        print(f"Paramètres définis pour {len(METHOD_PARAMETERS)} méthodes.")
        # Verify DFS function import
        if "perform_dfs_search" in globals():
            print("Fonction DFS importée avec succès.")
        else:
            print("AVERTISSEMENT: Fonction DFS non trouvée.")
    except NameError as ne:
        print(f"AVERTISSEMENT: Définitions Kerberos ou DFS non chargées: {ne}")
    except Exception as e:
        print(f"Erreur lors de la vérification initiale: {e}")

    host = "0.0.0.0"
    port = 5002
    print(
        f"Interface disponible: http://127.0.0.1:{port} (ou http://<votre_ip>:{port})"
    )
    print("*" * 50)
    # debug=True enables auto-reload and debugger (NOT for production)
    # host='0.0.0.0' makes the server accessible on your network
    # use_reloader=False can sometimes help with debugging subprocess or threading issues if they arise
    app.run(debug=True, host=host, port=port, use_reloader=True)

# Clean up sys.path if it was modified
if PARENT_DIR in sys.path:
    sys.path.remove(PARENT_DIR)
