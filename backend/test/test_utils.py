"""utils tests"""

import pytest

from btrixcloud.utils import slug_from_name, crawler_image_below_minimum


@pytest.mark.parametrize(
    "name,expected_slug",
    [
        ("Default org", "default-org"),
        ("User's org", "users-org"),
        ("User's @ org", "users-org"),
        ("Org with åccénted charactêrs", "org-with-accented-characters"),
        ("Org with åccénted! charactêrs@!", "org-with-accented-characters"),
        ("cATs! 🐈🐈‍⬛", "cats"),
    ],
)
def test_slug_from_name(name: str, expected_slug: str):
    assert slug_from_name(name) == expected_slug


@pytest.mark.parametrize(
    "crawler_image,min_image,expected_return",
    [
        # Straightforward comparisons
        (
            "docker.io/webrecorder/browsertrix-crawler:1.5.0",
            "docker.io/webrecorder/browsertrix-crawler:1.5.0",
            False,
        ),
        (
            "docker.io/webrecorder/browsertrix-crawler:1.6",
            "docker.io/webrecorder/browsertrix-crawler:1.5.0",
            False,
        ),
        (
            "docker.io/webrecorder/browsertrix-crawler:1.10.2",
            "docker.io/webrecorder/browsertrix-crawler:1.5.0",
            False,
        ),
        (
            "docker.io/webrecorder/browsertrix-crawler:1.11.0beta1",
            "docker.io/webrecorder/browsertrix-crawler:1.5.0",
            False,
        ),
        (
            "docker.io/webrecorder/browsertrix-crawler:1.4.6",
            "docker.io/webrecorder/browsertrix-crawler:1.5.0",
            True,
        ),
        # "latest" and similar tags for either always return False
        (
            "docker.io/webreocrder/browsertrix-crawler:latest",
            "docker.io/webrecorder/browsertrix-crawler:1.9.0",
            False,
        ),
        (
            "docker.io/webrecorder/browsertrix-crawler:1.10.1",
            "docker.io/webrecorder/browsertrix-crawler:latest",
            False,
        ),
        (
            "docker.io/webreocrder/browsertrix-crawler:dev",
            "docker.io/webrecorder/browsertrix-crawler:dev",
            False,
        ),
    ],
)
def test_crawler_image_below_minimum(
    crawler_image: str, min_image: str, expected_return: str
):
    assert crawler_image_below_minimum(crawler_image, min_image) == expected_return
