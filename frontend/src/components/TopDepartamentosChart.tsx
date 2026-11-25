import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { IndicadorOut } from '../api/client'
import {
  formatearEjeCompacto,
  formatearValor,
  type IndicadorMeta,
} from '../config/indicadores'

interface TopDepartamentosChartProps {
  datos: IndicadorOut[]
  meta: IndicadorMeta
  anio: number
  deptoSeleccionado: string | null
  onSeleccionarDepto: (deptoCod: string) => void
  fuenteOficial: string
  cargando?: boolean
  /** Elemento opcional en la cabecera (ej. selector Mapa / Top 10). */
  selectorVista?: ReactNode
}

interface TopBarDatum {
  depto_cod: string
  departamento: string
  valor: number
}

export function TopDepartamentosChart({
  datos,
  meta,
  anio,
  deptoSeleccionado,
  onSeleccionarDepto,
  fuenteOficial,
  cargando = false,
  selectorVista,
}: TopDepartamentosChartProps) {
  const top10: TopBarDatum[] = [...datos]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
    .map((item) => ({
      depto_cod: item.depto_cod,
      departamento: item.departamento,
      valor: item.valor,
    }))

  return (
    <section className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-[#003876]">
              Top 10 departamentos · {anio}
            </h2>
            <span className="rounded-full bg-[#FFD100] px-2.5 py-0.5 text-xs font-semibold text-[#003876] tabular-nums">
              {anio}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#475569]">
            {meta.nombre} ({meta.unidadEtiqueta}). Haz clic en una barra para ver su serie histórica.
          </p>
        </div>
        {selectorVista}
      </div>

      <div className="h-[340px] w-full">
        {cargando ? (
          <div className="flex h-full flex-col justify-center gap-3 px-2">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-6 animate-pulse rounded bg-slate-100"
                style={{ width: `${90 - idx * 8}%` }}
              />
            ))}
          </div>
        ) : top10.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-[#F4F6F8] p-6 text-center text-sm text-[#475569]">
            No hay registros disponibles para el indicador y año seleccionados.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={top10}
              layout="vertical"
              margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="#E2E8F0"
              />
              <XAxis
                type="number"
                tick={{ fill: '#475569', fontSize: 12 }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
                tickFormatter={(val: number) =>
                  formatearEjeCompacto(val, meta.decimales)
                }
              />
              <YAxis
                type="category"
                dataKey="departamento"
                width={132}
                tick={{ fill: '#003876', fontSize: 12, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: '#F4F6F8' }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null
                  }
                  const punto = payload[0].payload as TopBarDatum
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                      <p className="font-semibold text-[#003876]">
                        {punto.departamento}{' '}
                        <span className="font-normal text-[#475569] tabular-nums">
                          ({punto.depto_cod})
                        </span>
                      </p>
                      <p className="mt-1 text-[#475569]">
                        Valor ({anio}):{' '}
                        <span className="font-bold text-[#003876] tabular-nums">
                          {formatearValor(punto.valor, meta.decimales)}{' '}
                          {meta.unidadCorta}
                        </span>
                      </p>
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="valor"
                radius={[0, 6, 6, 0]}
                barSize={20}
                onClick={(entry) => {
                  const payload = entry as unknown as TopBarDatum
                  if (payload?.depto_cod) {
                    onSeleccionarDepto(payload.depto_cod)
                  }
                }}
                className="cursor-pointer"
              >
                {top10.map((entry) => {
                  const estaSeleccionado =
                    deptoSeleccionado === entry.depto_cod
                  return (
                    <Cell
                      key={entry.depto_cod}
                      fill={estaSeleccionado ? '#003876' : '#007BFF'}
                    />
                  )
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <footer className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-[#475569]">
        Fuente oficial: {fuenteOficial || 'INE Guatemala (2021–2025)'}
      </footer>
    </section>
  )
}
