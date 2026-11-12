# ESPACIO Q Phase 5 — deploy behaviour on preview (health, openapi, cron auth, SEO files, asset 200s, no 8001 refs)
import os
import re
import pytest
import requests


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "APP_URL")).rstrip("/")
CRON_SECRET = _env("/app/frontend/.env", "CRON_SECRET")


# Health endpoint served by Next.js
def test_health():
    r = requests.get(f"{BASE_URL}/health", timeout=30)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# OpenAPI JSON via relay
def test_openapi_json():
    r = requests.get(f"{BASE_URL}/api/openapi.json", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "paths" in d and len(d["paths"]) > 0


# Cron endpoint auth
def test_cron_no_token_401():
    r = requests.post(f"{BASE_URL}/api/internal/jobs", timeout=60)
    assert r.status_code == 401


def test_cron_wrong_token_401():
    r = requests.post(f"{BASE_URL}/api/internal/jobs", headers={"Authorization": "Bearer nope"}, timeout=60)
    assert r.status_code == 401


def test_cron_with_secret_200():
    r = requests.post(f"{BASE_URL}/api/internal/jobs", headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True and isinstance(d.get("jobStats"), dict)
    assert "processedJobs" in d["jobStats"]


# Static SEO / PWA files
@pytest.mark.parametrize("path,ctype", [
    ("/robots.txt", "text/plain"),
    ("/sitemap.xml", "xml"),
    ("/llms.txt", "text/"),
    ("/manifest.webmanifest", "json"),
    ("/favicon.ico", "image/"),
])
def test_static_files(path, ctype):
    r = requests.get(f"{BASE_URL}{path}", timeout=30)
    assert r.status_code == 200, path
    assert ctype in r.headers.get("content-type", ""), (path, r.headers.get("content-type"))
    assert len(r.content) > 0


# Every CSS/JS/font/icon asset referenced by key pages answers 200
@pytest.mark.parametrize("page", ["/", "/servicios", "/contacto", "/acceso", "/preguntas-frecuentes", "/reservar"])
def test_page_assets_200(page):
    r = requests.get(f"{BASE_URL}{page}", timeout=60)
    assert r.status_code == 200, page
    html = r.text
    refs = set(re.findall(r'(?:href|src)="(/[^"]+?\.(?:css|js|woff2?|ttf|ico|png|svg|webmanifest|jpg|webp)(?:\?[^"]*)?)"', html))
    refs |= set(re.findall(r'"(/_next/static/[^"\\]+)"', html))
    assert refs, page
    bad = []
    s = requests.Session()
    for ref in sorted(refs):
        rr = s.get(f"{BASE_URL}{ref}", timeout=30)
        if rr.status_code != 200:
            bad.append((ref, rr.status_code))
    assert not bad, bad


# Unknown /api route answered by Next (not FastAPI) with JSON 404
def test_unknown_api_404():
    r = requests.get(f"{BASE_URL}/api/v1/does-not-exist", timeout=30)
    assert r.status_code == 404
