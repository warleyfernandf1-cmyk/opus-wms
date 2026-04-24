from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from api.routers import (
    recepcao, resfriamento, armazenamento, remontes,
    picking, expedicao, inventario, dashboard,
    relatorios, camaras, tuneis, historico, auth, upload,
)
from api.auth.deps import get_current_user

app = FastAPI(title="Opus WMS", version="1.0.0", docs_url="/api/docs")

_ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS",
    "https://opus-wms.vercel.app,http://localhost:8000",
).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Auth — sem proteção (login é público)
app.include_router(auth.router,         prefix="/api/auth",         tags=["Auth"])

# Todos os demais routers exigem JWT válido
_auth = [Depends(get_current_user)]
app.include_router(recepcao.router,     prefix="/api/recepcao",     tags=["Recepção"],      dependencies=_auth)
app.include_router(resfriamento.router, prefix="/api/resfriamento", tags=["Resfriamento"],  dependencies=_auth)
app.include_router(armazenamento.router,prefix="/api/armazenamento",tags=["Armazenamento"], dependencies=_auth)
app.include_router(remontes.router,     prefix="/api/remontes",     tags=["Remontes"],      dependencies=_auth)
app.include_router(picking.router,      prefix="/api/picking",      tags=["Picking"],       dependencies=_auth)
app.include_router(expedicao.router,    prefix="/api/expedicao",    tags=["Expedição"],     dependencies=_auth)
app.include_router(inventario.router,   prefix="/api/inventario",   tags=["Inventário"],    dependencies=_auth)
app.include_router(dashboard.router,    prefix="/api/dashboard",    tags=["Dashboard"],     dependencies=_auth)
app.include_router(relatorios.router,   prefix="/api/relatorios",   tags=["Relatórios"],    dependencies=_auth)
app.include_router(camaras.router,      prefix="/api/camaras",      tags=["Câmaras"],       dependencies=_auth)
app.include_router(tuneis.router,       prefix="/api/tuneis",       tags=["Túneis"],        dependencies=_auth)
app.include_router(historico.router,    prefix="/api/historico",    tags=["Histórico"],     dependencies=_auth)
app.include_router(upload.router,       prefix="/api/upload",       tags=["Upload"],         dependencies=_auth)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Opus WMS"}
