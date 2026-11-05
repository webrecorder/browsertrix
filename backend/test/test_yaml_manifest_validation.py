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
from btrixcloud.k8sapi import finalize_template_value
from btrixcloud.models import (
    BgJobType,
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
        "nel\x85.wacz",
        "line\u2028break.wacz",
        "line\u2029break.wacz",
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
            finalize=finalize_template_value,
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
        # Unicode line separators are YAML line breaks but are not in the
        # C0/C1 ranges rejected by the filename template validator
        "x\u2028y",
        "x\u2029y",
        'x"\u2028---\u2028apiVersion: batch/v1\u2028kind: Pod',
        'x"\u2029---\u2029apiVersion: batch/v1\u2029kind: Pod',
        "nel\x85break",
    ],
)
@pytest.mark.parametrize("expression", ["{{ value }}", "{{ value | tojson }}"])
def test_template_values_render_as_single_line_roundtrippable_yaml_scalars(
    value, expression
):
    env = jinja2.Environment(finalize=finalize_template_value)
    rendered = env.from_string(expression).render(value=value)

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
    url_with_line_breaks = (
        "https://example.com/x\n---\napiVersion: batch/v1\nkind: Pod\n"
        "metadata:\n  name: example\n"
    )

    docs = BaseOperator.load_from_yaml(
        holder,
        "profilebrowser.yaml",
        _profile_browser_params(url_with_line_breaks),
    )

    # the url remains a single command argument (data, not structure)
    assert len(docs) == 1
    spec = docs[0]["spec"]
    command = spec["containers"][0]["command"]
    assert command[command.index("--url") + 1] == url_with_line_breaks

    security = spec["securityContext"]
    assert security["runAsUser"] == 1000
    assert security["runAsGroup"] == 1000
    assert security["fsGroup"] == 1000
    assert spec["containers"][0]["resources"]["limits"]["memory"] == "1Gi"


def test_background_job_crawl_id_stays_single_scalar_when_it_contains_newlines():
    holder = _TemplateHolder()
    crawl_id_with_line_breaks = (
        "manual-abc\n---\napiVersion: batch/v1\nkind: Job\nmetadata:\n  name: example\n"
    )

    docs = BaseOperator.load_from_yaml(
        holder,
        "background_job.yaml",
        {**BACKGROUND_JOB_PARAMS, "crawl_id": crawl_id_with_line_breaks},
    )

    assert len(docs) == 1
    env = docs[0]["spec"]["template"]["spec"]["containers"][0]["env"]
    crawl_id_env = [entry for entry in env if entry["name"] == "CRAWL_ID"][0]
    assert crawl_id_env["value"] == crawl_id_with_line_breaks


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


LINE_BREAK_VALUES = [
    'x"\n---\napiVersion: v1\nkind: Pod\nmetadata:\n  name: example\n',
    'x"\u2028---\u2028apiVersion: v1\u2028kind: Pod\u2028metadata:\u2028  name: example\u2028',
    'x"\u2029---\u2029apiVersion: v1\u2029kind: Pod\u2029metadata:\u2029  name: example\u2029',
]


def _render_template(template, params):
    holder = _TemplateHolder()
    return BaseOperator.load_from_yaml(holder, template, params)


def _container(doc, name):
    return next(c for c in doc["spec"]["containers"] if c["name"] == name)


def _env(container):
    return {entry["name"]: entry.get("value") for entry in container.get("env", [])}


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_crawl_job_cr_user_values_stay_single_scalar_when_they_contain_line_breaks(
    value,
):
    docs = _render_template(
        "crawl_job.yaml",
        {
            "id": value,
            "cid": value,
            "userid": value,
            "oid": value,
            "storage_name": value,
            "crawler_channel": value,
            "scale": 1,
            "browser_windows": 1,
            "timeout": 0,
            "max_crawl_size": 0,
            "manual": "1",
            "warc_prefix": value,
            "storage_filename": value,
            "profile_filename": value,
            "profileid": value,
            "qa_source": value,
            "proxy_id": value,
            "dedupe_coll_id": value,
            "is_single_page": "0",
            "seed_file_id": value,
            "pausedAt": value,
        },
    )

    # the values remain single spec fields (data, not structure)
    assert len(docs) == 1
    doc = docs[0]
    assert doc["metadata"]["name"] == "crawljob-" + value
    labels = doc["metadata"]["labels"]
    assert labels["crawl"] == value
    assert labels["btrix.org"] == value
    assert labels["btrix.user"] == value
    assert labels["btrix.storage"] == value
    assert labels["btrix.crawlconfig"] == value
    assert labels["dedupe_coll_id"] == value

    spec = doc["spec"]
    assert spec["selector"]["matchLabels"]["crawl"] == value
    assert spec["id"] == value
    assert spec["userid"] == value
    assert spec["cid"] == value
    assert spec["oid"] == value
    assert spec["profile_filename"] == value
    assert spec["storage_filename"] == value
    assert spec["qaSourceCrawlId"] == value
    assert spec["crawlerChannel"] == value
    assert spec["warcPrefix"] == value
    assert spec["storageName"] == value
    assert spec["proxyId"] == value
    assert spec["dedupeCollId"] == value
    assert spec["pausedAt"] == value
    assert spec["seedFileId"] == value
    assert spec["isSinglePage"] == "0"


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_crawler_values_stay_single_scalars_when_they_contain_line_breaks(value):
    docs = _render_template(
        "crawler.yaml",
        {
            "no_pvc": False,
            "init_crawler": True,
            "name": value,
            "namespace": value,
            "id": value,
            "userid": value,
            "crawler_uid": 1000,
            "crawler_gid": 1000,
            "crawler_fsgroup": 1000,
            "termination_grace_secs": 600,
            "storage": "1Gi",
            "volume_storage_class": "standard",
            "priorityClassName": value,
            "crawler_node_type": value,
            "add_proxies": True,
            "proxy_id": value,
            "proxy_url": value,
            "proxy_ssh_private_key": True,
            "proxy_ssh_host_public_key": True,
            "qa_source_crawl_id": "",
            "profile_filename": value,
            "save_profile": True,
            "redis_dedupe_url": value,
            "crawler_image": value,
            "crawler_image_pull_policy": value,
            "storage_secret": value,
            "signing_secret": value,
            "redis_url": value,
            "storage_path": value,
            "storage_filename": value,
            "warc_prefix": value,
            "workers": 2,
            "memory_limit": "1Gi",
            "cpu": "100m",
            "memory": "512Mi",
            "crawler_liveness_port": "",
        },
    )

    assert len(docs) == 2
    pvc, pod = docs
    assert pvc["metadata"]["name"] == value
    assert pvc["metadata"]["namespace"] == value
    assert pvc["metadata"]["labels"]["crawl"] == value

    assert pod["metadata"]["name"] == value
    assert pod["metadata"]["namespace"] == value
    assert pod["metadata"]["labels"]["crawl"] == value
    assert pod["spec"]["hostname"] == value
    assert pod["spec"]["priorityClassName"] == value

    node_terms = pod["spec"]["affinity"]["nodeAffinity"][
        "requiredDuringSchedulingIgnoredDuringExecution"
    ]["nodeSelectorTerms"]
    assert node_terms[0]["matchExpressions"][0]["values"] == [value]

    pod_terms = pod["spec"]["affinity"]["podAffinity"][
        "preferredDuringSchedulingIgnoredDuringExecution"
    ][0]["podAffinityTerm"]["labelSelector"]["matchExpressions"]
    assert pod_terms[0]["values"] == [value]

    volumes = {volume["name"]: volume for volume in pod["spec"]["volumes"]}
    assert volumes["crawl-config"]["configMap"]["name"] == "crawl-config-" + value
    assert volumes["crawl-data"]["persistentVolumeClaim"]["claimName"] == value

    container = pod["spec"]["containers"][0]
    assert container["image"] == value
    assert container["imagePullPolicy"] == value
    assert value in container["command"]
    assert "@" + value in container["command"]
    assert "/tmp/proxies/" + value + "-private-key" in container["command"]
    assert "/tmp/proxies/" + value + "-known-hosts" in container["command"]

    env = _env(container)
    assert env["CRAWL_ID"] == value
    assert env["WEBHOOK_URL"] == value + "/crawls-done"
    assert env["STORE_PATH"] == value
    assert env["STORE_FILENAME"] == value
    assert env["STORE_USER"] == value
    assert env["WARC_PREFIX"] == value

    secret_names = [
        entry["secretRef"]["name"]
        for entry in container["envFrom"]
        if "secretRef" in entry
    ]
    assert secret_names == [value, value]


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_profile_job_values_stay_single_scalars_when_they_contain_line_breaks(value):
    docs = _render_template(
        "profile_job.yaml",
        {
            "id": value,
            "userid": value,
            "oid": value,
            "storage_name": value,
            "crawler_image": value,
            "image_pull_policy": value,
            "url": value,
            "profile_filename": value,
            "vnc_password": value,
            "proxy_id": value,
            "crawler_channel": value,
            "base_profile": value,
            "profileid": value,
            "expire_time": value,
        },
    )

    assert len(docs) == 1
    doc = docs[0]
    assert doc["metadata"]["name"] == "profilejob-" + value
    labels = doc["metadata"]["labels"]
    assert labels["browser"] == value
    assert labels["btrix.org"] == value
    assert labels["btrix.user"] == value
    assert labels["btrix.baseprofile"] == value
    assert labels["btrix.storage"] == value
    assert labels["profileid"] == value
    assert labels["proxyid"] == value
    assert labels["crawlerChannel"] == value

    spec = doc["spec"]
    assert spec["selector"]["matchLabels"]["browser"] == value
    assert spec["id"] == value
    assert spec["userid"] == value
    assert spec["oid"] == value
    assert spec["storageName"] == value
    assert spec["crawlerImage"] == value
    assert spec["imagePullPolicy"] == value
    assert spec["startUrl"] == value
    assert spec["profileFilename"] == value
    assert spec["vncPassword"] == value
    assert spec["proxyId"] == value
    assert spec["expireTime"] == value


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_redis_values_stay_single_scalars_when_they_contain_line_breaks(value):
    docs = _render_template(
        "redis.yaml",
        {
            "no_pvc": False,
            "init_redis": True,
            "name": value,
            "namespace": value,
            "id": value,
            "obj_type": value,
            "redis_storage": "1Gi",
            "volume_storage_class": "standard",
            "redis_node_type": value,
            "priorityClassName": value,
            "redis_image": value,
            "redis_image_pull_policy": value,
            "memory_limit": "1Gi",
            "cpu": "100m",
            "memory": "512Mi",
            "save_dump": True,
            "load_dump": True,
            "use_kvrocks": False,
            "local_file_src": "dump.rdb",
            "local_file_dest": "dump.rdb",
            "remote_file_path": "bucket/key",
            "storage_secret_name": value,
            "storage_endpoint": value,
        },
    )

    assert len(docs) == 2
    pvc, pod = docs
    assert pvc["metadata"]["name"] == value
    assert pvc["metadata"]["namespace"] == value
    assert pvc["metadata"]["labels"][value] == value
    assert pvc["spec"]["storageClassName"] == "standard"

    assert pod["metadata"]["name"] == value
    assert pod["metadata"]["namespace"] == value
    assert pod["metadata"]["labels"][value] == value
    assert pod["spec"]["hostname"] == value
    assert pod["spec"]["priorityClassName"] == value

    node_values = pod["spec"]["affinity"]["nodeAffinity"][
        "preferredDuringSchedulingIgnoredDuringExecution"
    ][0]["preference"]["matchExpressions"][0]["values"]
    assert node_values == [value]

    redis_container = _container(pod, "redis")
    assert redis_container["image"] == value
    assert redis_container["imagePullPolicy"] == value

    for name in ("save", "load"):
        if name == "load":
            container = pod["spec"]["initContainers"][0]
        else:
            container = _container(pod, name)
        env = _env(container)
        assert env["RCLONE_CONFIG_REMOTE_ENDPOINT"] == value
        secret_names = [
            entry["valueFrom"]["secretKeyRef"]["name"]
            for entry in container["env"]
            if "valueFrom" in entry
        ]
        assert secret_names == [value, value, value, value]


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_background_cron_job_schedule_stays_single_scalar_when_it_contains_line_breaks(
    value,
):
    docs = _render_template(
        "background_cron_job.yaml",
        {
            "id": value,
            "job_type": value,
            "backend_image": value,
            "pull_policy": value,
            "schedule": value,
            "larger_resources": True,
        },
    )

    assert len(docs) == 1
    doc = docs[0]
    assert doc["metadata"]["name"] == value
    assert doc["metadata"]["labels"]["job_type"] == value
    assert doc["spec"]["schedule"] == value
    assert doc["spec"]["jobTemplate"]["metadata"]["labels"]["job_id"] == value
    assert doc["spec"]["jobTemplate"]["metadata"]["labels"]["job_type"] == value

    container = doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    assert container["image"] == value
    assert container["imagePullPolicy"] == value
    assert _env(container)["BG_JOB_TYPE"] == value


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_replica_job_paths_stay_single_values_when_they_contain_line_breaks(value):
    docs = _render_template(
        "replica_job.yaml",
        {
            "id": value,
            "oid": value,
            "job_type": BgJobType.CREATE_REPLICA,
            "BgJobType": BgJobType,
            "replica_secret_name": value,
            "replica_file_path": value,
            "replica_endpoint": value,
            "primary_secret_name": value,
            "primary_file_path": value,
            "primary_endpoint": value,
        },
    )

    assert len(docs) == 1
    doc = docs[0]
    assert doc["metadata"]["name"] == value
    assert doc["metadata"]["labels"]["job_type"] == BgJobType.CREATE_REPLICA.value
    assert doc["metadata"]["labels"]["btrix.org"] == value

    container = doc["spec"]["template"]["spec"]["containers"][0]
    env = _env(container)
    assert env["RCLONE_CONFIG_PRIMARY_ENDPOINT"] == value
    assert env["RCLONE_CONFIG_REPLICA_ENDPOINT"] == value
    secret_names = [
        entry["valueFrom"]["secretKeyRef"]["name"]
        for entry in container["env"]
        if "valueFrom" in entry
    ]
    assert secret_names == [value] * 8
    assert container["command"] == [
        "rclone",
        "-vv",
        "copyto",
        "--checksum",
        "--error-on-no-transfer",
        "primary:" + value,
        "replica:" + value,
    ]


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
def test_replica_deletion_cron_job_values_stay_single_scalars(value):
    docs = _render_template(
        "replica_deletion_cron_job.yaml",
        {
            "id": value,
            "oid": value,
            "job_type": BgJobType.DELETE_REPLICA,
            "BgJobType": BgJobType,
            "replica_secret_name": value,
            "replica_file_path": value,
            "replica_endpoint": value,
            "schedule": value,
        },
    )

    assert len(docs) == 1
    doc = docs[0]
    assert doc["metadata"]["name"] == value
    assert doc["spec"]["schedule"] == value

    container = doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    env = _env(container)
    assert env["RCLONE_CONFIG_REPLICA_ENDPOINT"] == value
    secret_names = [
        entry["valueFrom"]["secretKeyRef"]["name"]
        for entry in container["env"]
        if "valueFrom" in entry
    ]
    assert secret_names == [value] * 4
    assert container["command"] == [
        "rclone",
        "-vv",
        "delete",
        "replica:" + value,
    ]


@pytest.mark.parametrize("value", LINE_BREAK_VALUES)
@pytest.mark.parametrize(
    ("template", "name_prefix", "label_keys"),
    [
        ("coll_index.yaml", "collindex-", ["oid", "coll"]),
        ("crawl_configmap.yaml", "", ["crawl", "oid", "cid"]),
        ("qa_configmap.yaml", "", ["crawl"]),
        ("index-import-configmap.yaml", "", ["coll"]),
    ],
)
def test_manifest_metadata_values_stay_single_scalars(
    template, name_prefix, label_keys, value
):
    docs = _render_template(
        template,
        {
            "name": value,
            "namespace": value,
            "id": value,
            "oid": value,
            "cid": value,
            "config": '{"seeds": []}',
            "qa_source_replay_json": '{"resources": []}',
        },
    )

    assert len(docs) == 1
    doc = docs[0]
    assert doc["metadata"]["name"] == name_prefix + value
    if template != "coll_index.yaml":
        assert doc["metadata"]["namespace"] == value
    for key in label_keys:
        assert doc["metadata"]["labels"][key] == value

    if template == "coll_index.yaml":
        assert doc["spec"]["id"] == value
        assert doc["spec"]["oid"] == value
        assert doc["spec"]["selector"]["matchLabels"]["coll"] == value
