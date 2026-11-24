import { RotateCcw } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatearEjeCompacto,
  formatearValor,
  type IndicadorMeta,
} from '../config/indicadores'

export interface PuntoTendencia {
  anio: number
  valor: number | null
}

interface TendenciaHistoricaChartProps {
  serie: PuntoTendencia[]
  meta: IndicadorMeta
  anioActivo: number
  deptoActivo: { depto_cod: string; nombre: string } | null
  onRestablecerNacional: () => void
  fuenteOficial: string
  cargando?: boolean
}

export function TendenciaHistoricaChart({
  serie,
  meta,
  anioActivo,
  deptoActivo,
  onRestablecerNacional,
  fuenteOficial,
  cargando = false,
}: TendenciaHistoricaChartProps) {
  const tituloAlcance = deptoActivo
    ? `${deptoActivo.nombre} (${deptoActivo.depto_cod})`
    : meta.agregacion === 'sum'
      ? 'Total nacional (22 departamentos)'
      : 'Promedio departamental nacional'

  const tieneDatos = serie.some((punto) => punto.valor !== null)

  return (
    <section className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-[#003876]">
            Tendencia histórica 2021–2025
          </h2>
          <p className="mt-0.5 text-xs text-[#475569]">{tituloAlcance}</p>
        </div>

        {deptoActivo ? (
          <button
            type="button"
            onClick={onRestablecerNacional}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F4F6F8] px-2.5 py-1 text-xs font-medium text-[#003876] transition-colors hover:border-[#003876]/30 hover:bg-slate-100"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Ver nacional</span>
          </button>
        ) : (
          <span className="rounded-full border border-slate-200 bg-[#F4F6F8] px-2.5 py-0.5 text-xs font-medium text-[#003876]">
            Nacional
          </span>
        )}
      </div>

      <div className="h-[340px] w-full">
        {cargando ? (
          <div className="flex h-full items-center justify-center rounded-lg bg-[#F4F6F8]">
            <div className="h-40 w-4/5 animate-pulse rounded bg-slate-200/70" />
          </div>
        ) : !tieneDatos ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-[#F4F6F8] p-6 text-center text-sm text-[#475569]">
            Sin serie histórica disponible para esta selección.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={serie}
              margin={{ top: 14, right: 18, left: 4, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#E2E8F0"
              />
              <XAxis
                dataKey="anio"
                tick={{ fill: '#003876', fontSize: 12, fontWeight: 500 }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(val: number) =>
                  formatearEjeCompacto(val, meta.decimales)
                }
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null
                  }
                  const punto = payload[0].payload as PuntoTendencia
                  if (punto.valor === null) {
                    return null
                  }
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                      <p className="font-semibold text-[#003876] tabular-nums">
                        Año {punto.anio}
                      </p>
                      <p className="mt-1 text-[#475569]">
                        {deptoActivo ? deptoActivo.nombre : 'Nacional'}:{' '}
                        <span className="font-bold text-[#003876] tabular-nums">
                          {formatearValor(punto.valor, meta.decimales)}{' '}
                          {meta.unidadCorta}
                        </span>
                      </p>
                    </div>
                  )
                }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="#003876"
                strokeWidth={2.5}
                connectNulls
                dot={(props) => {
                  const { cx, cy, payload } = props as {
                    cx?: number
                    cy?: number
                    payload?: PuntoTendencia
                  }
                  if (
                    typeof cx !== 'number' ||
                    typeof cy !== 'number' ||
                    !payload ||
                    payload.valor === null
                  ) {
                    return <g key={`empty-${payload?.anio ?? 'x'}`} />
                  }
                  const esActivo = payload.anio === anioActivo
                  return (
                    <circle
                      key={`dot-${payload.anio}`}
                      cx={cx}
                      cy={cy}
                      r={esActivo ? 6 : 4}
                      fill={esActivo ? '#FFD100' : '#007BFF'}
                      stroke="#003876"
                      strokeWidth={esActivo ? 2 : 1.5}
                    />
                  )
                }}
                activeDot={{
                  r: 6,
                  fill: '#FFD100',
                  stroke: '#003876',
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <footer className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-[#475569]">
        Fuente oficial: {fuenteOficial || 'INE Guatemala (2021–2025)'}
      </footer>
    </section>
  )
}
