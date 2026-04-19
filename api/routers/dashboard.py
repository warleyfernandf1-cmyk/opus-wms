from fastapi import APIRouter
from api.db.client import get_db

router = APIRouter()


@router.get("/kpis")
def kpis():
    db = get_db()
    pallets = db.table("pallets").select("fase").execute().data

    fase_count: dict[str, int] = {}
    for p in pallets:
        fase_count[p["fase"]] = fase_count.get(p["fase"], 0) + 1

    posicoes = db.table("posicoes_camara").select("status").execute().data
    total_pos = len([p for p in posicoes if not p.get("is_gap")])
    ocupadas  = len([p for p in posicoes if p["status"] == "ocupada"])
    reservadas= len([p for p in posicoes if p["status"] in ("reservada_oa", "reservada_picking")])

    return {
        "pallets_por_fase": fase_count,
        "total_pallets": len(pallets),
        "posicoes": {
            "total": total_pos,
            "ocupadas": ocupadas,
            "reservadas": reservadas,
            "livres": total_pos - ocupadas - reservadas,
            "ocupacao_pct": round((ocupadas / total_pos * 100) if total_pos else 0, 1),
        },
    }
