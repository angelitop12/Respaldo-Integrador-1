# Correcciones al backend (ToolStore)

## Cómo aplicarlas
- **Ya tienes datos que quieres conservar:** ejecuta solo la migración
  `psql -U postgres -d almacen_ferretero -f database/migraciones/001_correcciones.sql`
  (no borra nada) y reemplaza `src/`, `database/init-db.js`, `package.json`, `.gitignore`, `.env.example`.
- **Base nueva o de pruebas:** `npm run db:reset` (borra todo y recrea desde `schema.sql`).
  `npm run db:init` ahora se niega a correr si ya hay tablas, para no borrarte los datos por accidente.
- En tu `.env` pon la contraseña real de PostgreSQL (el `.env.example` es solo plantilla).

## Seguridad
| Antes | Ahora |
|---|---|
| Cualquier usuario entraba con la contraseña `1234` (`|| passParam === '1234'`) y existía un login `admin/1234` de respaldo aunque la BD fallara | Eliminado. La contraseña solo se valida con bcrypt en la BD |
| Todo registro nuevo quedaba como **ADMINISTRADOR** | Queda como **VENDEDOR** (configurable con `ROL_REGISTRO` en `.env`) |
| Login sin límite de intentos | 10 fallos por IP+usuario en 15 min → 429 |
| Contraseña `'root'` escrita en `db.js` | Se lee solo del `.env` |
| `CREATE EXTENSION` y `ALTER/CREATE TABLE` ejecutados al arrancar el servidor | Quitados (el schema ya lo hace) |
| `.gitignore` solo ignoraba `.env` | También `.env.*` (menos `.env.example`) y `*.log` |

## Errores que fallaban de verdad
- **Borrar un producto** fallaba siempre con productos que tienen kardex (todos los del seed). Ahora, si tiene historial, se **desactiva** y deja de verse; si no, se borra.
- **Crear reportes** fallaba (`22/10/2026` a una columna `DATE`). Ahora se acepta `DD/MM/AAAA` y se devuelve en ese formato.
- **Número de guía de compra**: salía `F001-00050003411`; ahora `F001-0004522`, `F001-0004523`...
- **Dashboard "de hoy"** usaba la fecha del servidor: con la BD en UTC, desde las 7 pm (Lima) mostraba 0 ventas. Ahora usa hora de Lima (vistas en el schema y en la migración).
- **Compras**: se registraban en varios pasos sueltos (si uno fallaba quedaba a medias) y duplicaban la lógica del trigger. Ahora van en una transacción y el stock lo suma el trigger.
- **Ventas**: antes un fallo dejaba mensajes técnicos de Postgres; ahora "Stock insuficiente para «producto»…" con 400. Se validan cantidades/precios/productos, se usa el precio de la BD si el frontend no manda `precio`, el IGV sale de `configuracion_empresa`, y dos ventas simultáneas ya no repiten código.
- **Anular venta** decía "anulada" aunque no existiera o ya estuviera anulada → ahora 404 / 409.
- **Inventario**: los cambios de stock (botones +/-) y el stock inicial ahora quedan en el **kardex**.
- `PORT` del `.env` se ignoraba (estaba fijo en 3000).
- **Nuevo:** `PUT /api/auth/cambiar-clave` (`{ actual, nueva }`; la persona sale del token). Verifica la contraseña actual con bcrypt, guarda la nueva y limita intentos fallidos. Lo usa Configuración → Cambiar contraseña, que antes mostraba "actualizada" sin hacer nada.
- Rutas con `:id` inválido, JSON malformado y rutas inexistentes responden JSON con 400/404 en vez de HTML o 500.
- PUT/DELETE de clientes, proveedores, compras y reportes devuelven 404 si el registro no existe.

## Cosas que el frontend podría notar
- `GET /api/inventario` ya no lista productos desactivados.
- `GET /api/reportes` devuelve `fecha` como `DD/MM/AAAA` (viene de `vw_reportes_listado`).
- `GET /api/compras`: `ts` ahora sale de `created_at`.
- Conflictos nuevos devuelven 409 (cliente/proveedor con historial); antes 400.
- `/api/configuracion` (GET y PUT perfil) ahora usa siempre el usuario del token (se ignora `usuarioId`).

## Pendiente recomendado (no se tocó para no romper el frontend)
1. `DELETE /api/compras/:id` de una compra ya recibida no revierte el stock.
2. Poner `CORS_ORIGIN=http://localhost:4200` (o tu dominio) en el `.env`.

---

# Ronda 2: Kardex, RUC, tablas, seguridad y mapeo de productos

## Base de datos (`database/migraciones/002_kardex_ruc_mapeo.sql`, ya incluida en `schema.sql`)
- **Proveedores:** columnas nuevas `ciudad`, `condicion_pago` (CONTADO/CREDITO), `dias_credito`, `observaciones`; el RUC ahora tiene `CHECK` (11 dígitos, empieza con 10/15/17/20) y es único. Los RUC de ejemplo no pasaban el dígito verificador de SUNAT y se corrigieron (solo si siguen con el valor de ejemplo).
- **Clientes:** `distrito`, `observaciones`. **Usuarios:** `ultimo_cambio_clave`.
- **Productos:** `marca`, `codigo_interno` (PRD-0001…, único) y `ubicacion_id`.
- **Tabla nueva `ubicaciones_almacen`** (zona, pasillo, estante, nivel, descripción, activo): el mapa del almacén.
- **Tabla nueva `producto_proveedor`** (producto, proveedor, código del proveedor, precio de compra, plazo de entrega, es_principal): un producto solo puede tener un proveedor principal.
- **Vista nueva `vw_kardex_listado`** e índices para consultar el kardex rápido; `vw_inventario_completo` suma marca, código interno y ubicación (las columnas nuevas van al final, el frontend viejo sigue funcionando).
- La migración es idempotente (se puede correr dos veces) y no borra datos.

## Kardex (historial)
- `GET /api/kardex` con filtros opcionales: `productoId`, `tipo`, `sentido` (ENTRADA/SALIDA), `desde`, `hasta` (fechas en hora de Lima), `q` (texto) y `limite` (500 por defecto, máx. 2000).
- Va ordenado por `id` descendente: el id se asigna con el producto bloqueado, así que respeta el orden real aunque dos ventas ocurran a la vez, y el saldo (anterior → posterior) siempre cuadra.
- Los ajustes de inventario y el stock inicial ahora guardan **quién** los hizo (`usuario_id`).

## RUC en proveedores
- `POST /api/proveedores` exige RUC; se valida formato y **dígito verificador de SUNAT (módulo 11)**. RUC repetido → 409.
- `PUT` solo revalida el RUC si cambió (para no bloquear proveedores antiguos). El proveedor ahora también guarda dirección, ciudad, condición de pago y días de crédito.

## Mapeo de productos
- **Ubicaciones:** `GET/POST /api/ubicaciones`, `PUT/DELETE /api/ubicaciones/:id` (409 si tiene productos), `PUT /api/inventario/:id/ubicacion`. El código se genera solo (`S-2-E1-1` = zona-pasillo-estante-nivel).
- **Producto ↔ proveedor:** `GET /api/productos-proveedores` (filtros `productoId`, `proveedorId`), `PUT /api/productos-proveedores` (crea o actualiza; si es principal, quita la marca al anterior) y `DELETE /api/productos-proveedores/:productoId/:proveedorId`.
- `POST/PUT /api/inventario` aceptan `marca` y `ubicacionId` (si no los mandas al editar, se conservan).

## Seguridad del software
- **Login con token firmado (JWT HS256)** hecho con el módulo `crypto` de Node (no hay que instalar nada). `POST /api/auth/login` devuelve `token` y `expiraEn`. Dura 8 horas (`JWT_EXPIRA_HORAS`).
- **Todo `/api` exige `Authorization: Bearer <token>`**, salvo `GET /estado`, login y registro. Token falso, alterado, vencido o con `alg: none` → 401 con `codigo: "SESION_INVALIDA"`.
- **Permisos por rol** (el administrador puede todo; responde 403 si no tienes permiso):

| Acción | ADMINISTRADOR | ALMACENERO | VENDEDOR |
|---|:-:|:-:|:-:|
| Ver todo (inventario, kardex, mapeo, ventas, reportes…) | ✔ | ✔ | ✔ |
| Crear/editar productos, categorías, ubicaciones, vínculos producto-proveedor | ✔ | ✔ | — |
| Crear/editar proveedores, registrar y recibir compras | ✔ | ✔ | — |
| Registrar ventas, crear/editar clientes | ✔ | — | ✔ |
| Crear reportes | ✔ | ✔ | ✔ |
| Eliminar (productos, clientes, proveedores, compras, reportes), anular ventas, datos de la empresa | ✔ | — | — |

- **El usuario sale del token, no del body:** el vendedor de una venta, el usuario de una compra, el perfil, la configuración y el cambio de contraseña usan siempre a quien inició sesión (antes se podía cambiar la clave de otro mandando su `usuarioId`).
- **`JWT_SECRET` en el `.env`** (ver `.env.example`). Si falta, el servidor avisa y usa una clave temporal (las sesiones se cierran al reiniciar).
- Limitaciones conocidas: no hay cierre de sesión en el servidor (un token robado sirve hasta que venza) ni se revisa en cada petición si el usuario sigue activo.


# Ronda 3: FIFO (lotes), Kardex valorizado y Excel

## Qué método de costeo usa ahora
Antes el sistema costeaba al **último costo de compra** (no era FIFO). Ahora aplica **FIFO / PEPS (primeras entradas, primeras salidas)** con lotes.

## Base de datos (`database/migraciones/003_fifo_lotes.sql`, ya incluida en `schema.sql`)
- **Tabla `lotes_inventario`:** un lote por cada ingreso de mercadería (compra recibida, stock inicial, ajuste positivo, venta anulada que no tenía lotes, o stock previo al FIFO). Guarda cantidad inicial, cantidad restante, costo unitario y fecha de ingreso.
- **Tabla `consumos_lote`:** de qué lotes salió cada línea de venta; así, al anular una venta, las unidades vuelven a los **mismos** lotes.
- **Funciones:** `fn_fifo_ingresar` (crea lote), `fn_fifo_consumir_total` / `fn_fifo_consumir` (descuentan del lote más antiguo).
- **Triggers actualizados:** `fn_procesar_detalle_venta` (venta), `fn_anular_venta` (anulación) y `fn_recepcion_compra` (compra recibida) ahora trabajan con lotes.
- **Kardex valorizado:** columna nueva `kardex_movimientos.costo_total` (cantidad × costo, exacto) y `vw_kardex_listado` suma `costoTotal`, `valorVenta` y `saldoValorizado` (acumulado por producto). Vista nueva `vw_lotes_fifo`.
- **Migración segura:** el stock que ya existe se convierte en un lote por producto (costo = último costo de compra). Se puede ejecutar dos veces sin problema y no borra datos.
- Invariante que se prueba: la suma de `cantidad_restante` de los lotes = `productos.stock_actual`, y el último saldo valorizado del Kardex = valor de los lotes.
- Los movimientos **anteriores** al FIFO no tienen lotes reales: se les completa el costo con el último costo de compra (es una aproximación). Todo lo que se registre desde la migración es exacto. Para una demostración limpia: `npm run db:reset`.

## API
- `GET /api/lotes` (`productoId`, `todos=1`): lotes en orden FIFO con `ordenSalida` (1 = el primero en salir) y `valorTotal`.
- `GET /api/kardex` ahora devuelve también `costoTotal`, `valorVenta` (solo ventas) y `saldoValorizado`.
- `GET /api/kardex/excel` (mismos filtros que el Kardex): descarga un **.xlsx real** simple y ordenado, con 2 hojas (Kardex y Lotes FIFO): entradas en verde, salidas en rojo, costo unitario, total bruto, saldo valorizado y totales debajo. No requiere instalar nada (`src/excel.js` arma el archivo sin librerías).
- `POST /api/inventario` y `PUT /api/inventario/:id` aceptan `costo` (opcional): costo unitario del stock inicial o del stock que se suma a mano. Si baja el stock a mano, se descuenta del lote más antiguo.

## Pruebas
- 216 comprobaciones de regresión + 64 de FIFO/Kardex valorizado/Excel: todas correctas, tanto en base nueva como en base migrada.

## Cómo aplicar
1. Reemplaza la carpeta `backend` (o copia `src/index.js`, `src/excel.js`, `src/kardexExcel.js`).
2. Base de datos con datos que quieres conservar: abre `database/migraciones/003_fifo_lotes.sql` en pgAdmin (Query Tool) y ejecútalo.
   Base nueva o de pruebas: `npm run db:reset` (borra todo y crea todo con FIFO).
3. `npm start`. No hay dependencias nuevas.

# Ronda 4: cada rol ve solo lo que le corresponde

Esta ronda **reemplaza** la fila "Ver todo" de la tabla de la Ronda 2: ahora la lectura también se restringe por rol (antes todos podían leer todo).

| Pantalla / datos (GET) | ADMINISTRADOR | ALMACENERO | VENDEDOR |
|---|:-:|:-:|:-:|
| Dashboard e Historial mensual (solo el administrador, en la interfaz) | ✔ | — | — |
| Inventario y categorías (el vendedor **no recibe `precioCompra`**) | ✔ | ✔ | ✔ |
| Ubicaciones, reportes, configuración | ✔ | ✔ | ✔ |
| Kardex, Excel del Kardex y Lotes FIFO (`/api/kardex`, `/api/kardex/excel`, `/api/lotes`) | ✔ | ✔ | — |
| Compras, proveedores y vínculos producto-proveedor | ✔ | ✔ | — |
| Ventas y clientes | ✔ | — | ✔ |

- Un rol sin permiso recibe **403** ("No tienes permiso para realizar esta acción").
- El vendedor deja de ver los costos (Kardex, lotes, compras, proveedores y costo de compra en Inventario).
- Pruebas: 239 de regresión + 66 de FIFO/Kardex/Excel, todas correctas.

## Ronda 5 - Olvidé mi contraseña
- POST /api/auth/olvide-clave y POST /api/auth/restablecer-clave (públicas). Código de 6 dígitos, vale 15 min, máximo 5 intentos, se guarda cifrado (sha256 + sal) en la tabla recuperaciones_clave (se crea sola al usarse).
- No hay servidor de correo: el código sale en la terminal del backend.
- Tests: tests/recuperar.js (25 OK).
- Ronda 5b: el código de recuperación se envía por correo (src/correo.js, SMTP por TLS sin paquetes nuevos). Se activa con SMTP_USER y SMTP_PASS en .env; sin ellos sigue saliendo en la terminal. Pruebas: tests/recuperar_correo.js (17 OK).
