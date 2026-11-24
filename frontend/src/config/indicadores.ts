/**
 * Catálogo semántico y utilidades de formateo para indicadores oficiales del INE Guatemala.
 */

export type DominioIndicador = 'vitales' | 'transito'
export type ModoAgregacion = 'sum' | 'avg'

export interface IndicadorMeta {
  codigo: string
  nombre: string
  nombreCorto: string
  dominio: DominioIndicador
  unidadEtiqueta: string
  unidadCorta: string
  agregacion: ModoAgregacion
  decimales: number
}

export const ANIOS_DISPONIBLES: readonly number[] = [2021, 2022, 2023, 2024, 2025]
export const ANIO_POR_DEFECTO = 2025
export const ANIO_BASE_COMPARACION = 2021

export const CATALOGO_INDICADORES: readonly IndicadorMeta[] = [
  // Estadísticas Vitales
  {
    codigo: 'defunciones_total',
    nombre: 'Defunciones totales',
    nombreCorto: 'Defunciones',
    dominio: 'vitales',
    unidadEtiqueta: 'casos registrados',
    unidadCorta: 'casos',
    agregacion: 'sum',
    decimales: 0,
  },
  {
    codigo: 'defunciones_fetales_total',
    nombre: 'Defunciones fetales',
    nombreCorto: 'Defunciones fetales',
    dominio: 'vitales',
    unidadEtiqueta: 'casos registrados',
    unidadCorta: 'casos',
    agregacion: 'sum',
    decimales: 0,
  },
  // Hechos de Tránsito
  {
    codigo: 'accidentes_transito_total',
    nombre: 'Accidentes de tránsito',
    nombreCorto: 'Accidentes',
    dominio: 'transito',
    unidadEtiqueta: 'hechos registrados',
    unidadCorta: 'casos',
    agregacion: 'sum',
    decimales: 0,
  },
  {
    codigo: 'victimas_transito_total',
    nombre: 'Víctimas en hechos de tránsito',
    nombreCorto: 'Víctimas tránsito',
    dominio: 'transito',
    unidadEtiqueta: 'personas',
    unidadCorta: 'casos',
    agregacion: 'sum',
    decimales: 0,
  },
  {
    codigo: 'lesionados_transito_total',
    nombre: 'Lesionados en hechos de tránsito',
    nombreCorto: 'Lesionados',
    dominio: 'transito',
    unidadEtiqueta: 'personas',
    unidadCorta: 'casos',
    agregacion: 'sum',
    decimales: 0,
  },
  {
    codigo: 'fallecidos_transito_total',
    nombre: 'Fallecidos en hechos de tránsito',
    nombreCorto: 'Fallecidos tránsito',
    dominio: 'transito',
    unidadEtiqueta: 'personas',
    unidadCorta: 'casos',
    agregacion: 'sum',
    decimales: 0,
  },
  {
    codigo: 'tasa_fallecidos_transito_100k',
    nombre: 'Tasa de fallecidos en tránsito (por 100 mil hab.)',
    nombreCorto: 'Tasa fallecidos / 100k',
    dominio: 'transito',
    unidadEtiqueta: 'por 100 mil habitantes',
    unidadCorta: 'por 100k hab.',
    agregacion: 'avg',
    decimales: 2,
  },
] as const

export const GRUPOS_INDICADORES: ReadonlyArray<{
  dominio: DominioIndicador
  etiqueta: string
  items: IndicadorMeta[]
}> = [
  {
    dominio: 'vitales',
    etiqueta: 'Estadísticas Vitales',
    items: CATALOGO_INDICADORES.filter((item) => item.dominio === 'vitales'),
  },
  {
    dominio: 'transito',
    etiqueta: 'Hechos de Tránsito',
    items: CATALOGO_INDICADORES.filter((item) => item.dominio === 'transito'),
  },
]

const MAPA_INDICADORES = new Map<string, IndicadorMeta>(
  CATALOGO_INDICADORES.map((item) => [item.codigo, item]),
)

/** Obtiene metadatos semánticos del indicador, con fallback seguro. */
export function obtenerMetaIndicador(
  codigo: string,
  unidad?: string,
  dominio?: string,
): IndicadorMeta {
  const encontrado = MAPA_INDICADORES.get(codigo)
  if (encontrado) {
    return encontrado
  }

  const esTasa =
    codigo.startsWith('tasa_') || (unidad ?? '').toLowerCase().includes('tasa')

  return {
    codigo,
    nombre: codigo.replace(/_/g, ' '),
    nombreCorto: codigo.replace(/_/g, ' '),
    dominio: dominio === 'vitales' ? 'vitales' : 'transito',
    unidadEtiqueta: unidad || (esTasa ? 'tasa' : 'casos'),
    unidadCorta: unidad || (esTasa ? 'tasa' : 'casos'),
    agregacion: esTasa ? 'avg' : 'sum',
    decimales: esTasa ? 2 : 0,
  }
}

/** Formatea valores numéricos respetando precisión por tipo de indicador. */
export function formatearValor(valor: number, decimales = 0): string {
  return new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor)
}

/** Formatea valores compactos para ejes de gráficas (ej. 12.5k). */
export function formatearEjeCompacto(valor: number, decimales = 0): string {
  if (decimales > 0) {
    return new Intl.NumberFormat('es-GT', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimales,
    }).format(valor)
  }
  if (Math.abs(valor) >= 1000) {
    return `${new Intl.NumberFormat('es-GT', {
      maximumFractionDigits: 1,
    }).format(valor / 1000)}k`
  }
  return new Intl.NumberFormat('es-GT', {
    maximumFractionDigits: 0,
  }).format(valor)
}

/** Formatea variaciones porcentuales con signo explícito. */
export function formatearVariacion(porcentaje: number | null): string {
  if (porcentaje === null || Number.isNaN(porcentaje) || !Number.isFinite(porcentaje)) {
    return 'N/D'
  }
  const signo = porcentaje > 0 ? '+' : ''
  return `${signo}${new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(porcentaje)}%`
}

/** Normaliza texto eliminando tildes y mayúsculas para búsqueda departamental. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
