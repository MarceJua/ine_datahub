---
name: ine-design-system
description: Sistema de diseño minimalista e institucional basado en la identidad visual del INE Guatemala (Datatón 2026) para dashboards analíticos.
---

# Sistema de Diseño — INE-DataHub (Guatemala)

## Principios Estéticos (Anti-diseño genérico de IA)
- **Minimalismo editorial y de datos:** Mucho espacio en blanco, jerarquía tipográfica clara y cero ruido visual.
- **PROHIBIDO:** Gradientes morados/neón, glassmorphism innecesario, sombras pesadas, animaciones exageradas o emojis decorativos en la interfaz.
- **Bordes limpios:** Usa bordes sutiles de 1px (`border-slate-200`) y radios moderados (`rounded-lg` o `rounded-xl`, con pills `rounded-full` solo para badges/filtros).

## Paleta de Colores Oficial (Basada en INE Guatemala)
- **Azul Marino Institucional (Primario / Texto fuerte / Header):** `#003876`
- **Azul Eléctrico INE (Acento / Series de datos / Botones primarios):** `#007BFF`
- **Amarillo Oro (Highlight puntual / Badges de alerta o año activo):** `#FFD100` (siempre con texto `#003876`, nunca texto blanco)
- **Fondo Principal:** `#FFFFFF`
- **Superficies / Tarjetas:** `#F4F6F8` o `#FFFFFF` con borde `#E2E8F0`
- **Texto Secundario / Metadatos:** `#475569`

## Tipografía y Datos
- **Fuentes (Google Fonts en `index.html`):** `Plus Jakarta Sans` para títulos/encabezados y `Inter` para cuerpo y tablas.
- **Regla estricta para cifras:** Todos los números en KPIs, ejes y tablas deben usar `tabular-nums` (`font-variant-numeric: tabular-nums`) y alineación a la derecha en tablas.
- **Trazabilidad:** Cada gráfica o respuesta debe mostrar en pie discreto la fuente oficial del INE (archivo/cuadro).

## Arquitectura de Layout
- **Navegación superior limpia** (barra blanca con borde inferior o azul `#003876` compacta) con selector claro entre las 2 vistas: `Explorador Territorial` y `Consultor IA`.
- **Responsive:** Grid limpio de 12 columnas que colapsa ordenadamente en pantallas medianas y móviles.
