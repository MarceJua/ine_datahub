import type { ReactNode } from 'react'

interface KpiCardProps {
  etiqueta: string
  valor: string
  subtitulo: string
  badge?: string
  badgeDestacado?: boolean
  icono?: ReactNode
  cargando?: boolean
}

export function KpiCard({
  etiqueta,
  valor,
  subtitulo,
  badge,
  badgeDestacado = false,
  icono,
  cargando = false,
}: KpiCardProps) {
  return (
    <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
          {etiqueta}
        </span>
        {badge ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
              badgeDestacado
                ? 'bg-[#FFD100] text-[#003876]'
                : 'border border-slate-200 bg-[#F4F6F8] text-[#003876]'
            }`}
          >
            {badge}
          </span>
        ) : icono ? (
          <span className="text-[#475569]" aria-hidden="true">
            {icono}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {cargando ? (
          <div className="h-9 w-36 animate-pulse rounded-md bg-slate-100" />
        ) : (
          <p className="font-display text-3xl font-bold tracking-tight text-[#003876] tabular-nums">
            {valor}
          </p>
        )}
        <p className="mt-1.5 text-xs text-[#475569]">{subtitulo}</p>
      </div>
    </article>
  )
}
