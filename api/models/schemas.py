from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from datetime import date, datetime
import uuid

# ---------------------------------------------------------------------------
# Pallet
# ---------------------------------------------------------------------------

FasePallet = Literal["recepcao", "resfriamento", "armazenamento", "picking", "expedido"]

class PalletCreate(BaseModel):
    nro_pallet: str
    qtd_caixas: int
    data_embalamento: date
    variedade: str
    classificacao: str
    safra: str
    embalagem: str
    rotulo: str
    produtor: str
    caixa: str
    peso: float
    area: str
    controle: str
    mercado: str
    temp_entrada: float
    tunel: Literal["01", "02"]
    boca: int = Field(..., ge=1, le=12)

class PalletOut(PalletCreate):
    id: str
    fase: FasePallet
    temp_saida: Optional[float] = None
    camara: Optional[str] = None
    rua: Optional[int] = None
    posicao: Optional[int] = None
    is_adicao: bool = False
    created_at: datetime
    updated_at: datetime

# ---------------------------------------------------------------------------
# Resfriamento
# ---------------------------------------------------------------------------

class SessaoCreate(BaseModel):
    tunel: Literal["01", "02"]

class SessaoFinalizar(BaseModel):
    temp_saida: float

class SessaoOut(BaseModel):
    id: str
    tunel: str
    iniciado_em: datetime
    finalizado_em: Optional[datetime] = None
    temp_saida: Optional[float] = None
    oa_id: Optional[str] = None
    status: Literal["ativa", "finalizada"]

class SalvarTempPalletIn(BaseModel):
    temp_polpa: float
    observacao: Optional[str] = None
    sessao_id: Optional[str] = None

class CriarOAIn(BaseModel):
    pallet_ids: list[str]
    sessao_id: Optional[str] = None

# ---------------------------------------------------------------------------
# Armazenamento
# ---------------------------------------------------------------------------

class AlocarPalletIn(BaseModel):
    pallet_id: str
    camara: Literal["01", "02"]
    rua: int = Field(..., ge=1, le=13)
    posicao: int = Field(..., ge=1, le=6)

class PosicaoOut(BaseModel):
    id: str
    camara: str
    tipo: Literal["rua", "corredor"]
    rua: int
    posicao: int
    status: Literal["livre", "ocupada", "reservada_oa", "reservada_picking"]
    pallet_id: Optional[str] = None
    reserva_id: Optional[str] = None
    is_gap: bool = False

# ---------------------------------------------------------------------------
# Remontes
# ---------------------------------------------------------------------------

class RemontComplementacao(BaseModel):
    pallet_original_id: str
    pallet_adicao_id: str

class RemontJuncao(BaseModel):
    pallet_id_1: str
    pallet_id_2: str

# ---------------------------------------------------------------------------
# Picking
# ---------------------------------------------------------------------------

class OrdemPickingCreate(BaseModel):
    pallet_ids: list[str]
    observacoes: Optional[str] = None

class OrdemPickingOut(BaseModel):
    id: str
    pallet_ids: list[str]
    status: Literal["pendente", "executada", "cancelada"]
    criada_em: datetime
    executada_em: Optional[datetime] = None
    observacoes: Optional[str] = None

# ---------------------------------------------------------------------------
# Expedição
# ---------------------------------------------------------------------------

class OrdemExpedicaoCreate(BaseModel):
    pallet_ids: list[str]

class OrdemExpedicaoOut(BaseModel):
    id: str
    pallet_ids: list[str]
    status: Literal["pendente", "executada"]
    criada_em: datetime
    executada_em: Optional[datetime] = None

# ---------------------------------------------------------------------------
# Inventário
# ---------------------------------------------------------------------------

class InventarioItemRegistro(BaseModel):
    pallet_id: str
    qtd_contada: int

class InventarioOut(BaseModel):
    id: str
    status: Literal["em_andamento", "finalizado"]
    iniciado_em: datetime
    finalizado_em: Optional[datetime] = None
    acuracidade: Optional[float] = None

# ---------------------------------------------------------------------------
# Histórico
# ---------------------------------------------------------------------------

class HistoricoOut(BaseModel):
    id: str
    pallet_id: Optional[str] = None
    acao: str
    fase_anterior: Optional[str] = None
    fase_nova: Optional[str] = None
    dados: Optional[dict[str, Any]] = None
    usuario: Optional[str] = None
    created_at: datetime

# ---------------------------------------------------------------------------
# Relatório
# ---------------------------------------------------------------------------

class RelatorioOut(BaseModel):
    id: str
    modulo: str
    titulo: str
    dados: Optional[dict[str, Any]] = None
    inicio_execucao: Optional[datetime] = None
    fim_execucao: Optional[datetime] = None
    tempo_medio_s: Optional[float] = None
    created_at: datetime
