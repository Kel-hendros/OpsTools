# GRIDO - Reglas de Negocio

> G.R.I.D.O. = Grid & Resource Interface for Dynamic Operations
> Herramienta para diseñar y exportar mapas de asientos de estadios/venues.

---

## 1. Estados de Celda

Cada celda en la grilla tiene exactamente **dos estados posibles**:

| Estado  | `type`    | Visual                  | Significado                        |
|---------|-----------|-------------------------|------------------------------------|
| Activo  | `"seat"`  | Azul (`#3b82f6`), muestra código | El asiento existe y es válido     |
| Apagado | `"empty"` | Oscuro (`#1e293b`), sin texto    | El espacio NO es un asiento       |

- **Por defecto** todas las celdas nuevas se crean como `"seat"`.
- Se cambian con las herramientas "Seat" (pintar asiento) y "Empty" (apagar asiento).
- Se puede pintar arrastrando el mouse (drag-painting).

---

## 2. Exportación CSV

### 2.1 Formato del CSV

```
rowNumber,sectionCode,seatCode
```

- **rowNumber**: Etiqueta de fila (numérica o alfabética, según configuración).
- **sectionCode**: Código de la sección (ej: `PISO_2/SECCION_503A`).
- **seatCode**: Código del asiento generado (ej: `A-01`) **o** `NOT_SEAT` si la celda está apagada.

### 2.2 Regla de NOT_SEAT

> **REGLA FUNDAMENTAL**: Toda celda con estado "Apagado" (`type: "empty"`) DEBE exportarse en el CSV con `seatCode = NOT_SEAT`. Las celdas apagadas NO se omiten — representan espacios físicos que no son asientos (pasillos, escaleras, espacios vacíos, etc.).

Ejemplo de CSV correcto:
```csv
rowNumber,sectionCode,seatCode
A,PISO_2/SECCION_503A,A-01
A,PISO_2/SECCION_503A,A-02
A,PISO_2/SECCION_503A,NOT_SEAT
A,PISO_2/SECCION_503A,NOT_SEAT
A,PISO_2/SECCION_503A,A-05
```

### 2.3 Export Individual (CSV)

- Exporta la sección activa actual.
- Incluye **TODAS** las celdas (asientos + NOT_SEAT).
- Nombre del archivo: `{sectionCode}.csv` (con `/`, `\` y espacios reemplazados por `_`).

### 2.4 Export Masivo (ZIP)

- Exporta **todas** las secciones del proyecto que tengan datos de grilla (`gridData.length > 0`).
- Estructura del ZIP: `{parentSection}/{leafSection}.csv`.
- Secciones sin datos de grilla se omiten.
- Secciones que fueron configuradas pero tienen todas las celdas apagadas **SÍ se incluyen** (con todos `NOT_SEAT`).

---

## 3. Nomenclatura de Filas y Columnas

### 3.1 Filas

| Configuración    | Descripción                                    |
|------------------|------------------------------------------------|
| Tipo             | `numeric` (1, 2, 3...) o `alpha` (A, B, C...) |
| Valor inicial    | Desde qué número/letra empezar                 |
| Invertir filas   | Numerar de abajo hacia arriba                  |
| Row Overrides    | Etiquetas manuales por fila (vía herramienta Edit) |

### 3.2 Columnas

| Configuración    | Descripción                                    |
|------------------|------------------------------------------------|
| Valor inicial    | Desde qué número empezar (siempre numérico)    |
| Invertir columnas| Numerar de derecha a izquierda                  |
| Zero padding     | Rellenar con ceros (01, 02... vs 1, 2...)      |

### 3.3 Patrón de Código de Asiento

- Formato configurable usando `$ROW` y `$COL` como placeholders.
- Patrón por defecto: `$ROW-$COL` (ej: `A-01`).
- Cada celda tiene un `code` auto-generado basado en el patrón, pero puede editarse manualmente con la herramienta Edit.

---

## 4. Herramientas

| Herramienta | Acción                                                       |
|-------------|--------------------------------------------------------------|
| Seat        | Pinta la celda como asiento activo (`type: "seat"`)          |
| Empty       | Apaga la celda (`type: "empty"`)                             |
| Edit        | Click en celda: editar código manualmente. Click en fila: editar etiqueta de fila. |

### 4.1 Operaciones en Lote

| Botón      | Acción                                        |
|------------|-----------------------------------------------|
| Fill All   | Convierte TODAS las celdas en asientos        |
| Clear All  | Apaga TODAS las celdas (todas quedan `empty`) |

---

## 5. Proyectos Multi-Sección

### 5.1 Estructura del Proyecto

- Se importa un JSON con la estructura del venue/estadio.
- El JSON define secciones jerárquicas (padres e hijos/hojas).
- Solo las secciones hoja (sin sub-secciones) y con `unnumbered !== true` se muestran como editables.

### 5.2 Navegación

- Panel lateral con árbol de secciones.
- Indicador verde: sección tiene al menos un asiento activo.
- Indicador rojo: sección no tiene asientos activos (o no ha sido configurada).
- Al cambiar de sección, se guarda automáticamente la sección actual al cache.

### 5.3 Persistencia

- Todo el estado del proyecto se guarda en `localStorage` bajo la key `stadium_grid_manager_data`.
- Incluye: datos del estadio, todas las secciones, cache de grillas, sección activa.
- El cache de cada sección guarda: `gridData`, dimensiones, configuración de nomenclatura, y row overrides.

---

## 6. Formato del JSON de Layout

```json
{
  "name": "Nombre del Estadio",
  "sections": [
    {
      "code": "PISO_1",
      "name": "Piso 1",
      "sections": [
        {
          "code": "PISO_1/SECCION_101",
          "name": "Sección 101",
          "unnumbered": false
        }
      ]
    }
  ]
}
```

- `code`: Identificador único de la sección (usado como `sectionCode` en el CSV).
- `name`: Nombre display (para la UI).
- `unnumbered: true`: La sección se ignora completamente (no aparece en el navegador ni se exporta).
- `sections`: Sub-secciones (si tiene sub-secciones, la sección padre no es editable directamente).

---

## 7. Canvas Interactivo

- Canvas HTML5 2D con zoom (scroll wheel) y paneo (drag).
- Rango de zoom: 0.1x a 5x.
- Auto-centra la grilla al cambiar de sección o dimensiones.
- Botón "Recenter" para volver a centrar manualmente.
