import { geoMercator, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { RotateCcw } from 'lucide-react'
import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { IndicadorOut } from '../api/client'
import {
  ANIO_BASE_COMPARACION,
  formatearValor,
  formatearVariacion,
  normalizarBusqueda,
  type IndicadorMeta,
} from '../config/indicadores'
import guatemalaRaw from '../data/guatemala-departamentos.geo.json'

interface DeptoGeoProperties {
  depto_cod?: string
  nombre?: string
  shapeName?: string
  iso?: string
}

type DeptoFeature = Feature<Geometry, DeptoGeoProperties>
type GuatemalaGeoCollection = FeatureCollection<Geometry, DeptoGeoProperties>

export interface MapaGuatemalaProps {
  datos: IndicadorOut[]
  mapaBase2021: Map<string, number>
  meta: IndicadorMeta
  anio: number
  deptoSeleccionado: string | null
  onSeleccionarDepto: (deptoCod: string) => void
  onRestablecerNacional?: () => void
  deptosCoincidentes?: Set<string> | null
  fuenteOficial: string
  cargando?: boolean
  /** Elemento opcional en la cabecera (ej. selector Mapa / Top 10). */
  selectorVista?: ReactNode
}

interface DeptoRenderItem {
  deptoCod: string
  nombre: string
  pathD: string
}

interface TooltipState {
  deptoCod: string
  nombre: string
  x: number
  y: number
  containerWidth: number
  containerHeight: number
}

const VIEWBOX_WIDTH = 460
const VIEWBOX_HEIGHT = 480
const MAP_PADDING = 12

/** Respaldo oficial de nombres normalizados a código departamental INE (01–22). */
const CODIGO_POR_NOMBRE_NORM: Readonly<Record<string, string>> = {
  guatemala: '01',
  'el progreso': '02',
  sacatepequez: '03',
  chimaltenango: '04',
  escuintla: '05',
  'santa rosa': '06',
  solola: '07',
  totonicapan: '08',
  quetzaltenango: '09',
  suchitepequez: '10',
  retalhuleu: '11',
  'san marcos': '12',
  huehuetenango: '13',
  quiche: '14',
  'baja verapaz': '15',
  'alta verapaz': '16',
  peten: '17',
  izabal: '18',
  zacapa: '19',
  chiquimula: '20',
  jalapa: '21',
  jutiapa: '22',
}

/** Escala secuencial institucional INE: #E6F0FA (bajo) -> #003876 (alto). */
const ESCALA_INE_STOPS: ReadonlyArray<{
  pos: number
  rgb: readonly [number, number, number]
}> = [
  { pos: 0, rgb: [230, 240, 250] }, // #E6F0FA
  { pos: 0.33, rgb: [140, 184, 232] }, // #8CB8E8
  { pos: 0.66, rgb: [27, 100, 176] }, // #1B64B0
  { pos: 1, rgb: [0, 56, 118] }, // #003876
]

const COLOR_SIN_DATO = '#F4F6F8'

function interpolarColorINE(tRaw: number): string {
  const t = Math.max(0, Math.min(1, tRaw))
  for (let i = 0; i < ESCALA_INE_STOPS.length - 1; i++) {
    const inicio = ESCALA_INE_STOPS[i]
    const fin = ESCALA_INE_STOPS[i + 1]
    if (t >= inicio.pos && t <= fin.pos) {
      const localT = (t - inicio.pos) / (fin.pos - inicio.pos)
      const r = Math.round(inicio.rgb[0] + (fin.rgb[0] - inicio.rgb[0]) * localT)
      const g = Math.round(inicio.rgb[1] + (fin.rgb[1] - inicio.rgb[1]) * localT)
      const b = Math.round(inicio.rgb[2] + (fin.rgb[2] - inicio.rgb[2]) * localT)
      return `rgb(${r}, ${g}, ${b})`
    }
  }
  return '#003876'
}

function resolverCodigoDepto(props: DeptoGeoProperties | null | undefined): string {
  if (!props) return ''
  if (props.depto_cod) {
    return props.depto_cod.trim().padStart(2, '0')
  }
  const nombreRaw = props.nombre || props.shapeName || ''
  return CODIGO_POR_NOMBRE_NORM[normalizarBusqueda(nombreRaw)] ?? ''
}

export function MapaGuatemala({
  datos,
  mapaBase2021,
  meta,
  anio,
  deptoSeleccionado,
  onSeleccionarDepto,
  onRestablecerNacional,
  deptosCoincidentes = null,
  fuenteOficial,
  cargando = false,
  selectorVista,
}: MapaGuatemalaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Proyección Mercator ajustada al ViewBox del SVG (cálculo único en memoria)
  const departamentosGeo = useMemo<DeptoRenderItem[]>(() => {
    const coleccion = guatemalaRaw as unknown as GuatemalaGeoCollection
    const proyeccion = geoMercator().fitSize(
      [VIEWBOX_WIDTH - MAP_PADDING * 2, VIEWBOX_HEIGHT - MAP_PADDING * 2],
      coleccion,
    )
    const generadorPath = geoPath(proyeccion)

    return coleccion.features
      .map((feature: DeptoFeature) => {
        const deptoCod = resolverCodigoDepto(feature.properties)
        const nombre =
          feature.properties?.nombre ||
          feature.properties?.shapeName ||
          `Depto ${deptoCod}`
        const pathD = generadorPath(feature) ?? ''
        return { deptoCod, nombre, pathD }
      })
      .filter((item) => Boolean(item.deptoCod && item.pathD))
  }, [])

  // Índice rápido de registros por código departamental y rango min/max
  const { mapaRegistros, minValor, maxValor, haySinDato } = useMemo(() => {
    const mapa = new Map<string, IndicadorOut>()
    let min = Infinity
    let max = -Infinity

    for (const item of datos) {
      const cod = item.depto_cod.trim().padStart(2, '0')
      mapa.set(cod, item)
      if (item.valor < min) min = item.valor
      if (item.valor > max) max = item.valor
    }

    const tieneDatos = min !== Infinity && max !== -Infinity
    const faltantes = departamentosGeo.some((d) => !mapa.has(d.deptoCod))

    return {
      mapaRegistros: mapa,
      minValor: tieneDatos ? min : null,
      maxValor: tieneDatos ? max : null,
      haySinDato: faltantes,
    }
  }, [datos, departamentosGeo])

  const obtenerColorRelleno = (deptoCod: string): string => {
    const reg = mapaRegistros.get(deptoCod)
    if (!reg || minValor === null || maxValor === null) {
      return COLOR_SIN_DATO
    }
    if (maxValor === minValor) {
      return '#1B64B0'
    }
    const t = (reg.valor - minValor) / (maxValor - minValor)
    return interpolarColorINE(t)
  }

  const deptoSeleccionadoGeo = useMemo(
    () =>
      deptoSeleccionado
        ? departamentosGeo.find((d) => d.deptoCod === deptoSeleccionado) ?? null
        : null,
    [departamentosGeo, deptoSeleccionado],
  )

  const deptoHoverGeo = useMemo(
    () =>
      tooltip
        ? departamentosGeo.find((d) => d.deptoCod === tooltip.deptoCod) ?? null
        : null,
    [departamentosGeo, tooltip],
  )

  const actualizarTooltip = (
    event: MouseEvent<SVGPathElement>,
    item: DeptoRenderItem,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      deptoCod: item.deptoCod,
      nombre: mapaRegistros.get(item.deptoCod)?.departamento || item.nombre,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      containerWidth: rect.width,
      containerHeight: rect.height,
    })
  }

  // Datos enriquecidos para el tooltip flotante activo
  const infoTooltip = useMemo(() => {
    if (!tooltip) return null
    const reg = mapaRegistros.get(tooltip.deptoCod) ?? null
    const valor = reg ? reg.valor : null
    const valor2021 = mapaBase2021.get(tooltip.deptoCod) ?? null

    let variacionVs2021: number | null = null
    if (valor !== null && valor2021 !== null && valor2021 !== 0) {
      variacionVs2021 = ((valor - valor2021) / valor2021) * 100
    }

    const estaSeleccionado = deptoSeleccionado === tooltip.deptoCod
    const abrirIzquierda = tooltip.x > tooltip.containerWidth * 0.6
    const abrirArriba = tooltip.y > tooltip.containerHeight * 0.72

    return {
      ...tooltip,
      valor,
      variacionVs2021,
      estaSeleccionado,
      abrirIzquierda,
      abrirArriba,
    }
  }, [tooltip, mapaRegistros, mapaBase2021, deptoSeleccionado])

  return (
    <section className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      {/* Encabezado limpio + badge de año / selector de vista */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-[#003876]">
              Mapa territorial · {anio}
            </h2>
            <span className="rounded-full bg-[#FFD100] px-2.5 py-0.5 text-xs font-semibold text-[#003876] tabular-nums">
              {anio}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#475569]">
            {meta.nombre} ({meta.unidadEtiqueta}). Haz clic en un departamento para explorar su tendencia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {deptoSeleccionadoGeo && onRestablecerNacional && (
            <button
              type="button"
              onClick={onRestablecerNacional}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F4F6F8] px-2.5 py-1 text-xs font-medium text-[#003876] transition-colors hover:border-[#003876]/30 hover:bg-slate-100"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Nacional</span>
            </button>
          )}
          {selectorVista}
        </div>
      </div>

      {/* Lienzo del mapa coroplético responsive */}
      <div
        ref={containerRef}
        className="relative flex h-[320px] w-full items-center justify-center sm:h-[340px]"
        onMouseLeave={() => setTooltip(null)}
      >
        {cargando ? (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-[#F4F6F8]">
            <div className="flex flex-col items-center gap-2">
              <div className="h-44 w-40 animate-pulse rounded-xl bg-slate-200/80" />
              <span className="text-xs text-[#475569]">
                Cargando distribución territorial...
              </span>
            </div>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            role="img"
            aria-label={`Mapa coroplético de los 22 departamentos de Guatemala para ${meta.nombre} en ${anio}`}
            className="h-full w-full select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <g transform={`translate(${MAP_PADDING}, ${MAP_PADDING})`}>
              {/* Capa base de los 22 departamentos */}
              {departamentosGeo.map((item) => {
                const estaSeleccionado = deptoSeleccionado === item.deptoCod
                const coincideFiltro =
                  !deptosCoincidentes || deptosCoincidentes.has(item.deptoCod)
                const reg = mapaRegistros.get(item.deptoCod)
                const nombreOficial = reg?.departamento || item.nombre
                const valorTexto = reg
                  ? `${formatearValor(reg.valor, meta.decimales)} ${meta.unidadCorta}`
                  : 'Sin dato'

                return (
                  <path
                    key={item.deptoCod}
                    d={item.pathD}
                    fill={obtenerColorRelleno(item.deptoCod)}
                    fillOpacity={coincideFiltro || estaSeleccionado ? 1 : 0.3}
                    stroke="#FFFFFF"
                    strokeWidth={1.15}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    role="button"
                    tabIndex={0}
                    aria-label={`${nombreOficial} (${item.deptoCod}): ${valorTexto}`}
                    aria-pressed={estaSeleccionado}
                    onClick={() => onSeleccionarDepto(item.deptoCod)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSeleccionarDepto(item.deptoCod)
                      }
                    }}
                    onMouseEnter={(e) => actualizarTooltip(e, item)}
                    onMouseMove={(e) => actualizarTooltip(e, item)}
                    onFocus={() => {
                      const rect = containerRef.current?.getBoundingClientRect()
                      if (!rect) return
                      setTooltip({
                        deptoCod: item.deptoCod,
                        nombre: nombreOficial,
                        x: rect.width * 0.5,
                        y: rect.height * 0.25,
                        containerWidth: rect.width,
                        containerHeight: rect.height,
                      })
                    }}
                    onBlur={() => setTooltip(null)}
                    className="cursor-pointer transition-[fill-opacity] duration-150 focus:outline-none"
                  />
                )
              })}

              {/* Resaltado limpio del departamento bajo el cursor */}
              {deptoHoverGeo &&
                deptoHoverGeo.deptoCod !== deptoSeleccionado && (
                  <path
                    d={deptoHoverGeo.pathD}
                    fill="none"
                    stroke="#007BFF"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none"
                  />
                )}

              {/* Resaltado institucional (#FFD100 con contraste #003876) del departamento seleccionado */}
              {deptoSeleccionadoGeo && (
                <g className="pointer-events-none">
                  <path
                    d={deptoSeleccionadoGeo.pathD}
                    fill="none"
                    stroke="#003876"
                    strokeWidth={4.2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={deptoSeleccionadoGeo.pathD}
                    fill="none"
                    stroke="#FFD100"
                    strokeWidth={2.4}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
            </g>
          </svg>
        )}

        {/* Indicador discreto del departamento activo en esquina superior izquierda */}
        {!cargando && deptoSeleccionadoGeo && (
          <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-1.5 rounded-full border border-[#003876]/15 bg-[#FFD100] px-2.5 py-0.5 text-[11px] font-semibold text-[#003876]">
            <span>
              {mapaRegistros.get(deptoSeleccionadoGeo.deptoCod)?.departamento ||
                deptoSeleccionadoGeo.nombre}
            </span>
            <span className="font-normal opacity-80 tabular-nums">
              ({deptoSeleccionadoGeo.deptoCod})
            </span>
          </div>
        )}

        {/* Tooltip flotante minimalista */}
        {infoTooltip && (
          <div
            role="tooltip"
            style={{
              left: infoTooltip.abrirIzquierda
                ? Math.max(8, infoTooltip.x - 14)
                : Math.min(infoTooltip.containerWidth - 8, infoTooltip.x + 14),
              top: infoTooltip.abrirArriba
                ? Math.max(8, infoTooltip.y - 12)
                : Math.min(infoTooltip.containerHeight - 8, infoTooltip.y + 12),
              transform: `translate(${infoTooltip.abrirIzquierda ? '-100%' : '0%'}, ${infoTooltip.abrirArriba ? '-100%' : '0%'})`,
            }}
            className="pointer-events-none absolute z-20 min-w-[196px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold text-[#003876]">
                {infoTooltip.nombre}
              </p>
              <span className="text-[11px] text-[#475569] tabular-nums">
                Cód. {infoTooltip.deptoCod}
              </span>
            </div>

            <div className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[#475569]">Valor {anio}</span>
                <span className="font-bold text-[#003876] tabular-nums">
                  {infoTooltip.valor !== null
                    ? `${formatearValor(infoTooltip.valor, meta.decimales)} ${meta.unidadCorta}`
                    : 'N/D'}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[#475569]">
                  Var. vs. {ANIO_BASE_COMPARACION}
                </span>
                <span className="font-semibold text-[#003876] tabular-nums">
                  {anio === ANIO_BASE_COMPARACION
                    ? 'Año base'
                    : formatearVariacion(infoTooltip.variacionVs2021)}
                </span>
              </div>
            </div>

            <p className="mt-1.5 text-[10px] text-[#475569]">
              {infoTooltip.estaSeleccionado
                ? 'Seleccionado · clic para volver a Nacional'
                : 'Clic para ver serie histórica 2021–2025'}
            </p>
          </div>
        )}
      </div>

      {/* Leyenda secuencial discreta (mínimo y máximo) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex flex-1 items-center gap-2.5">
          <span className="text-[11px] font-medium text-[#475569] tabular-nums">
            {minValor !== null
              ? formatearValor(minValor, meta.decimales)
              : '—'}
          </span>
          <div
            aria-hidden="true"
            className="h-2.5 flex-1 max-w-[220px] rounded-full border border-slate-200/80"
            style={{
              background:
                'linear-gradient(to right, #E6F0FA 0%, #8CB8E8 33%, #1B64B0 66%, #003876 100%)',
            }}
          />
          <span className="text-[11px] font-semibold text-[#003876] tabular-nums">
            {maxValor !== null
              ? `${formatearValor(maxValor, meta.decimales)} ${meta.unidadCorta}`
              : 'Sin datos'}
          </span>
        </div>

        {haySinDato && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#475569]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-300 bg-[#F4F6F8]"
              aria-hidden="true"
            />
            <span>Sin dato</span>
          </div>
        )}
      </div>

      <footer className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-[#475569]">
        Fuente oficial: {fuenteOficial || 'INE Guatemala (2021–2025)'}
      </footer>
    </section>
  )
}
