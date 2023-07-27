import pytest
import yaml
from os import listdir
# Import hacking for script
import sys
sys.path.insert(0, '.')
import check_passwords

@pytest.fixture
def yaml_files(tmp_path):
    with_password = """
    nested: 
      deep: 
        in_the_land: 
          is_a_password: thisislegit!
    not_nested_password: uh_oh_i_commited_creds
    """
    with_allowed_password = """
    nested:
        deep:
            in_the_land:
                is_a_password: PassW0rd!
    not_nested_password: password
    """
    example_yaml = """
    doe: "a deer, a female deer"
    ray: "a drop of golden sun"
    pi: 3.14159
    xmas: true
    french-hens: 3
    calling-birds:
      - huey
      - dewey
      - louie
      - fred
    xmas-fifth-day:
      calling-birds: four
      french-hens: 3
      golden-rings: 5
      partridges:
        count: 1
        location: "a pear tree"
      turtle-doves: two
    """
    with open(tmp_path / "with_password.yaml", 'w') as fobj:
        fobj.write(with_password)

    with open(tmp_path / "with_allowed_password.yaml", 'w') as fobj:
        fobj.write(with_allowed_password)

    with open(tmp_path / "example.yaml", 'w') as fobj:
        fobj.write(example_yaml)
    return tmp_path

class TestCheckPasswords:
    def test_find_passwords(self, yaml_files):
        with open(yaml_files / "with_password.yaml", 'r') as fobj:
            yml = yaml.safe_load(fobj)
            gen = check_passwords.key_finder(yml)
            assert ('nested', 'is_a_password', "thisislegit!") == next(gen)
            assert ('not_nested_password', 'uh_oh_i_commited_creds') == next(gen)

    def test_dont_find_passwords(self, yaml_files):
        with open(yaml_files / "with_allowed_password.yaml", 'r') as fobj:
            yml = yaml.safe_load(fobj)
            gen = check_passwords.key_finder(yml)
            (_, _, password) = next(gen)
            assert password in ["PassW0rd!", "password"]
            (_, password) = next(gen)
            assert password in ["PassW0rd!", "password"]
            with pytest.raises(StopIteration):
                next(gen)

    def test_parsing_yaml(self, yaml_files):
        with open(yaml_files / "example.yaml", 'r') as fobj:
            yml = yaml.safe_load(fobj)
            gen = check_passwords.key_finder(yml)
            with pytest.raises(StopIteration):
                next(gen)
