"""Phase 5: Next.js serves everything alone. Requires sims started by tester:
:8080 = `PORT=8080 NODE_ENV=production yarn start` (env from frontend/.env exported)
:8090 = same, with MONGO_URL pointing to unreachable host.
Skips if sims are not running."""
import datetime as dt
import os
import httpx
import pytest
from conftest import SVC

P = "http://localhost:8080"
DOWN = "http://localhost:8090"


def _env(path):
    out = {}
    for line in open(path):
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.strip().split("=", 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


def _up(url):
    try:
        return httpx.get(url + "/health", timeout=5).status_code
    except Exception:
        return None


@pytest.fixture(scope="module")
def prod():
    if _up(P) is None:
        pytest.skip("8080 production sim not running")
    return httpx.Client(base_url=P, timeout=20)


def test_health_and_home(prod):
    r = prod.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    h = prod.get("/")
    assert h.status_code == 200 and "<h1" in h.text


def test_api_direct(prod):
    r = prod.get("/api/openapi.json")
    assert r.status_code == 200 and "/api/v1/bookings/availability" in r.json()["paths"]
    d = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    a = prod.get("/api/v1/bookings/availability", params={"serviceId": SVC, "date": d, "professionalId": "any"})
    assert a.status_code == 200 and "slots" in a.json(), a.text[:200]


def test_cron_auth(prod):
    fe = _env("/app/frontend/.env")
    for key in ("CRON_SECRET", "WEBHOOK_CRON_SECRET"):
        r = prod.post("/api/internal/jobs", headers={"Authorization": f"Bearer {fe[key]}"})
        assert 200 <= r.status_code < 300, (key, r.status_code)
    be = _env("/app/backend/.env").get("WEBHOOK_CRON_SECRET")
    if be:
        assert 200 <= prod.post("/api/internal/jobs", headers={"Authorization": f"Bearer {be}"}).status_code < 300
    assert prod.post("/api/internal/jobs").status_code == 401


def test_db_down():
    if _up(DOWN) is None:
        pytest.skip("8090 db-down sim not running")
    c = httpx.Client(base_url=DOWN, timeout=40)
    assert c.get("/health").status_code == 200
    d = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    r = c.get("/api/v1/bookings/availability", params={"serviceId": SVC, "date": d, "professionalId": "any"})
    assert r.status_code == 503, r.text[:200]
    assert r.json() == {"error": "Base de datos no disponible temporalmente."}
    assert "at " not in r.text and "Error:" not in r.text
