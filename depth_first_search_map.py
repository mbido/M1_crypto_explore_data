# -*- coding: utf-8 -*-
# Assuming kerberos.py is in the same directory or Python path
try:
    from kerberos import (
        KerberosClient,
        jprint,
    )  # Make sure jprint is defined or remove if not needed
except ImportError:
    print(
        "Warning: Could not import KerberosClient or jprint. Ensure kerberos.py is accessible."
    )

    # Define dummy classes/functions if needed for script to load without kerberos
    class KerberosClient:
        def __init__(self):
            self.username = (
                "dummy_user"  # Add a dummy username for the main block print
            )

        def location(self, world_id):
            print(f"Dummy: Getting start location for world {world_id}")
            return "start_room_dummy"  # Return a dummy start room

        def room_name(self, world_id, room_id):
            print(f"Dummy: Getting name for room {room_id}")
            if room_id == "start_room_dummy":
                return "Start Room (Dummy)"
            elif room_id == "neighbor_N":
                return "North Room (Dummy)"
            return f"Room {room_id} (Dummy)"

        def call_method(self, method, **kwargs):
            print(f"Dummy: Calling method {method} with args {kwargs}")
            # Simulate some neighbors for dummy testing
            world = kwargs.get("world_id")
            room = kwargs.get("room")
            direction = kwargs.get("direction")
            if room == "start_room_dummy":
                if direction == "N":
                    return {"result": "neighbor_N"}
                if direction == "E":
                    return {"result": "neighbor_E"}
            if room == "neighbor_N":
                if direction == "N":
                    return {
                        "result": "neighbor_NN"
                    }  # Simulate another room further north
                # When coming from start_room_dummy (via 'N'), we'd normally check 'S'
                # but the modified logic should skip it. If called without entry_dir logic,
                # this would return to start:
                if direction == "S":
                    return {"result": "start_room_dummy"}
            return {"result": None}  # Default: no neighbor

    def jprint(x):
        import json

        print(json.dumps(x, indent=2))


DIRS = ["N", "W", "S", "E", "OUT", "IN", "UP", "DOWN"]
# Dictionnaire pour trouver rapidement la direction opposée
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


def get_all_rooms(
    client: KerberosClient,
    world_id,
    current_location_id,
    entry_direction=None,  # Nouvelle information: la direction utilisée pour ARRIVER ici
    visited_locations=None,
    room_cache=None,
):
    """
    Performs a Depth First Search to find all reachable rooms from a starting location,
    avoiding immediate backtracking.

    Args:
        client: An initialized KerberosClient instance.
        world_id: The ID of the world to search in.
        current_location_id: The ID of the current room.
        entry_direction: The direction used to enter the current_location_id (e.g., 'N').
                         None for the starting room.
        visited_locations: A set to keep track of visited room IDs (passed recursively).
        room_cache: A list to accumulate (id, name) tuples (passed recursively).

    Returns:
        A list of tuples, where each tuple is (room_id, room_name).
        Returns an empty list on error or if client/world/location is invalid.
    """
    if visited_locations is None:
        visited_locations = set()
    if room_cache is None:
        room_cache = []

    # Cas de base : emplacement invalide ou déjà visité entièrement
    # Note: Même si on arrive par un chemin différent, si la salle a déjà été
    # entièrement explorée (ajoutée à visited_locations), on s'arrête.
    if not current_location_id or current_location_id in visited_locations:
        return room_cache

    visited_locations.add(current_location_id)

    # Obtenir le nom de la salle (gérer les erreurs potentielles)
    room_name = None
    try:
        room_name = client.room_name(world_id, current_location_id)
        # print(f"DFS: Visiting {current_location_id} - Name: {room_name} (Arrived via: {entry_direction})") # Debug print
    except Exception as e:
        print(
            f"Warning: Failed to get name for room {current_location_id} in world {world_id}: {e}"
        )
        room_name = current_location_id  # Utiliser l'ID comme nom de secours

    # Ajouter la salle actuelle (ID, Nom) au cache
    room_cache.append((current_location_id, room_name))

    # Explorer les voisins
    for direction in DIRS:
        # --- OPTIMISATION : Éviter le retour immédiat ---
        # Si une direction d'entrée est connue et que la direction actuelle est son opposée,
        # on saute cette direction car on vient de là.
        if entry_direction and direction == OPPOSITE_DIRS.get(entry_direction):
            # print(
            #     f"  -> Skipping opposite direction {direction} (came from {entry_direction})"
            # )  # Debug print
            continue
        # --- Fin de l'optimisation ---

        neighbor_id = None
        try:
            neighbor_data = client.call_method(
                "room.neighbor",
                world_id=world_id,
                room=current_location_id,
                direction=direction,
            )
            neighbor_id = (
                neighbor_data.get("result") if isinstance(neighbor_data, dict) else None
            )

            if neighbor_id and neighbor_id not in visited_locations:
                # print(f"  -> Found neighbor {direction}: {neighbor_id}. Exploring...") # Debug print
                # Appel récursif :
                # - Passer le même ensemble visited_locations et la même liste room_cache
                # - Indiquer que pour atteindre neighbor_id, on a utilisé 'direction'
                get_all_rooms(
                    client,
                    world_id,
                    neighbor_id,
                    direction,  # La direction actuelle devient la direction d'entrée pour le voisin
                    visited_locations,
                    room_cache,
                )
            # elif neighbor_id:
            #    print(f"  -> Neighbor {direction}: {neighbor_id} (already visited)") # Debug print
            # else:
            #    print(f"  -> No neighbor in direction {direction}") # Debug print

        except Exception as e:
            print(
                f"Error getting neighbor {direction} from {current_location_id} in {world_id}: {e}"
            )
            # Continuer le DFS même si un voisin échoue

    # Le résultat final s'accumule dans room_cache à travers tous les appels récursifs
    return room_cache


if __name__ == "__main__":
    print("Running DFS script as main...")
    # Remplacez par un ID de monde valide auquel vous avez accès
    test_world_id = (
        "c89e87be37e427e86e9720fc6329bd6f"  # Remplacez par votre ID de monde réel
        # "dummy_world" # Utilisez ceci si vous testez avec les classes factices
    )

    try:
        k_client = KerberosClient()  # Assumes default credentials work or uses dummy
        print(f"Initialized client for user: {k_client.username}")

        start_location = k_client.location(world_id=test_world_id)
        if not start_location:
            print(f"Error: Could not get starting location for world {test_world_id}")
        else:
            print(
                f"Starting DFS from location: {start_location} in world {test_world_id}"
            )
            # Appeler la fonction correctement, sans spécifier entry_direction pour le début
            all_found_rooms = get_all_rooms(k_client, test_world_id, start_location)

            print("\n--- DFS Result ---")
            if all_found_rooms:
                # L'utilisation de visited_locations empêche déjà les doublons DANS la liste finale
                # car une salle visitée n'est pas ré-explorée.
                print(f"Found {len(all_found_rooms)} unique rooms.")
                print("Rooms (ID: Name):")
                # Trier pour une sortie cohérente
                sorted_rooms = sorted(all_found_rooms, key=lambda x: x[0])
                for room_id, name in sorted_rooms:
                    # Utiliser une f-string pour un formatage plus propre
                    print(f"  - {room_id}: {name}")
                # jprint(sorted_rooms) # Utiliser jprint si disponible et désiré
            else:
                print("No rooms found or DFS failed.")
            print("------------------")

    except Exception as main_err:
        print(f"\nAn error occurred during direct script execution: {main_err}")
        import traceback

        traceback.print_exc()
