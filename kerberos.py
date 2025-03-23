import requests
import json
import time
import sys
import subprocess
import time
import json


def jprint(json_content):
    print(json.dumps(json_content, indent=2))


class OpensslError(Exception):
    pass


def int_to_bytes(n):
    return n.to_bytes(n.bit_length() // 8 + 1)


def encrypt(plaintext, passphrase, cipher="aes-128-cbc"):
    pass_arg = "pass:{}".format(passphrase)
    args = ["openssl", "enc", "-" + cipher, "-base64", "-pass", pass_arg, "-pbkdf2"]
    if not plaintext.endswith("\n"):
        plaintext += "\n"

    if isinstance(plaintext, str):
        plaintext = plaintext.encode("utf-8")
    result = subprocess.run(
        args, input=plaintext, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    error_message = result.stderr.decode()
    if error_message != "":
        raise OpensslError(error_message)
    return result.stdout.decode()


def decrypt(cryptedtext, passphrase, cipher="aes-128-cbc"):

    if not cryptedtext.endswith("\n"):
        cryptedtext += "\n"

    pass_arg = "pass:{}".format(passphrase)
    args = [
        "openssl",
        "enc",
        "-d",
        "-" + cipher,
        "-base64",
        "-pass",
        pass_arg,
        "-pbkdf2",
    ]

    if isinstance(cryptedtext, str):
        cryptedtext = cryptedtext.encode()

    result = subprocess.run(
        args, input=cryptedtext, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    error_message = result.stderr.decode()
    if error_message != "":
        raise OpensslError(error_message)

    return result.stdout.decode()


API_URL = "http://m1.tme-crypto.fr:8888/"
HEADERS = {"Content-Type": "application/json"}
DEFAULT_USERNAME = "mbidault"
DEFAULT_PWD = int_to_bytes(365416338768477987679790).decode()

KERBERIZED_METHODS = [
    "world.create",
    "kerberos.echo",
    "protagonist.move",
]

NON_KERBERIZED_METHODS = [
    "man",
    "echo",
    "world.list",
    "world.destroy",
    "server.status",
    "server.history",
    "kerberos.authentication-service",
    "kerberos.ticket-granting-service",
    "protagonist.location",
    "protagonist.data-collection",
    "protagonist.username",
    "room.name",
    "room.find-by-name",
    "chip.whisperer",
    "walkman.get-tracks",
    "action.is_done",
    "action.do",
]


class KerberosClient:
    def __init__(
        self, username=DEFAULT_USERNAME, password=DEFAULT_PWD, api_url=API_URL
    ):
        self.username = username
        self.password = password
        self.api_url = api_url
        self.session_ticket = None
        self.session_key = None
        self.authenticate()  # Authenticate on initialization

    def _send_request(
        self,
        method,
        params=None,
        is_kerberized=False,
        method_ticket=None,
        method_key=None,
    ):
        """Sends a JSON-RPC request to the API."""
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},  # Ensure params is always a dictionary
            "id": int(time.time() * 1000),  # Unique ID using timestamp
        }

        if is_kerberized:
            if method_ticket is None or method_key is None:
                method_ticket, method_key = self._get_method_ticket(method)

            authenticator = self._create_authenticator(method_key)

            encrypted_args = (
                encrypt(json.dumps(params), method_key) if params else ""
            )  # Handle empty params

            payload["params"] = {
                "ticket": method_ticket,
                "authenticator": authenticator,
                "encrypted_args": encrypted_args,
            }

        response = requests.post(
            self.api_url, headers=HEADERS, data=json.dumps(payload)
        )
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        result = response.json()

        if "error" in result:
            raise ValueError(f"API Error: {result['error']}")  # More descriptive error

        if is_kerberized:
            return json.loads(decrypt(result["result"], method_key))
        return result["result"]

    def _create_authenticator(self, key):
        """Creates an authenticator."""
        d = {"username": self.username, "timestamp": time.time()}
        return encrypt(json.dumps(d), key)

    def authenticate(self):
        """Authenticates with the Authentication Service and gets the TGT."""
        result = self._send_request(
            "kerberos.authentication-service", {"username": self.username}
        )
        self.session_ticket = result["ticket"]
        self.session_key = decrypt(result["key"], self.password)

    def _get_method_ticket(self, method_name):
        """Gets a ticket for a specific method from the TGS."""
        authenticator = self._create_authenticator(self.session_key)
        result = self._send_request(
            "kerberos.ticket-granting-service",
            {
                "ticket": self.session_ticket,
                "authenticator": authenticator,
                "method": method_name,
            },
        )
        return result["ticket"], decrypt(result["key"], self.session_key)

    def call_method(self, method_name, *args, **kwargs):
        """
        Calls any method, automatically handling Kerberos authentication if needed.
        """
        is_kerberized = method_name in KERBERIZED_METHODS

        params = kwargs  # Use keyword arguments

        if args:
            raise ValueError(
                "Use keyword arguments for parameters (e.g., call_method('method_name', param1=value1, param2=value2))"
            )

        return self._send_request(method_name, params, is_kerberized)

    def man(self, method_name):
        return self.call_method("man", method=method_name)

    def kerberos_echo(self, message):
        return self.call_method("kerberos.echo", message=message)

    def move(self, world_id, room):
        return self.call_method("protagonist.move", world_id=world_id, room=room)

    def create_world(self, ip, protocol, extended_client):
        return self.call_method(
            "world.create", ip=ip, protocol=protocol, extended_client=extended_client
        )

    def echo(self, message):
        return self.call_method("echo", message=message)

    def list_worlds(self):
        return self.call_method("world.list")

    def server_status(self):
        return self.call_method("server.status")

    def server_history(self):
        return self.call_method("server.history")

    def location(self, world_id):
        return self.call_method("protagonist.location", world_id=world_id)

    def data_collection(self, world_id):
        return self.call_method("protagonist.data-collection", world_id=world_id)

    def use_from_world(self, world_id):
        return self.call_method("protagonist.username", world_id=world_id)

    def room_name(self, world_id, room):
        return self.call_method("room.name", world_id=world_id, room=room)

    def chip_whisperer(self, world_id, ciphertexts):
        return self.call_method(
            "chip.whisperer", world_id=world_id, ciphertexts=ciphertexts
        )

    def walkman(self, world_id):
        return self.call_method("walkman.get-tracks", world_id=world_id)

    def is_action_done(self, world_id, name):
        return self.call_method("action.is_done", world_id=world_id, name=name)


def scan_users(client: KerberosClient, verbose=1):
    world_list = client.list_worlds()
    result = []
    for w in world_list:
        user = client.use_from_world(w[0])
        if user:
            result.append((user, w[0]))
            if verbose > 0:
                print(result[-1])
    return result


def scan_active_users(client: KerberosClient, verbose=1):
    users_list = []
    world_list = client.list_worlds()
    result = []
    for w in world_list:
        w_ID = w[0]
        user = client.use_from_world(w_ID)
        if not user or user in users_list:
            continue
        users_list.append(user)
        if verbose > 0:
            print(user, file=sys.stderr)
        location = client.location(w_ID)
        room = client.room_name(w_ID, location)
        data = client.data_collection(w_ID)
        # print((user, room, data))
        result.append(
            {
                "user": user,
                "world_id": w_ID,
                "location": location,
                "room": room,
                "data": data,
            }
        )
    return result


def all_man(client: KerberosClient, verbose=1):
    result = []
    for method in NON_KERBERIZED_METHODS + KERBERIZED_METHODS:
        man = client.man(method)
        if verbose > 0:
            print(f"--------- {method} ---------")
            jprint(man)
        result.append(man)
    return result


K_CLIENT = KerberosClient()
# jprint(K_CLIENT.get_server_history())
# jprint(K_CLIENT.man("protagonist.username"))


# jprint(K_CLIENT.use_from_world("c89e87be37e427e86e9720fc6329bd6f"))
# all_man(K_CLIENT)
scan = scan_active_users(K_CLIENT)
jprint(scan)
