""" shared utils """

import base64
import os


def random_suffix():
    """ generate suffix for unique container """
    return base64.b32encode(os.urandom(5)).lower().decode("utf-8")
