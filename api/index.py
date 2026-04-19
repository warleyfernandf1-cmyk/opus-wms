from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from api.routers import (
    recepcao, resfriamento, armazenamento, remontes,
    picking, expedicao, inventario, dashboard,
    relatorios, camaras, tuneis, historico,
)

app = FastAPI(title="Opus WMS", version="1.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recepcao.router,     prefix="/api/recepcao",     tags=["Recepção"])
app.include_router(resfriamento.router, prefix="/api/resfriamento", tags=["Resfriamento"])
app.include_router(armazenamento.router,prefix="/api/armazenamento",tags=["Armazenamento"])
app.include_router(remontes.router,     prefix="/api/remontes",     tags=["Remontes"])
app.include_router(picking.router,      prefix="/api/picking",      tags=["Picking"])
app.include_router(expedicao.router,    prefix="/api/expedicao",    tags=["Expedição"])
app.include_router(inventario.router,   prefix="/api/inventario",   tags=["Inventário"])
app.include_router(dashboard.router,    prefix="/api/dashboard",    tags=["Dashboard"])
app.include_router(relatorios.router,   prefix="/api/relatorios",   tags=["Relatórios"])
app.include_router(camaras.router,      prefix="/api/camaras",      tags=["Câmaras"])
app.include_router(tuneis.router,       prefix="/api/tuneis",       tags=["Túneis"])
app.include_router(historico.router,    prefix="/api/historico",    tags=["Histórico"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Opus WMS"}
