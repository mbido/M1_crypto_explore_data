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
        pass

    def jprint(x):
        print(x)


DIRS = ["N", "W", "S", "E", "OUT", "IN", "UP", "DOWN"]

# Keep track globally ONLY if run as main script, otherwise manage in calling function
# MEM_LOCATIONS = set() # Better to manage visited set within the function call


def get_all_rooms(
    client: KerberosClient,
    world_id,
    current_location_id,
    visited_locations=None,
    room_cache=None,
):
    """
    Performs a Depth First Search to find all reachable rooms from a starting location.

    Args:
        client: An initialized KerberosClient instance.
        world_id: The ID of the world to search in.
        current_location_id: The ID of the starting room.
        visited_locations: A set to keep track of visited room IDs (passed recursively).
        room_cache: A list to accumulate (id, name) tuples (passed recursively).

    Returns:
        A list of tuples, where each tuple is (room_id, room_name).
        Returns an empty list on error or if client/world/location is invalid.
    """
    if visited_locations is None:
        visited_locations = set()
    if room_cache is None:
        room_cache = []  # Store results here

    if not current_location_id or current_location_id in visited_locations:
        return room_cache  # Base case: invalid location or already visited

    visited_locations.add(current_location_id)

    # Get room name (handle potential errors)
    room_name = None
    try:
        room_name = client.room_name(world_id, current_location_id)
        # print(f"DFS: Visiting {current_location_id} - Name: {room_name}") # Debug print
    except Exception as e:
        # Log error but continue DFS, use ID as name if lookup fails
        print(
            f"Warning: Failed to get name for room {current_location_id} in world {world_id}: {e}"
        )
        room_name = current_location_id  # Use ID as fallback name

    # Add current room (ID, Name) to the cache
    room_cache.append((current_location_id, room_name))

    # Explore neighbors
    for direction in DIRS:
        neighbor_id = None
        try:
            # room_neighbor returns a dict like {'result': 'neighbor_id'} or {'result': None}
            neighbor_data = client.call_method(
                "room.neighbor",  # Nom de la méthode API
                world_id=world_id,
                room=current_location_id,
                direction=direction,
            )
            neighbor_id = (
                neighbor_data.get("result") if isinstance(neighbor_data, dict) else None
            )

            if neighbor_id and neighbor_id not in visited_locations:
                # print(f"  -> Found neighbor {direction}: {neighbor_id}") # Debug print
                # Recursive call - IMPORTANT: pass the *same* visited_locations set and room_cache list
                get_all_rooms(
                    client, world_id, neighbor_id, visited_locations, room_cache
                )
            # else:
            # if neighbor_id: print(f"  -> Neighbor {direction}: {neighbor_id} (already visited)")

        except Exception as e:
            print(
                f"Error getting neighbor {direction} from {current_location_id} in {world_id}: {e}"
            )
            # Continue DFS even if one neighbor fails

    # The final result is accumulated in room_cache across all recursive calls
    return room_cache


if __name__ == "__main__":
    # This block is for testing the script directly
    print("Running DFS script as main...")
    # Replace with a valid world ID you have access to
    # test_world_id = "a706c5eaa0bee601175b5fbe37a49573" # Example, use a real one
    test_world_id = (
        "c89e87be37e427e86e9720fc6329bd6f"  # Replace with your actual test world ID
    )

    try:
        k_client = KerberosClient()  # Assumes default credentials work
        print(f"Initialized client for user: {k_client.username}")

        start_location = k_client.location(world_id=test_world_id)
        if not start_location:
            print(f"Error: Could not get starting location for world {test_world_id}")
        else:
            print(
                f"Starting DFS from location: {start_location} in world {test_world_id}"
            )
            # Call the function correctly, initializing visited set and cache
            all_found_rooms = get_all_rooms(k_client, test_world_id, start_location)

            print("\n--- DFS Result ---")
            if all_found_rooms:
                print(
                    f"Found {len(all_found_rooms)} room entries (may include duplicates if recursion visited differently)."
                )
                # Optional: Print unique rooms found
                unique_rooms = {room[0]: room[1] for room in all_found_rooms}
                print(f"Found {len(unique_rooms)} unique room IDs.")
                print("Unique Rooms (ID: Name):")
                for room_id, name in sorted(unique_rooms.items()):
                    print(f"  - {room_id}: {name}")
                # jprint(all_found_rooms) # Use jprint if available and desired
            else:
                print("No rooms found or DFS failed.")
            print("------------------")

    except Exception as main_err:
        print(f"\nAn error occurred during direct script execution: {main_err}")
        import traceback

        traceback.print_exc()
