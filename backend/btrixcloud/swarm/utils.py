""" swarm util functions """

import tempfile
import os
import subprocess

from python_on_whales import client_config, DockerClient
from python_on_whales.exceptions import DockerException


# ============================================================================
def get_templates_dir():
    """ return directory containing templates for loading """
    return os.path.join(os.path.dirname(__file__), "templates")


# ============================================================================
def get_runner(runtime=None):
    """ return either Swarm or Podman Runner based on env setting """
    if runtime is None:
        runtime = os.environ.get("RUNTIME", "")

    if runtime == "podman":
        return PodmanComposeRunner()

    return SwarmRunner()


# ============================================================================
class SwarmRunner:
    """ Run in Swarm """

    def __init__(self):
        self.client = DockerClient()

    def run_service_stack(self, name, data):
        """ run compose/swarm stack via interpolated file """
        with tempfile.NamedTemporaryFile("wt") as fh_io:
            fh_io.write(data)
            fh_io.flush()

            try:
                self.client.stack.deploy(
                    name,
                    compose_files=[fh_io.name],
                    orchestrator="swarm",
                    resolve_image="never",
                )
            except DockerException as exc:
                print(exc, flush=True)

        return name

    def delete_service_stack(self, name):
        """ remove stack """
        try:
            self.client.stack.remove(name)
            return True
        except DockerException as exc:
            print(exc, flush=True)
            return False

    def delete_volumes(self, names):
        """ remove stack """
        try:
            self.client.volume.remove(names)
            return True
        except DockerException as exc:
            print(exc, flush=True)
            return False

    def create_secret(self, name, data, labels=None):
        """ create secret from specified data """
        with tempfile.NamedTemporaryFile("wt") as fh_io:
            fh_io.write(data)
            fh_io.flush()

            try:
                self.client.secret.create(name, fh_io.name, labels=labels)
            except DockerException as exc:
                print(exc, flush=True)

    def delete_secret(self, name):
        """ remove secret by name """
        try:
            self.client.secret.remove(name)
            return True
        except DockerException as exc:
            print(exc, flush=True)
            return False

    def delete_secrets(self, label):
        """ delete secret with specified label """
        try:
            configs = self.client.secret.list(filters={"label": label})
            for config in configs:
                config.remove()

            return True
        except DockerException as exc:
            print(exc, flush=True)
            return False

    def get_service(self, service_name):
        """ get a swarm service """
        try:
            res = self.client.service.inspect(service_name)
            return res
        except DockerException:
            return None

    def get_service_labels(self, service_name):
        """ get labels from a swarm service """
        service = self.get_service(service_name)
        return service.spec.labels if service else {}

    def set_service_label(self, service_name, label):
        """ update label """
        exe_file = client_config.get_docker_binary_path_in_cache()

        try:
            subprocess.run(
                [
                    exe_file,
                    "service",
                    "update",
                    service_name,
                    "--label-add",
                    label,
                ],
                capture_output=True,
                check=True,
            )
        # pylint: disable=broad-except
        except Exception as exc:
            print(exc, flush=True)

    def ping_containers(self, value, signal_="SIGTERM"):
        """ ping running containers with given service name with signal """
        try:
            count = 0
            conts = self.client.container.list(filters={"name": value})
            for cont in conts:
                print("Sending Signal: " + signal_, flush=True)
                cont.kill(signal_)
                count += 1
            return count
        except DockerException as exc:
            print(exc, flush=True)
            return 0


# ============================================================================
class PodmanComposeRunner(SwarmRunner):
    """ Run via Docker Compose """

    def __init__(self):
        # pylint: disable=super-init-not-called
        self.podman_exe = "podman"
        # self.podman_exe = client_config.get_docker_binary_path_in_cache()

        self.client = DockerClient(client_call=[self.podman_exe])

    def run_service_stack(self, name, data):
        """ run compose/swarm stack via interpolated file """
        with tempfile.NamedTemporaryFile("wt") as fh_io:
            fh_io.write(data)
            fh_io.flush()

            try:
                result = subprocess.run(
                    [
                        "podman-compose",
                        "--podman-path",
                        self.podman_exe,
                        "-f",
                        fh_io.name,
                        "-p",
                        name,
                        "up",
                        "-d",
                    ],
                    capture_output=True,
                    check=False,
                )
                print("stdout")
                print("------")
                print(result.stdout.decode("utf-8"))
                print("stderr")
                print("------")
                print(result.stderr.decode("utf-8"), flush=True)
            # pylint: disable=broad-except
            except Exception as exc:
                print(exc, flush=True)

    def delete_service_stack(self, name):
        """ delete compose stack """
        print("Deleting Stack: " + name, flush=True)

        for container in self.client.container.list(
            filters={"label": f"com.docker.compose.project={name}"}
        ):
            container.kill()
            container.remove(volumes=True, force=True)

        for volume in self.client.volume.list(
            filters={"label": f"com.docker.compose.project={name}"}
        ):
            volume.remove()

    def create_secret(self, name, data, labels=None):
        """ create secret from specified data """
        with tempfile.NamedTemporaryFile("wt") as fh_io:
            fh_io.write(data)
            fh_io.flush()

            try:
                # labels not supported
                self.client.secret.create(name, fh_io.name)
            except DockerException as exc:
                print(exc, flush=True)

    def delete_secret(self, name):
        """ remove secret by name """
        # python-on-whale calls 'remove' but podman only supports 'rm', so call directly
        try:
            subprocess.run([self.podman_exe, "secret", "rm", name], check=True)
            return True
        # pylint: disable=broad-except
        except Exception as exc:
            print(exc, flush=True)
            return False

    def get_service(self, service_name):
        """ get a swarm service """
        try:
            res = self.client.container.inspect(service_name)
            return res
        except DockerException:
            return None
