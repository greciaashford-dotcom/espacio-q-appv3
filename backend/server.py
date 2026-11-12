"""PREVIEW-ONLY relay (mono-template pod). Not part of production.

The preview ingress of this pod sends /api/* to port 8001; this forwards those requests unchanged to the
Next.js server (NEXT_INTERNAL_URL, supervisor `frontend` on :3000). Stateless, no business logic, never starts
Next.js. In the Next.js-template project this folder is deleted (see /app/memory/DEPLOYMENT.md).
"""
import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

UPSTREAM = os.environ["NEXT_INTERNAL_URL"].rstrip("/")
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers",
    "transfer-encoding", "upgrade", "content-length", "content-encoding",
}

client = httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0), follow_redirects=False)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def relay(path: str, request: Request):
    headers = [(k, v) for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP and k.lower() != "accept-encoding"]
    host = request.headers.get("host", "")
    if "x-forwarded-host" not in request.headers and host:
        headers.append(("x-forwarded-host", host))
    if "x-forwarded-proto" not in request.headers:
        headers.append(("x-forwarded-proto", request.url.scheme))
    headers.append(("accept-encoding", "identity"))
    url = f"{UPSTREAM}/api/{path}"
    if request.url.query:
        url += f"?{request.url.query}"
    try:
        upstream = await client.request(request.method, url, headers=headers, content=await request.body())
    except httpx.HTTPError:
        return JSONResponse({"error": "Servicio no disponible temporalmente."}, status_code=502)
    out = Response(content=upstream.content, status_code=upstream.status_code)
    for k, v in upstream.headers.multi_items():
        if k.lower() not in HOP_BY_HOP:
            out.headers.append(k, v)
    return out
