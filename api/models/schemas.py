from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional, Literal, Any
from datetime import date, datetime
import re
import uuid

# ---------------------------------------------------------------------------
# Rastreabilidade proporcional — Área / Controle
# ---------------------------------------------------------------------------

class AreaControleItem(BaseModel):
    area: str = Field(..., min_length=1)
    controle: str = Field(..., min_length=1)
    qtd_caixas: int = Field(..., ge=1)

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
    areas_controles: list[AreaControleItem] = Field(..., min_length=1)
    mercado: str
    temp_entrada: float
    tunel: Literal["01", "02"]
    boca: int = Field(..., ge=1, le=12)
    foto_temp_entrada:   Optional[str] = None
    foto_espelho:        Optional[str] = None
    foto_pallet_entrada: Optional[str] = None

    @field_validator('variedade')
    @classmethod
    def normalize_variedade(cls, v: str) -> str:
        """
        Normaliza o campo variedade independente do separador recebido.
        Aceita: "ARRA 15", "ARRA 15 | BEBOP", "ARRA 15|BEBOP", "ARRA 15, BEBOP"
        Saída:  "ARRA 15 | BEBOP"
        """
        partes = [p.strip() for p in re.split(r'\s*[|,;]\s*', v) if p.strip()]
        seen: set = set()
        dedup = [p for p in partes if not (p in seen or seen.add(p))]  # type: ignore[func-returns-value]
        return ' | '.join(dedup)

    @model_validator(mode='after')
    def validar_distribuicao_caixas(self) -> 'PalletCreate':
        total_distribuido = sum(item.qtd_caixas for item in self.areas_controles)
        if total_distribuido != self.qtd_caixas:
            raise ValueError(
                f"Soma das caixas por área/controle ({total_distribuido}) "
                f"deve ser igual ao total de caixas ({self.qtd_caixas})."
            )
        return self

class PalletOut(BaseModel):
    id: str
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
    areas_controles: Optional[list[AreaControleItem]] = None
    area: Optional[str] = None
    controle: Optional[str] = None
    mercado: str
    temp_entrada: float
    tunel: str
    boca: int
    fase: FasePallet
    temp_saida: Optional[float] = None
    camara: Optional[str] = None
    rua: Optional[int] = None
    posicao: Optional[int] = None
    is_adicao: bool = False
    sessao_id: Optional[str] = None
    foto_temp_entrada:   Optional[str] = None
    foto_espelho:        Optional[str] = None
    foto_pallet_entrada: Optional[str] = None
    foto_temp_saida:     Optional[str] = None
    created_at: datetime
    updated_at: datetime

class PalletUpdate(BaseModel):
    nro_pallet:       Optional[str]   = None
    qtd_caixas:       Optional[int]   = None
    data_embalamento: Optional[date]  = None
    variedade:        Optional[str]   = None
    classificacao:    Optional[str]   = None
    safra:            Optional[str]   = None
    embalagem:        Optional[str]   = None
    rotulo:           Optional[str]   = None
    produtor:         Optional[str]   = None
    caixa:            Optional[str]   = None
    peso:             Optional[float] = None
    areas_controles:  Optional[list[AreaControleItem]] = None
    mercado:          Optional[str]   = None
    temp_entrada:     Optional[float] = None
    tunel:            Optional[Literal["01", "02"]] = None
    boca:             Optional[int]   = Field(None, ge=1, le=12)

    @model_validator(mode='after')
    def validar_areas(self) -> 'PalletUpdate':
        if self.areas_controles is not None and self.qtd_caixas is not None:
            total = sum(item.qtd_caixas for item in self.areas_controles)
            if total != self.qtd_caixas:
                raise ValueError(
                    f"Soma das caixas por área ({total}) deve ser igual ao total ({self.qtd_caixas})."
                )
        return self

# ---------------------------------------------------------------------------
# Resfriamento
# ---------------------------------------------------------------------------

class SessaoCreate(BaseModel):
    tunel: Literal["01", "02"]

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
    foto_temp_saida: Optional[str] = None

# ---------------------------------------------------------------------------
# OA — Destino por pallet (NOVO)
# ---------------------------------------------------------------------------

class DestinoAlocarItem(BaseModel):
    """Destino de um pallet específico dentro de uma OA."""
    pallet_id: str
    camara: Literal["01", "02"]
    rua: int = Field(..., ge=1, le=13)
    posicao: int = Field(..., ge=1, le=6)

class CriarOAIn(BaseModel):
    pallet_ids: list[str]
    sessao_id: Optional[str] = None
    destinos: Optional[list[DestinoAlocarItem]] = None  # mapeamento pallet→posição

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
