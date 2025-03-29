# -*- coding: utf-8 -*-
import json
import time
from kerberos import KerberosClient, jprint
from maps import NAME_GRAPH


DIRS = [
    "N",
    "W",
    "S",
    "E",
    "OUT",
    "IN",
    "UP",
    "DOWN",
    "EVE",
    "ISIR",
    "ZAMANSKI",
    "TUMULUS",
    "TIPI",
    "PATIO",
    "SALLE",
    "TME",
    "TÉLÉPORTEUR",
]
OPPOSITE_DIRS = {
    "N": "S",
    "S": "N",
    "W": "E",
    "E": "W",
    "UP": "DOWN",
    "DOWN": "UP",
    "IN": "OUT",
    "OUT": "IN",
}

# ==============================================================================
# PHASE 1 : Construction du Graphe des Noms (à exécuter une fois)
# ==============================================================================


def _build_name_graph_recursive(
    client: KerberosClient,
    world_id: str,
    current_id: str,
    entry_direction: str | None,
    name_graph: dict,
    visited_ids_build: set,
    id_to_name_cache_build: dict,
):
    """Helper récursif pour construire le graphe des noms."""
    if not current_id or current_id in visited_ids_build:
        return

    visited_ids_build.add(current_id)

    # Obtenir le nom, utiliser le cache si possible
    if current_id not in id_to_name_cache_build:
        try:
            current_name = client.room_name(world_id, current_id)
            id_to_name_cache_build[current_id] = current_name
        except Exception as e:
            print(f"BUILD_GRAPH: Error getting name for {current_id}: {e}")
            # Ne pas continuer si on ne peut pas obtenir le nom
            return
    else:
        current_name = id_to_name_cache_build[current_id]

    # Initialiser l'entrée dans le graphe si elle n'existe pas
    if current_name not in name_graph:
        name_graph[current_name] = {}
        print(f"NEW ROOM : {current_name}")

    # Explorer les voisins
    for direction in DIRS:
        # if entry_direction and direction == OPPOSITE_DIRS.get(entry_direction):
        #     continue  # Optimisation: ne pas revenir en arrière immédiatement

        neighbor_id = None
        try:
            # Appel API pour trouver le voisin
            neighbor_data = client.call_method(
                "room.neighbor",
                world_id=world_id,
                room=current_id,
                direction=direction,
            )
            neighbor_id = (
                neighbor_data.get("result") if isinstance(neighbor_data, dict) else None
            )

            if neighbor_id:
                # Obtenir le nom du voisin (potentiellement via cache)
                if neighbor_id not in id_to_name_cache_build:
                    try:
                        neighbor_name = client.room_name(world_id, neighbor_id)
                        id_to_name_cache_build[neighbor_id] = neighbor_name
                    except Exception as e:
                        print(
                            f"BUILD_GRAPH: Error getting name for neighbor {neighbor_id}: {e}"
                        )
                        continue  # Ne pas ajouter ce voisin si son nom est inconnu
                else:
                    neighbor_name = id_to_name_cache_build[neighbor_id]

                # Ajouter la connexion au graphe des noms
                if (
                    direction not in name_graph[current_name]
                    or name_graph[current_name][direction] != neighbor_name
                ):
                    name_graph[current_name][direction] = neighbor_name
                    # print(f"  -> Added link: {current_name} --{direction}--> {neighbor_name}") # Debug

                # Appel récursif si le voisin n'a pas été visité par son ID
                if neighbor_id not in visited_ids_build:
                    _build_name_graph_recursive(
                        client,
                        world_id,
                        neighbor_id,
                        direction,
                        name_graph,
                        visited_ids_build,
                        id_to_name_cache_build,
                    )

        except Exception as e:
            print(
                f"BUILD_GRAPH: Error getting neighbor {direction} from {current_id}: {e}"
            )


def build_name_graph(client: KerberosClient, world_id: str) -> dict:
    """
    Construit un graphe des connexions entre salles basé sur leurs noms.
    Ne doit être exécuté qu'une seule fois sur un monde de référence.
    """
    print(f"\n--- Building Name Graph using World: {world_id} ---")
    start_time = time.time()
    name_graph = {}
    visited_ids_build = set()
    id_to_name_cache_build = {}  # Cache ID -> Nom pour cette construction

    try:
        start_location_id = client.location(world_id=world_id)
        if not start_location_id:
            print("BUILD_GRAPH: Error: Could not get starting location.")
            return {}

        print(f"BUILD_GRAPH: Starting from location ID: {start_location_id}")
        _build_name_graph_recursive(
            client,
            world_id,
            start_location_id,
            None,
            name_graph,
            visited_ids_build,
            id_to_name_cache_build,
        )

    except Exception as e:
        print(f"BUILD_GRAPH: An error occurred during graph building: {e}")
        import traceback

        traceback.print_exc()

    end_time = time.time()
    print(f"--- Name Graph Building Complete ({len(name_graph)} nodes) ---")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
    return name_graph


# ==============================================================================
# GRAPHE PRÉCALCULÉ (à remplir après l'exécution de build_name_graph)
# ==============================================================================

# METTEZ ICI LE RÉSULTAT DE L'APPEL À build_name_graph UNE FOIS QUE VOUS L'AUREZ EXÉCUTÉ
# Exemple basé sur les Dummies :
# NAME_GRAPH = {
#     "Start Room (Dummy)": {"N": "North Room (Dummy)", "E": "East Room (Dummy)"},
#     "North Room (Dummy)": {"N": "North North Room (Dummy)", "S": "Start Room (Dummy)"},
#     "East Room (Dummy)": {"W": "Start Room (Dummy)"},
#     "North North Room (Dummy)": {"S": "North Room (Dummy)"},
# }

# ==============================================================================
# PHASE 2 : Exploration optimisée utilisant le Graphe des Noms
# ==============================================================================


def get_all_rooms(
    client: KerberosClient, world_id: str, name_graph: dict = NAME_GRAPH
) -> list[tuple[str, str]]:
    """
    Trouve toutes les salles accessibles en utilisant le graphe de noms précalculé
    pour minimiser les appels API.
    """
    print(f"\n--- Optimized Discovery for World: {world_id} ---")
    start_time = time.time()
    if not name_graph:
        print("OPTIMIZED: Error - Name graph is empty. Cannot proceed.")
        return []

    result_rooms = []  # Liste pour stocker les tuples (id, name) trouvés
    name_to_id_map = {}  # Cache Nom -> ID pour CE monde
    visited_names = set()  # Noms des salles déjà traitées pour CE monde
    queue = []  # File pour l'exploration (BFS sur le graphe de noms)

    api_calls = {"location": 0, "room_name": 0, "neighbor": 0}

    try:
        # 1. Obtenir le point de départ
        api_calls["location"] += 1
        start_id = client.location(world_id=world_id)
        if not start_id:
            print("OPTIMIZED: Error: Could not get starting location.")
            return []

        # 2. Obtenir le nom de départ
        api_calls["room_name"] += 1
        start_name = client.room_name(world_id, start_id)
        print(f"starting room : {start_name}")

        # 3. Initialiser l'exploration
        if start_name not in name_graph:
            print(
                f"OPTIMIZED: Warning - Start room name '{start_name}' not found in the precomputed graph."
            )
            # On ajoute quand même la salle de départ mais on ne pourra pas explorer plus loin via le graphe
            result_rooms.append((start_id, start_name))
        else:
            print(f"OPTIMIZED: Starting from '{start_name}' (ID: {start_id})")
            name_to_id_map[start_name] = start_id
            visited_names.add(start_name)
            result_rooms.append((start_id, start_name))
            queue.append(start_name)  # On met le nom dans la file

        # 4. Exploration BFS guidée par le graphe de noms
        while queue:
            current_name = queue.pop(0)
            current_id = name_to_id_map[current_name]

            # Consulter les voisins connus dans le graphe de noms
            neighbors_in_graph = name_graph.get(current_name, {})
            # print(f"  Exploring neighbors of '{current_name}' (ID: {current_id})") # Debug

            for direction, neighbor_name in neighbors_in_graph.items():
                # Si on a déjà traité ce NOM de voisin pour ce monde, on passe
                if neighbor_name in visited_names:
                    # print(f"    - Neighbor {direction}: '{neighbor_name}' (already processed)") # Debug
                    continue

                # Si le nom du voisin n'est pas dans le graphe principal (peu probable mais sécurité)
                if neighbor_name not in name_graph:
                    print(
                        f"OPTIMIZED: Warning - Neighbor name '{neighbor_name}' found via graph from '{current_name}' but not present as a node in the graph itself. Skipping."
                    )
                    continue

                # On doit trouver l'ID de ce voisin DANS CE MONDE
                # C'est ici qu'on fait l'appel API crucial mais ciblé
                neighbor_id = None
                try:
                    # print(f"    - Checking neighbor {direction}: '{neighbor_name}'. Making API call...") # Debug
                    api_calls["neighbor"] += 1
                    neighbor_data = client.room_neighbor(
                        world_id=world_id,
                        room=current_id,
                        direction=direction,
                    )
                    neighbor_id = (
                        neighbor_data.get("result")
                        if isinstance(neighbor_data, dict)
                        else None
                    )

                    if neighbor_id:
                        # Vérification optionnelle mais recommandée : le nom correspond-il ?
                        # api_calls['room_name'] += 1 # Uncomment if doing verification
                        # actual_neighbor_name = client.room_name(world_id, neighbor_id)
                        # if actual_neighbor_name != neighbor_name:
                        #     print(f"OPTIMIZED: WARNING! Name mismatch for neighbor {direction} of {current_id}.")
                        #     print(f"  Graph expected '{neighbor_name}', API returned ID {neighbor_id} with name '{actual_neighbor_name}'")
                        #     # Décider quoi faire : ignorer, utiliser le nom réel, etc.
                        #     # Pour l'instant, on se fie au graphe et on ajoute, mais on marque comme visité
                        #     # neighbor_name = actual_neighbor_name # Ou utiliser le nom réel trouvé

                        # On a trouvé l'ID !
                        # print(f"      Found ID: {neighbor_id}") # Debug
                        name_to_id_map[neighbor_name] = neighbor_id
                        visited_names.add(neighbor_name)
                        result_rooms.append((neighbor_id, neighbor_name))
                        queue.append(
                            neighbor_name
                        )  # Ajouter le nom à la file pour exploration future
                        print(f"room found: {neighbor_name}")

                    else:
                        # Le graphe indiquait un voisin, mais l'API dit non. Incohérence possible.
                        print(
                            f"OPTIMIZED: Warning - Graph expected neighbor '{neighbor_name}' in direction {direction} from '{current_name}' (ID: {current_id}), but API returned no neighbor."
                        )

                except Exception as e:
                    print(
                        f"OPTIMIZED: Error getting neighbor {direction} from {current_id} (expected name '{neighbor_name}'): {e}"
                    )
                    # Ne pas ajouter ce voisin si l'API échoue

    except Exception as e:
        print(f"OPTIMIZED: An error occurred during optimized discovery: {e}")
        import traceback

        traceback.print_exc()

    end_time = time.time()
    print(f"--- Optimized Discovery Complete ({len(result_rooms)} rooms found) ---")
    print(
        f"API Calls: Location={api_calls['location']}, RoomName={api_calls['room_name']}, Neighbor={api_calls['neighbor']}"
    )
    print(f"Time taken: {end_time - start_time:.2f} seconds")
    return result_rooms


if __name__ == "__main__":
    client = KerberosClient()
    world = "ed28bf52fd0b6bc2178cb9ae81c199c9"
    graph = build_name_graph(client, world)
    jprint(graph)
    print(len(graph))
    # rooms = get_all_rooms(client, world)
    # jprint(rooms)
