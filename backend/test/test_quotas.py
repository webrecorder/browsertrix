import uuid
from btrixcloud.models import Organization, StorageRef, OrgQuotas
from btrixcloud.orgs import BaseOrgs
from btrixcloud.utils import dt_now

orgs = BaseOrgs()


def get_org(quotas: OrgQuotas, monthly=None, **kwargs):
    monthlyExecSeconds = {}
    if monthly:
        yymm = dt_now().strftime("%Y-%m")
        monthlyExecSeconds[yymm] = monthly * 60

    return Organization(
        id=uuid.uuid4(),
        name="Test Organization",
        slug="test-org",
        storage=StorageRef(name="test-storage"),
        quotas=quotas,
        monthlyExecSeconds=monthlyExecSeconds,
        **kwargs
    )


def test_quotas_no_quotas():
    org = get_org(OrgQuotas())
    assert orgs.exec_mins_quota_reached(org) == False
    assert orgs.storage_quota_reached(org) == False

    # explicitly set
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=0, extraExecMinutes=0, giftedExecMinutes=0),
        monthly=0,
        extraExecSecondsAvailable=0,
        giftedExecSecondsAvailable=0,
    )
    assert orgs.exec_mins_quota_reached(org) == False


def test_quotas_gifted_mins_only():
    # quota not reached
    org = get_org(OrgQuotas(giftedExecMinutes=2), giftedExecSecondsAvailable=2 * 60)
    assert orgs.exec_mins_quota_reached(org) == False

    org = get_org(OrgQuotas(giftedExecMinutes=2), giftedExecSecondsAvailable=1 * 60)
    assert orgs.exec_mins_quota_reached(org) == False

    # quota reached
    org = get_org(OrgQuotas(giftedExecMinutes=2), giftedExecSecondsAvailable=0)
    assert orgs.exec_mins_quota_reached(org) == True


def test_quotas_extra_mins_only():
    # quota not reached
    org = get_org(OrgQuotas(extraExecMinutes=2), extraExecSecondsAvailable=2 * 60)
    assert orgs.exec_mins_quota_reached(org) == False

    org = get_org(OrgQuotas(extraExecMinutes=2), extraExecSecondsAvailable=1 * 60)
    assert orgs.exec_mins_quota_reached(org) == False

    # quota reached
    org = get_org(OrgQuotas(extraExecMinutes=2), extraExecSecondsAvailable=0)
    assert orgs.exec_mins_quota_reached(org) == True


def test_quotas_extra_and_gifted_mins_only():
    # quota not reached
    org = get_org(
        OrgQuotas(extraExecMinutes=2, giftedExecMinutes=1),
        extraExecSecondsAvailable=2 * 60,
        giftedExecSecondsAvailable=0 * 60,
    )
    assert orgs.exec_mins_quota_reached(org) == False

    org = get_org(
        OrgQuotas(extraExecMinutes=2, giftedExecMinutes=1),
        extraExecSecondsAvailable=1 * 60,
        giftedExecSecondsAvailable=1 * 60,
    )
    assert orgs.exec_mins_quota_reached(org) == False

    # quota reached
    org = get_org(
        OrgQuotas(extraExecMinutes=2, giftedExecMinutes=1),
        extraExecSecondsAvailable=0 * 60,
        giftedExecSecondsAvailable=0 * 60,
    )
    assert orgs.exec_mins_quota_reached(org) == True


def test_monthly_quotas():
    # quota not reached
    org = get_org(OrgQuotas(maxExecMinutesPerMonth=10), monthly=5)
    assert orgs.exec_mins_quota_reached(org) == False

    # quota reached
    org = get_org(OrgQuotas(maxExecMinutesPerMonth=10), monthly=10)
    assert orgs.exec_mins_quota_reached(org) == True


def test_monthly_and_extra():
    # quota not reached - monthly reached, but not extra
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=10, extraExecMinutes=2),
        monthly=10,
        extraExecSecondsAvailable=2 * 60,
    )
    assert orgs.exec_mins_quota_reached(org) == False

    # quota not reached - monthly not reached, but extra reached
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=10, extraExecMinutes=2),
        monthly=5,
        extraExecSecondsAvailable=0,
    )
    assert orgs.exec_mins_quota_reached(org) == False

    # quota reached: both monthly and extra
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=10, extraExecMinutes=2),
        monthly=10,
        extraExecSecondsAvailable=0,
    )
    assert orgs.exec_mins_quota_reached(org) == True


def test_all_exec_quotas():
    # quota not reached: both monthly and extra reached, but not gifted
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=10, extraExecMinutes=2, giftedExecMinutes=5),
        monthly=10,
        extraExecSecondsAvailable=0,
        giftedExecSecondsAvailable=3 * 60,
    )
    assert orgs.exec_mins_quota_reached(org) == False

    # quota not reached: monthly still available
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=10, extraExecMinutes=2, giftedExecMinutes=5),
        monthly=9,
        extraExecSecondsAvailable=0,
        giftedExecSecondsAvailable=0,
    )
    assert orgs.exec_mins_quota_reached(org) == False

    # quota reached: all quotas reached
    org = get_org(
        OrgQuotas(maxExecMinutesPerMonth=10, extraExecMinutes=2, giftedExecMinutes=5),
        monthly=10,
        extraExecSecondsAvailable=0,
        giftedExecSecondsAvailable=0,
    )
    assert orgs.exec_mins_quota_reached(org) == True


def test_storage_quotas():
    # quota not reached: no quota
    org = get_org(OrgQuotas(storageQuota=0), bytesStored=99999)
    assert orgs.storage_quota_reached(org) == False

    # quota not reached: < quota
    org = get_org(OrgQuotas(storageQuota=100000), bytesStored=99999)
    assert orgs.storage_quota_reached(org) == False

    # quota not reached: < quota with extra bytes
    org = get_org(OrgQuotas(storageQuota=100000), bytesStored=50000)
    assert orgs.storage_quota_reached(org, 20000) == False

    # quota reached: == quota
    org = get_org(OrgQuotas(storageQuota=100000), bytesStored=100000)
    assert orgs.storage_quota_reached(org) == True

    # quota reached: > quota
    org = get_org(OrgQuotas(storageQuota=100000), bytesStored=120000)
    assert orgs.storage_quota_reached(org) == True

    # quota reached: > quota with extra bytes
    org = get_org(OrgQuotas(storageQuota=100000), bytesStored=50000)
    assert orgs.storage_quota_reached(org, 60000) == True
