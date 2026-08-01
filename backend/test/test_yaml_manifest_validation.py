"""Tests for crawl configuration validation.

Covers cron schedule validation, crawl filename template validation, and
rendering of values into Kubernetes app templates.
"""

from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import jinja2
import pytest
import yaml
from pydantic import TypeAdapter, ValidationError

from btrixcloud.crawl_validator import validate_crawl_filename_template
from btrixcloud.cron_validator import validate_cron_schedule
from btrixcloud.db import BaseMongoModel
from btrixcloud.models import (
    CrawlConfigIn,
    CrawlFilenameTemplate,
    RawCrawlConfig,
    Schedule,
    UpdateCrawlConfig,
)
from btrixcloud.operator.baseoperator import BaseOperator

# ===========================================================================
# cron schedule validation
# ===========================================================================


@pytest.mark.parametrize(
    "schedule",
    [
        # basic 5-field and 6-field expressions
        "0 0 * * *",
        "0 0 * * * *",
        "* * * * *",
        # step values
        "*/15 * * * *",
        "0 */5 * * *",
        "1-10/2 * * * *",
        "5/15 * * * *",
        # ranges and lists
        "0 8-17 * * *",
        "0,30 * * * *",
        "5,10,15 9-17 * * *",
        # names (3-letter month / day-of-week)
        "30 2 * JAN,MAR,MAY SUN",
        "0 8-17/2 * * MON-FRI",
        "0 0 1 JAN *",
        # '?' in day-of-month / day-of-week only
        "0 0 ? * MON",
        "0 0 * * ?",
        "0 0 ? * ?",
        # edge values
        "0 0 * * 7",
        "0 0 31 12 *",
        # whitespace tolerance (trailing space, tabs between fields)
        "0 0 * * * ",
        "0\t0 * * *",
        # @ descriptors supported by Kubernetes CronJobs
        "@yearly",
        "@annually",
        "@monthly",
        "@weekly",
        "@daily",
        "@midnight",
        "@hourly",
        "@every 5m",
        "@every 1h30m",
        "@every 1h30m10s",
        "@every 0.5s",
        "@every 500ms",
        # long but valid expression (fits within the length limit)
        "0-59/1,0-59/2,0-59/3,0-59/4,0-59/5,0-59/6,0-59/7,0-59/8,0-59/9,"
        "0-59/10,0-59/11 * * * MON-FRI",
    ],
)
def test_valid_cron_schedules(schedule):
    assert validate_cron_schedule(schedule) == schedule


@pytest.mark.parametrize(
    "schedule",
    [
        # characters outside the cron grammar
        '* * * * "',
        "* * * * ---",
        "*:* * * *",
        "* * * * #",
        '0 0 * * *"\n---\napiVersion: batch/v1\nkind: Job\nmetadata:\n  name: test',
        # field count violations
        "* * * *",
        "* * * * * * *",
        "0 0 * * * 0 0",
        # out-of-range values
        "99 * * * *",
        "* 24 * * *",
        "* * 32 * *",
        "0 0 * 13 *",
        "0 0 * * 8",
        # misplaced names / '?'
        "JAN * * * *",
        "? * * * *",
        "0 0 * * * * ?",
        # malformed ranges
        "1- * * * *",
        "-5 * * * *",
        "* * * * 5-",
        # invalid descriptors
        "@DAILY",
        "@daily 5m",
        "@EVERY 5m",
        "@every",
        "@every 5",
        "@every 5x",
        "@every -5m",
        # invalid step value
        "*/0 * * * *",
        # newlines and carriage returns are not valid separators
        "0 0 * * *\n*",
        "0\n0\n*\n*\n*",
        "0 0 * * *\r",
    ],
)
def test_invalid_cron_schedules(schedule):
    with pytest.raises(ValueError):
        validate_cron_schedule(schedule)


def test_cron_schedule_none_and_empty_passthrough():
    assert validate_cron_schedule(None) is None
    assert validate_cron_schedule("") == ""


# ===========================================================================
# crawl filename template validation
# ===========================================================================


@pytest.mark.parametrize(
    "template",
    [
        "@ts-@hostsuffix.wacz",
        "crawl-@id.wacz",
        "@hostname-@ts.wacz",
        "plain-name.wacz",
        "archive_2024.wacz",
        "with space.wacz",
        "colon:name.wacz",
        "slash/name.wacz",
        'quote"name.wacz',
        "(parens) [brackets] {braces} $%&+.wacz",
        "crawls-名-2024.wacz",
        # dots inside a path component are fine; only '.'/'..'
        # components and leading '/' are rejected
        "a..b.wacz",
        # longest allowed template (768 characters)
        "x" * 768,
    ],
)
def test_valid_crawl_filename_templates(template):
    assert validate_crawl_filename_template(template) == template


def test_crawl_filename_template_none_and_empty_passthrough():
    assert validate_crawl_filename_template(None) is None
    assert validate_crawl_filename_template("") == ""


@pytest.mark.parametrize(
    "template",
    [
        # control characters (newlines, tabs, etc.) are not valid in S3 keys
        'x"\n---\napiVersion: batch/v1\nkind: Job',
        "@ts\n---\nkind: Job",
        "line\nbreak.wacz",
        "tab\t.wacz",
        "nul\x00.wacz",
        "del\x7f.wacz",
        # path traversal/absolute paths
        "../evil.wacz",
        "..",
        "a/../b.wacz",
        "a/./b.wacz",
        "/abs/path.wacz",
        "/etc/passwd",
        # one character over the 768-character limit
        "x" * 769,
    ],
)
def test_invalid_crawl_filename_templates(template):
    with pytest.raises(ValueError):
        validate_crawl_filename_template(template)


# ===========================================================================
# model-level validation (the API input models)
# ===========================================================================


def test_crawl_config_in_rejects_invalid_schedule():
    with pytest.raises(ValidationError):
        CrawlConfigIn(
            schedule='0 0 * * *"\n---\napiVersion: batch/v1',
            name="test",
            config=RawCrawlConfig(),
        )


def test_crawl_config_in_accepts_valid_schedule():
    config = CrawlConfigIn(
        schedule="@daily",
        name="test",
        config=RawCrawlConfig(),
    )
    assert config.schedule == "@daily"


def test_update_crawl_config_rejects_invalid_filename_template():
    with pytest.raises(ValidationError):
        UpdateCrawlConfig(crawlFilenameTemplate='x"\n---\ntest/123')


def test_update_crawl_config_rejects_invalid_schedule():
    with pytest.raises(ValidationError):
        UpdateCrawlConfig(schedule='0 0 * * *"\n---\ntest 123')


def test_crawl_filename_template_type_rejects_invalid():
    with pytest.raises(ValidationError):
        TypeAdapter(CrawlFilenameTemplate).validate_python(
            'x"\n---\napiVersion: batch/v1'
        )


def test_schedule_type_accepts_valid():
    assert TypeAdapter(Schedule).validate_python("*/10 * * * *") == "*/10 * * * *"


def test_schedule_type_accepts_unset_values():
    # None and "" mean "no schedule" and must pass on the write path
    assert TypeAdapter(Schedule).validate_python(None) is None
    assert TypeAdapter(Schedule).validate_python("") == ""


def test_schedule_type_rejects_non_strings():
    with pytest.raises(ValidationError):
        TypeAdapter(Schedule).validate_python(123)
    with pytest.raises(ValidationError):
        TypeAdapter(Schedule).validate_python(True)


def test_schedule_type_rejects_overlong_schedule():
    # 101 characters exceeds the 100-character limit
    with pytest.raises(ValidationError):
        TypeAdapter(Schedule).validate_python("* " * 50 + "*")


def test_crawl_filename_template_type_accepts_unset_values():
    assert TypeAdapter(CrawlFilenameTemplate).validate_python(None) is None
    assert TypeAdapter(CrawlFilenameTemplate).validate_python("") == ""


def test_crawl_filename_template_type_accepts_valid_value():
    assert (
        TypeAdapter(CrawlFilenameTemplate).validate_python("crawl-@id.wacz")
        == "crawl-@id.wacz"
    )


def test_crawl_config_in_accepts_valid_filename_template():
    config = CrawlConfigIn(
        crawlFilenameTemplate="crawl-@id.wacz",
        name="test",
        config=RawCrawlConfig(),
    )
    assert config.crawlFilenameTemplate == "crawl-@id.wacz"


def test_crawl_filename_template_type_rejects_non_strings():
    with pytest.raises(ValidationError):
        TypeAdapter(CrawlFilenameTemplate).validate_python(123)


def test_models_accept_explicit_null_schedule_and_template():
    # clearing a schedule / template via PATCH sends explicit null
    config = CrawlConfigIn(schedule=None, name="test", config=RawCrawlConfig())
    assert config.schedule is None
    update = UpdateCrawlConfig(schedule=None, crawlFilenameTemplate=None)
    assert update.schedule is None
    assert update.crawlFilenameTemplate is None


# ===========================================================================
# lenient DB reads: legacy values must still load (validation only on writes)
# ===========================================================================


class _LenientScheduleModel(BaseMongoModel):
    """Model with the Schedule type, for lenient-read testing"""

    schedule: Schedule = ""


class _LenientTemplateModel(BaseMongoModel):
    """Model with the CrawlFilenameTemplate type, for lenient-read testing"""

    template: CrawlFilenameTemplate = None


def test_schedule_validates_on_write_but_is_lenient_on_db_read():
    # direct construction (API write path) rejects invalid schedules
    with pytest.raises(ValidationError):
        _LenientScheduleModel(schedule='0 0 * * *"\n---\napiVersion: batch/v1')

    # from_dict (DB read path) is lenient - legacy data still loads
    model = _LenientScheduleModel.from_dict(
        {"_id": uuid4(), "schedule": '0 0 * * *"\n---\napiVersion: batch/v1'}
    )
    assert model.schedule == '0 0 * * *"\n---\napiVersion: batch/v1'


def test_filename_template_validates_on_write_but_is_lenient_on_db_read():
    # direct construction (API write path) rejects invalid templates
    with pytest.raises(ValidationError):
        _LenientTemplateModel(template="bad\n---\nkind: Job")

    # from_dict (DB read path) is lenient - legacy data still loads
    model = _LenientTemplateModel.from_dict(
        {"_id": uuid4(), "template": "bad\n---\nkind: Job"}
    )
    assert model.template == "bad\n---\nkind: Job"


# --- operator template loading ---------------------------------------------

APP_TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "chart" / "app-templates"


class _TemplateHolder:
    """Minimal stand-in for BaseOperator, exposing only the template loader"""

    def __init__(self):
        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(APP_TEMPLATES_DIR)),
            autoescape=False,
        )
        self.k8s = SimpleNamespace(templates=SimpleNamespace(env=env))


BACKGROUND_JOB_PARAMS = {
    "id": "job1",
    "job_type": "readd-pages",
    "backend_image": "docker.io/webrecorder/browsertrix-backend:test",
    "pull_policy": "IfNotPresent",
    "larger_resources": True,
}


def test_cron_job_schedule_renders_as_single_document():
    holder = _TemplateHolder()

    docs = BaseOperator.load_from_yaml(
        holder,
        "crawl_cron_job.yaml",
        {
            "id": "cron1",
            "cid": str(uuid4()),
            "oid": str(uuid4()),
            "userid": str(uuid4()),
            "schedule": "0 0 * * *",
        },
    )

    assert len(docs) == 1
    assert docs[0]["kind"] == "CronJob"
    assert docs[0]["spec"]["schedule"] == "0 0 * * *"


# --- yaml-safe rendering of template values ---------------------------------


@pytest.mark.parametrize(
    "value",
    [
        # cases where plain interpolation would change the parsed value or
        # structure: YAML flow indicators, bool coercion, line breaks, and
        # multi-document separators
        "a: b",
        "true",
        "x\ny",
        'x"\n---\napiVersion: batch/v1\nkind: Pod',
        "https://example.com/path?q=1&r=2",
    ],
)
def test_tojson_renders_single_line_roundtrippable_yaml_scalar(value):
    env = jinja2.Environment()
    rendered = env.from_string("{{ value | tojson }}").render(value=value)

    # the filter output must never span multiple lines or create structure
    assert "\n" not in rendered
    assert yaml.safe_load(rendered) == value


def _profile_browser_params(url):
    return {
        "id": "browser-abc",
        "namespace": "crawlers",
        "url": url,
        "crawler_uid": "1000",
        "crawler_gid": "1000",
        "crawler_fsgroup": "1000",
        "profile_browser_workdir_size": "1Gi",
        "crawler_image": "docker.io/webrecorder/browsertrix-crawler:test",
        "crawler_image_pull_policy": "IfNotPresent",
        "memory_limit": "1Gi",
        "profile_cpu": "100m",
        "profile_memory": "256Mi",
        "storage_secret": "storage-default",
        "storage_path": "/tmp",
        "vnc_password": "secret",
    }


def test_profile_browser_url_stays_single_scalar_when_it_contains_newlines():
    holder = _TemplateHolder()
    hostile_url = (
        "https://example.com/x\n---\napiVersion: batch/v1\nkind: Pod\n"
        "metadata:\n  name: garbage\n"
    )

    docs = BaseOperator.load_from_yaml(
        holder,
        "profilebrowser.yaml",
        _profile_browser_params(hostile_url),
    )

    # the url remains a single command argument (data, not structure)
    assert len(docs) == 1
    command = docs[0]["spec"]["containers"][0]["command"]
    assert command[command.index("--url") + 1] == hostile_url


def test_background_job_crawl_id_stays_single_scalar_when_it_contains_newlines():
    holder = _TemplateHolder()
    hostile_crawl_id = (
        "manual-abc\n---\napiVersion: batch/v1\nkind: Job\nmetadata:\n  name: garbage\n"
    )

    docs = BaseOperator.load_from_yaml(
        holder,
        "background_job.yaml",
        {**BACKGROUND_JOB_PARAMS, "crawl_id": hostile_crawl_id},
    )

    assert len(docs) == 1
    env = docs[0]["spec"]["template"]["spec"]["containers"][0]["env"]
    crawl_id_env = [entry for entry in env if entry["name"] == "CRAWL_ID"][0]
    assert crawl_id_env["value"] == hostile_crawl_id


SIGNED_URL = (
    "https://storage.example.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/"
    "coll.wacz?X-Amz-Signature=abc%2Fdef%3D&part=1#frag"
)


@pytest.mark.parametrize(
    "job_type,expected_args",
    [
        ("import", {"--sourceUrl": SIGNED_URL}),
        ("purge", {"--sourceUrl": SIGNED_URL, "--removing": True}),
        ("commit", {"--commitCrawlId": "manual-20260714225812-dc73dcee-99f"}),
        ("cancel", {"--cancelCrawlId": "manual-20260714225812-dc73dcee-99f"}),
    ],
)
def test_index_import_job_command_args_roundtrip_through_tojson(
    job_type, expected_args
):
    holder = _TemplateHolder()

    docs = BaseOperator.load_from_yaml(
        holder,
        "index-import-job.yaml",
        {
            "name": "import-index-abc12",
            "job_type": job_type,
            "id": str(uuid4()),
            "oid": str(uuid4()),
            "crawler_image": "docker.io/webrecorder/browsertrix-crawler:test",
            "crawler_image_pull_policy": "IfNotPresent",
            "redis_url": "redis://redis-x/0",
            "import_source_url": SIGNED_URL,
            "crawl_id": "manual-20260714225812-dc73dcee-99f",
        },
    )

    command = docs[0]["spec"]["template"]["spec"]["containers"][0]["command"]
    # walk flag/value pairs, tolerating valueless flags (e.g. --removing)
    args: dict[str, str | bool] = {}
    i = 1
    while i < len(command):
        flag = command[i]
        value = command[i + 1] if i + 1 < len(command) else None
        if value is not None and not value.startswith("--"):
            args[flag] = value
            i += 2
        else:
            args[flag] = True
            i += 1
    for flag, expected in expected_args.items():
        assert args[flag] == expected


def test_crawl_job_cr_user_values_stay_single_scalar_when_they_contain_newlines():
    holder = _TemplateHolder()
    hostile = "x\n---\napiVersion: btrix.cloud/v1\nkind: CrawlJob\n"

    docs = BaseOperator.load_from_yaml(
        holder,
        "crawl_job.yaml",
        {
            "id": "manual-20260714225812-dc73dcee-99f",
            "cid": str(uuid4()),
            "userid": str(uuid4()),
            "oid": str(uuid4()),
            "storage_name": "default",
            "crawler_channel": hostile,
            "scale": 1,
            "browser_windows": 1,
            "timeout": 0,
            "max_crawl_size": 0,
            "manual": "1",
            "warc_prefix": "colls/11111111-2222-3333-4444-555555555555",
            "storage_filename": hostile,
            "profile_filename": "profile-abc.tar.gz",
            "profileid": "",
            "qa_source": "",
            "proxy_id": hostile,
            "dedupe_coll_id": "",
            "is_single_page": "0",
            "seed_file_url": "",
            "pausedAt": "",
        },
    )

    # the values remain single spec fields (data, not structure)
    assert len(docs) == 1
    spec = docs[0]["spec"]
    assert spec["storage_filename"] == hostile
    assert spec["proxyId"] == hostile
    assert spec["crawlerChannel"] == hostile
