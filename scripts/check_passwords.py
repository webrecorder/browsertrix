"A small dirty script to check that none of the password config options have been set to real passwords"
from collections.abc import Generator
import yaml
from yaml.scanner import ScannerError
from yaml.constructor import ConstructorError
import sys


ALLOWED_PASSWORDS = ["PassW0rd!", "password", "PASSWORD@", "PASSW0RD!", "PASSWORD!"]

def key_finder(d: dict, key: str = "password", top_level = None) -> Generator:
    """This recursive function yields all the keys in {d} that _contains_ the string {key}

    :param dict d: The dictionary to dive through
    :param str key: The phrase we are going to match keys against
    :return: A generator that creates tuples containing Optional[top_level_key], key, value
    :rtype Union[tuple[str, str], tuple[str, str, str]]
    """
    if d is None:
        return {}
    for k, v in d.items():
        if isinstance(v, dict):
            if top_level is None:
                yield from key_finder(v, key, k) # Pass the top level name into the recursive descent
            else:
                yield from key_finder(v, key, top_level) # name isn't the top level key
        if key in str(k): # Sometimes yaml gets parsed with key True
            if top_level is None:
                yield k, v # Key is already top level
            else:
                yield top_level, k, v # Use the top level name

WE_DUN_GOOFED: bool = False

changed_files = sys.argv[1:] # Ignore filename of this script
for file in changed_files:
    with open(file, 'r') as f:
        try:
            yml = yaml.safe_load(f)
            gen = key_finder(yml)
            for password_keys in gen:
                if password_keys[-1] not in ALLOWED_PASSWORDS:
                    if len(password_keys) == 2:
                        print(f"top level key '{password_keys[0]}' in {file} contains a real password!")
                    else:
                        print(f"top level key '{password_keys[0]}' with subkey '{password_keys[1]}' in {file} contains a real password!")
                    WE_DUN_GOOFED = True
        except ScannerError:
            print(f"Couldn't parse yaml file for: {file}")
            pass
        except ConstructorError:
            print(f"Couldn't construct yaml file: {file}")
            pass

if WE_DUN_GOOFED:
    exit(1)
