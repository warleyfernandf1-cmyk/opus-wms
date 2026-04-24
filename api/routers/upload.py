from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from datetime import datetime
import random
from api.auth.deps import get_current_user
from api.db.client import get_db

router = APIRouter()

BUCKET = "fotos-pallets"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
           "image/heic": "heic", "image/heif": "heif"}


@router.post("/foto")
async def upload_foto(
    file: UploadFile = File(...),
    tipo: str = Form("foto"),
    user: dict = Depends(get_current_user),
):
    ct = file.content_type or "image/jpeg"
    if ct not in ALLOWED_TYPES:
        raise HTTPException(400, f"Tipo de arquivo não suportado: {ct}")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Arquivo muito grande (máximo 10 MB)")

    ext = EXT_MAP.get(ct, "jpg")
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    rand = random.randint(1000, 9999)
    path = f"{tipo}/{ts}_{rand}.{ext}"

    db = get_db()
    try:
        db.storage.from_(BUCKET).upload(path, data, {"content-type": ct, "upsert": "true"})
    except Exception as e:
        raise HTTPException(500, f"Falha no upload: {e}")

    url = db.storage.from_(BUCKET).get_public_url(path)
    return {"url": url, "path": path}


@router.post("/limpar")
async def limpar_fotos(
    paths: list[str],
    user: dict = Depends(get_current_user),
):
    if not paths:
        return {"ok": True, "removidos": 0}
    db = get_db()
    try:
        db.storage.from_(BUCKET).remove(paths)
    except Exception:
        pass
    return {"ok": True, "removidos": len(paths)}
