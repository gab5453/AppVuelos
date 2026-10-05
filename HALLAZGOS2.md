# HALLAZGOS 2 — Puesta en marcha local y revisión (2026-10-04)

> **Alcance:** revisión del código contra el contrato, puesta en marcha local y preparación para Vue.
> **Restricción:** no se modificó ni se borró código. Solo se leyó, se compiló (`dist/`), se ejecutó y se creó este archivo.
> Los hallazgos del contrato siguen en `HALLAZGOS.md`; aquí está lo que impide (o dificulta) **ver y usar** el proyecto.

## Resumen

| ID | Prioridad | Hallazgo | ¿Bloquea Swagger o la web? |
|----|-----------|----------|----------------------------|
| H2-01 | 🔴 Crítica | Una **versión vieja de la API** ocupa el puerto 3000 | **Sí**: `localhost:3000/docs` da 404 y la API actual no puede arrancar en 3000 |
| H2-02 | 🔴 Crítica | El frontend apunta por defecto al 3000, es decir, a la API vieja | **Sí**: reservar falla con "Tu cuenta no tiene permiso" (403) |
| H2-03 | 🟠 Media | `http://127.0.0.1:5173` no abre (conexión rechazada) | Sí, si se usa esa URL; `localhost` funciona |
| H2-04 | 🟠 Media | Si el puerto 5173 está ocupado, Vite cambia de puerto y CORS bloquea la API | Sí, en ese caso |
| H2-05 | 🟡 Baja | Documentación con un número erróneo: "25 operaciones" (son **22**) | No |
| H2-06 | 🟡 Baja | Node 24.12 menor al que piden algunas dependencias (24.15+) | No (solo advertencias) |
| H2-07 | ⚪ Informativo | Recargar la página cierra la sesión; reiniciar la API borra los datos | No (comportamiento esperado) |

**Estado del código:** correcto. Tipos ✅, lint ✅ (API y frontend), 126 pruebas unitarias ✅ y 96 e2e ✅. Entre las e2e está la
validación de **cada respuesta real contra los schemas del contrato**, sin incumplimientos. El contrato está intacto (última escritura
22/09/2026). Las 22 operaciones del contrato tienen su ruta y no hay rutas extra.

---

## H2-01 🔴 Una API vieja ocupa el puerto 3000

- **Evidencia:** en el puerto 3000 escucha `node dist/main.js` (PID **28580**), iniciado el **02/10/2026 21:01**, antes de la Fase 1 (Swagger).
  Su proceso padre ya no existe: quedó "huérfano" de una terminal cerrada.
  - `GET /docs/` → **404** ("Cannot GET /docs/"): esa versión no tiene Swagger.
  - `POST /search` → `200` con `totalOffers: 0`: es anterior a los datos de prueba (Fase 5).
  - No envía `X-Request-Id` ni las cabeceras de seguridad (Fases 3 y 4).
- **Consecuencias:**
  1. Abrir `http://localhost:3000/docs` muestra un 404 aunque el código actual sí tiene Swagger.
  2. `npm run start:dev` en `vuelos/` falla con `EADDRINUSE` (puerto en uso), así que la versión nueva no arranca en el 3000.
- **Solución** (no la apliqué porque no estaba autorizado): cerrar ese proceso.
  ```powershell
  Stop-Process -Id 28580          # o, si el PID cambió:
  Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
  ```
  Después, `cd vuelos; npm run start:dev` levanta la versión actual en el 3000.
- **Mientras tanto:** dejé la versión actual levantada en el **3001** (ver "Cómo acceder").

## H2-02 🔴 El frontend usa por defecto la API del puerto 3000

- **Evidencia:** `frontend/src/config.ts` usa `http://localhost:3000` si no se define `VITE_API_URL`. Contra la API vieja, el token real de
  `dev-auth` se interpreta con el verificador simulado antiguo:
  - API vieja (3000): `POST /offers/hold` → **403** "El token no posee los scopes requeridos".
  - API actual (3001): el mismo token es aceptado y se aplica la lógica real.
- **Síntoma para el usuario:** la búsqueda no muestra vuelos y, al reservar, aparece "Tu cuenta no tiene permiso para esta operación".
- **Solución:** resolver H2-01, y entonces todo funciona con la configuración por defecto. Si la API corre en otro puerto, crear `frontend/.env`
  con `VITE_API_URL=http://localhost:<puerto>` (existe `.env.example`) y reiniciar Vite.

## H2-03 🟠 `http://127.0.0.1:5173` rechaza la conexión

- **Evidencia:** en Node 17+ sobre Windows, `localhost` resuelve primero a IPv6 (`::1`) y Vite solo escucha ahí. Por eso `127.0.0.1:5173` da
  `ERR_CONNECTION_REFUSED`. Aunque cargara, la API rechazaría el origen por CORS (solo permite `http://localhost:5173`).
- **Solución:** usar **`http://localhost:5173`**. Si se necesita `127.0.0.1`: `npm run dev -- --host 127.0.0.1` y agregar
  `http://127.0.0.1:5173` a `CORS_ORIGINS` de la API.

## H2-04 🟠 Si el 5173 está ocupado, CORS bloquea al frontend

- `npm run dev` no usa `--strictPort`: si el 5173 está ocupado, Vite toma el 5174 y la API lo rechaza por CORS (`Failed to fetch`).
- **Solución:** liberar el 5173 o declarar el puerto real en `CORS_ORIGINS` (p. ej. `CORS_ORIGINS=http://localhost:5174`).

## H2-05 🟡 Documentación: "25 operaciones" es incorrecto (son 22)

- Swagger UI y el contrato tienen **22 operaciones** (2 de búsqueda, 3 de hold, 5 de reservas y tickets, 6 de posventa, 2 de check-in,
  1 de estado de vuelo y 3 de webhooks). Error mío de redacción en sesiones anteriores, **solo en documentación**: las pruebas calculan la
  lista desde el contrato y no usan un número fijo.
- **Dónde corregir** (cuando autorices editar): `CAMBIOS.md` líneas 32 y 359, `vuelos/AUDITORIA.md` línea 165 y `vuelos/README.md` línea 155.

## H2-06 🟡 Versión de Node

- Instalado: Node **24.12.0**. `@nestjs/cli` (vía `@angular-devkit/*`) pide `^24.15.0`, por lo que `npm install` muestra advertencias `EBADENGINE`.
  Hoy todo compila y funciona; para evitar sorpresas, se recomienda actualizar a la última LTS de Node 24.

## H2-07 ⚪ Comportamientos esperados que pueden parecer fallas

- **Recargar la página cierra la sesión:** el token vive solo en memoria, por seguridad (Fase 6).
- **Reiniciar la API borra reservas y holds:** todo es en memoria (Reto 1). Los usuarios registrados en `dev-auth` también se pierden;
  el usuario demo siempre existe.
- **En Swagger, los endpoints protegidos** requieren un token: `cd vuelos; npm run token` → Authorize → `DevBearer`.

---

## Cómo acceder ahora (levantado en esta sesión)

| Servicio | URL | Nota |
|----------|-----|------|
| **Página web** | **http://localhost:5173** | Usuario demo `demo@ecoairlines.test` / `EcoDemo2026` |
| **Swagger** | **http://localhost:3001/docs** | Versión actual (en el 3001 por H2-01) |
| Autenticación de desarrollo | http://localhost:4000/health | Lo usa la página para el login |

Verificado en Chrome: Swagger muestra las 22 operaciones y "Try it out" de `POST /search` devuelve ofertas. En la web, el flujo
búsqueda → login → hold → reserva → check-in con QR funciona sin errores.

Los tres procesos siguen corriendo en segundo plano. Para detenerlos (PIDs de esta sesión):
```powershell
Stop-Process -Id 21772, 16720, 40972   # API (3001), dev-auth (4000), Vite (5173)
```

## Cómo levantarlo tú (después de resolver H2-01)

```powershell
# Terminal 1 — API (http://localhost:3000, Swagger en /docs)
cd "Reto 1\vuelos"; npm install; npm run start:dev
# Terminal 2 — autenticación de desarrollo (http://localhost:4000)
cd "Reto 1\dev-auth"; npm start
# Terminal 3 — frontend (http://localhost:5173)
cd "Reto 1\frontend"; npm install; npm run dev
```

---

## Preparación para cambiar el frontend a Vue

Hoy `frontend/` está hecho en **React 19 + TypeScript + Vite**. Pasarlo a **Vue 3** no afecta al backend ni al contrato: es un cambio
solo del cliente, y la API, `dev-auth`, CORS (puerto 5173) y Swagger quedan igual. Plan propuesto (pendiente de tu aprobación en `CAMBIOS.md`):

1. **Crear el proyecto Vue en una carpeta nueva** (`frontend-vue/`), sin tocar el actual hasta validarlo:
   ```powershell
   cd "Reto 1"
   npm create vue@latest frontend-vue    # elegir: TypeScript, Vue Router, Pinia y ESLint (sin JSX)
   cd frontend-vue; npm install
   npm install qrcode; npm install -D @types/qrcode
   ```
   Dependencias: `vue`, `vue-router`, `pinia`; de desarrollo: `vite`, `@vitejs/plugin-vue`, `vue-tsc`, `typescript`, `eslint-plugin-vue`.
2. **Se reutiliza sin cambios** (TypeScript sin React, ~40% del código): `src/api/` (cliente, endpoints, tipos del contrato, mensajes de error),
   `src/lib/` (formato, CO₂, parámetros de búsqueda, Idempotency-Key y fingerprint), `src/data/airports.ts`, `src/config.ts`, `index.css`
   y `public/favicon.svg`.
3. **Se reescribe** (de `.tsx` a componentes `.vue`): 10 páginas y 10 componentes. Los contextos de React (`AuthContext`, `BookingFlowContext`)
   pasan a stores de **Pinia**; `useIdempotencyKey` pasa a un *composable*, y `RequireAuth` a un guard de Vue Router.
4. **Seguridad equivalente:** en Vue, **no usar `v-html`** con datos de la API (equivale a `dangerouslySetInnerHTML`). El token sigue solo
   en memoria (store de Pinia sin persistencia).
5. **Validación:** el mismo recorrido en navegador de la Fase 6 y `vue-tsc --noEmit`. Cuando funcione, reemplazar `frontend/`
   (o apuntar los README a `frontend-vue/`).
