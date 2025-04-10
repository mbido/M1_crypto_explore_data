# -*- coding: utf-8 -*-
import json
import time
from kerberos import (
    KerberosClient,
    jprint,
)  # Assurez-vous que KerberosClient est bien importé
from maps import (
    NAME_GRAPH,
)  # Importe votre graphe statique (si vous l'utilisez toujours comme base/fallback)
import traceback  # Importé pour la gestion d'erreurs

# ==============================================================================
# PHASE 1 : Construction du Graphe des Noms (Modifiée)
# ==============================================================================


def _build_name_graph_recursive(
    client: KerberosClient,
    world_id: str,
    current_id: str,
    name_graph: dict,
    visited_ids_build: set,
    id_to_name_cache_build: dict,
    api_calls_build: dict,  # Ajout pour compter les appels API
):
    """Helper récursif pour construire le graphe des noms en utilisant room.directions."""
    if not current_id or current_id in visited_ids_build:
        return

    visited_ids_build.add(current_id)

    # Obtenir le nom, utiliser le cache si possible
    if current_id not in id_to_name_cache_build:
        try:
            api_calls_build["room_name"] = api_calls_build.get("room_name", 0) + 1
            current_name = client.room_name(world_id, current_id)
            id_to_name_cache_build[current_id] = current_name
        except Exception as e:
            print(f"BUILD_GRAPH: Error getting name for {current_id}: {e}")
            return  # Ne pas continuer si on ne peut pas obtenir le nom
    else:
        current_name = id_to_name_cache_build[current_id]

    # Initialiser l'entrée dans le graphe si elle n'existe pas
    if current_name not in name_graph:
        name_graph[current_name] = {}
        print(f"NEW ROOM DISCOVERED : {current_name} (ID: {current_id})")

    # --- NOUVELLE LOGIQUE : Utiliser room.directions ---
    valid_directions = []
    try:
        # Appel API Kerberisé pour obtenir les directions valides
        api_calls_build["room.directions"] = (
            api_calls_build.get("room.directions", 0) + 1
        )
        # Utilise room_directions() pour plus de clarté si vous l'ajoutez à KerberosClient, sinon call_method
        directions_result = client.room_directions(world_id=world_id, room=current_id)

        if isinstance(directions_result, list):
            valid_directions = directions_result
        else:
            print(
                f"BUILD_GRAPH: Warning - room.directions for {current_id} did not return a list. Got: {type(directions_result)} - Value: {directions_result}"
            )

    except Exception as e:
        print(f"BUILD_GRAPH: Error calling room.directions for {current_id}: {e}")
        # Peut-être un monde inactif ou une erreur API. On continue sans explorer depuis ici.

    # --- FIN NOUVELLE LOGIQUE ---

    # Explorer les voisins VALIDES uniquement
    for direction in valid_directions:

        neighbor_id = None
        try:
            # Appel API pour trouver l'ID du voisin (Kerberisé)
            api_calls_build["room.neighbor"] = (
                api_calls_build.get("room.neighbor", 0) + 1
            )
            neighbor_id = client.room_neighbor(  # Utilisation de la méthode spécifique
                world_id=world_id,
                room=current_id,
                direction=direction,
            )

            # room_neighbor retourne directement l'ID ou None

            if neighbor_id:
                # Obtenir le nom du voisin (potentiellement via cache)
                if neighbor_id not in id_to_name_cache_build:
                    try:
                        api_calls_build["room_name"] = (
                            api_calls_build.get("room_name", 0) + 1
                        )
                        neighbor_name = client.room_name(world_id, neighbor_id)
                        id_to_name_cache_build[neighbor_id] = neighbor_name

                    except Exception as e:
                        print(
                            f"BUILD_GRAPH: Error getting name for neighbor {neighbor_id} (from {current_id} via {direction}): {e}"
                        )
                        continue  # Ne pas ajouter ce voisin si son nom est inconnu
                else:
                    neighbor_name = id_to_name_cache_build[neighbor_id]

                # Ajouter la connexion au graphe des noms si elle n'existe pas ou est différente
                # Utilisation de .get() pour éviter un KeyError potentiel si current_name vient juste d'être ajouté
                if (
                    direction not in name_graph.get(current_name, {})
                    or name_graph[current_name][direction] != neighbor_name
                ):
                    name_graph[current_name][direction] = neighbor_name

                # Appel récursif si le voisin n'a pas été visité par son ID
                if neighbor_id not in visited_ids_build:
                    _build_name_graph_recursive(
                        client,
                        world_id,
                        neighbor_id,
                        name_graph,
                        visited_ids_build,
                        id_to_name_cache_build,
                        api_calls_build,  # Passer le compteur
                    )
            # else: Si neighbor_id est None, l'API n'a pas trouvé de voisin dans cette direction (peut arriver même si listée)

        except Exception as e:
            # Gère les erreurs spécifiques à l'appel room.neighbor pour cette direction
            print(
                f"BUILD_GRAPH: Error getting neighbor {direction} from {current_id} (after directions check): {e}"
            )
            # On continue avec la prochaine direction valide


def build_name_graph(client: KerberosClient, world_id: str) -> dict:
    """
    Construit un graphe des connexions entre salles basé sur leurs noms,
    en utilisant room.directions pour optimiser.
    """
    print(f"\n--- Building Optimized Name Graph using World: {world_id} ---")
    start_time = time.time()
    name_graph = {}
    visited_ids_build = set()
    id_to_name_cache_build = {}  # Cache ID -> Nom pour cette construction
    # Initialisation du compteur d'appels API pour la construction
    api_calls_build = {
        "room.directions": 0,
        "room.neighbor": 0,
        "room_name": 0,
        "location": 0,
    }

    try:
        api_calls_build["location"] += 1
        start_location_id = client.location(world_id=world_id)
        if not start_location_id:
            print("BUILD_GRAPH: Error: Could not get starting location.")
            return {}

        print(f"BUILD_GRAPH: Starting from location ID: {start_location_id}")
        # Lancer la récursion avec le compteur d'appels
        _build_name_graph_recursive(
            client,
            world_id,
            start_location_id,
            name_graph,
            visited_ids_build,
            id_to_name_cache_build,
            api_calls_build,  # Passer le compteur
        )

    except Exception as e:
        print(f"BUILD_GRAPH: An error occurred during graph building: {e}")
        traceback.print_exc()

    end_time = time.time()
    print(f"--- Optimized Name Graph Building Complete ({len(name_graph)} nodes) ---")
    # Afficher le compte des appels API de la phase de construction
    print(f"API Calls (Build Phase): {api_calls_build}")
    print(f"Time taken (Build Phase): {end_time - start_time:.2f} seconds")
    return name_graph


# ==============================================================================
# GRAPHE PRÉCALCULÉ (à remplir après l'exécution de build_name_graph)
# ==============================================================================

# METTEZ ICI LE RÉSULTAT DE L'APPEL À build_name_graph UNE FOIS QUE VOUS L'AUREZ EXÉCUTÉ
# ou laissez l'import depuis maps.py si NAME_GRAPH y est défini
# NAME_GRAPH = { ... } # Résultat de build_name_graph

# ==============================================================================
# PHASE 2 : Exploration optimisée utilisant le Graphe des Noms (Inchangée)
# ==============================================================================


def get_all_rooms(
    client: KerberosClient, world_id: str, name_graph: dict = NAME_GRAPH
) -> list[tuple[str, str]]:
    """
    Trouve toutes les salles accessibles en utilisant le graphe de noms précalculé
    pour minimiser les appels API. (Fonction globalement inchangée)
    """
    print(
        f"\n--- Optimized Discovery for World: {world_id} using precomputed graph ---"
    )
    start_time = time.time()
    if not name_graph:
        print("OPTIMIZED: Error - Name graph is empty or not provided. Cannot proceed.")
        return []

    result_rooms = []
    name_to_id_map = {}
    visited_names = set()
    queue = []
    # Compteur séparé pour la phase de découverte
    api_calls_discovery = {"location": 0, "room_name": 0, "neighbor": 0}

    try:
        api_calls_discovery["location"] += 1
        start_id = client.location(world_id=world_id)
        if not start_id:
            print("OPTIMIZED: Error: Could not get starting location.")
            return []

        api_calls_discovery["room_name"] += 1
        start_name = client.room_name(world_id, start_id)

        if start_name not in name_graph:
            print(
                f"OPTIMIZED: Warning - Start room name '{start_name}' (ID: {start_id}) not found in the precomputed graph. Adding only this room."
            )
            result_rooms.append((start_id, start_name))
            # Ne pas ajouter à la file si le nom n'est pas dans le graphe
        else:
            print(f"OPTIMIZED: Starting from '{start_name}' (ID: {start_id})")
            name_to_id_map[start_name] = start_id
            visited_names.add(start_name)
            result_rooms.append((start_id, start_name))
            queue.append(start_name)

        while queue:
            current_name = queue.pop(0)
            # Vérifier si current_name existe dans name_to_id_map (sécurité)
            if current_name not in name_to_id_map:
                print(
                    f"OPTIMIZED: Error - Name '{current_name}' in queue but not in name_to_id_map. Skipping."
                )
                continue
            current_id = name_to_id_map[current_name]

            # Consulter les voisins connus dans le graphe précalculé
            neighbors_in_graph = name_graph.get(current_name, {})

            for direction, neighbor_name in neighbors_in_graph.items():
                if neighbor_name in visited_names:
                    continue  # Déjà traité par son nom dans ce monde

                # Vérifier si le nom du voisin existe comme clé dans le graphe (cohérence)
                if neighbor_name not in name_graph:
                    print(
                        f"OPTIMIZED: Warning - Neighbor name '{neighbor_name}' (linked from '{current_name}') not found as a node in the graph. Skipping."
                    )
                    continue

                neighbor_id = None
                try:
                    # Appel API ciblé pour obtenir l'ID du voisin dans ce monde spécifique
                    api_calls_discovery["neighbor"] += 1
                    neighbor_id = client.room_neighbor(
                        world_id=world_id, room=current_id, direction=direction
                    )

                    if neighbor_id:
                        # Optionnel: Vérifier la correspondance du nom (peut coûter cher en appels room_name)
                        # try:
                        #     api_calls_discovery['room_name'] += 1
                        #     actual_neighbor_name = client.room_name(world_id, neighbor_id)
                        #     if actual_neighbor_name != neighbor_name:
                        #         print(f"OPTIMIZED: WARNING! Name mismatch for neighbor {direction} of {current_id} / {current_name}.")
                        #         print(f"  Graph expected '{neighbor_name}', API returned ID {neighbor_id} with name '{actual_neighbor_name}'")
                        #         # Stratégie : faire confiance au graphe pour la navigation, mais loguer l'alerte.
                        # except Exception as name_err:
                        #      print(f"OPTIMIZED: Error verifying neighbor name for ID {neighbor_id}: {name_err}")

                        # Ajouter le voisin trouvé à la liste et à la file d'attente
                        if (
                            neighbor_name not in visited_names
                        ):  # Double vérification avant ajout
                            name_to_id_map[neighbor_name] = neighbor_id
                            visited_names.add(neighbor_name)
                            result_rooms.append((neighbor_id, neighbor_name))
                            queue.append(neighbor_name)
                            # print(f"  + Found and added room: {neighbor_name} ({neighbor_id}) via {direction}") # Debug

                    else:
                        # Le graphe indiquait un voisin, mais l'API dit non.
                        # Cela peut arriver si le monde exploré est différent de celui utilisé pour construire le graphe,
                        # ou si le monde a changé.
                        print(
                            f"OPTIMIZED: Warning - Graph expected neighbor '{neighbor_name}' ({direction} from '{current_name}'), but API returned no neighbor in world {world_id}."
                        )

                except Exception as e:
                    # Gère les erreurs lors de l'appel à room_neighbor pendant la découverte
                    print(
                        f"OPTIMIZED: Error getting neighbor {direction} from {current_id} (expected name '{neighbor_name}'): {e}"
                    )
                    # Ne pas ajouter ce voisin et continuer

    except Exception as e:
        print(f"OPTIMIZED: An error occurred during optimized discovery: {e}")
        traceback.print_exc()

    end_time = time.time()
    # Utiliser len(visited_names) peut être plus précis pour le nombre de salles uniques découvertes
    print(
        f"--- Optimized Discovery Complete ({len(visited_names)} unique rooms visited) ---"
    )
    print(f"Total room entries in result list: {len(result_rooms)}")
    print(f"API Calls (Discovery Phase): {api_calls_discovery}")
    print(f"Time taken (Discovery Phase): {end_time - start_time:.2f} seconds")
    return result_rooms


if __name__ == "__main__":
    client = KerberosClient()
    # Choisissez un world_id actif pour construire/tester
    world_for_graph_build = "v"  # Mettez un ID valide et actif

    # --- Étape 1: Construire le graphe optimisé ---
    print("Building graph...")
    # Cette fonction affiche maintenant ses propres compteurs d'API
    optimized_graph = build_name_graph(client, world_for_graph_build)
    jprint(optimized_graph)
