# Correcciones al frontend (ToolStore)

Este frontend trabaja junto con el **backend corregido** (necesita el endpoint `/api/auth/cambiar-clave`).
Para probarlo: backend con `npm run dev` y frontend con `npm start`.

## Seguridad y sesión
| Antes | Ahora |
|---|---|
| Si el servidor respondía con cualquier error, entraba **`admin` / `1234`** "de respaldo" (aunque el admin ya tuviera otra contraseña) | Eliminado. Sin servidor no hay login y se muestra un mensaje claro |
| Cualquiera podía abrir `/dashboard`, `/ventas`... escribiendo la dirección, sin iniciar sesión | Guard de rutas (`guards/autenticado.ts`): sin sesión te manda al login |
| "Cerrar sesión" solo cambiaba de pantalla | Borra la sesión de verdad |
| El front no recordaba quién entró (siempre "Administrador") | `services/sesion.ts` guarda el usuario (id, nombre, rol) en `sessionStorage`; sobrevive a recargar la página y se borra al cerrar la pestaña |
| **Cambiar contraseña** decía "Contraseña actualizada" sin hacer nada | Llama al backend (`PUT /api/auth/cambiar-clave`) y valida la contraseña actual |
| Configuración mostraba/editaba siempre el perfil del primer usuario | Usa el usuario logueado (lo identifica el backend por el token) |

> El guard del front es una comodidad de la pantalla; la protección real la hace el backend con el token (ver la Ronda 2).

## Mejoras
- **Dirección del backend en un solo lugar:** `src/app/api.ts` (antes `http://localhost:3000` estaba escrito 28 veces).
- **Aviso cuando el backend está apagado** (`interceptors/errores.ts`): antes las pantallas quedaban vacías sin explicación.
- **Mensajes de error reales del servidor** en Clientes, Proveedores, Inventario, Compras, Reportes, Ventas y Configuración (ej. "Stock insuficiente para «Taladro…»", "El RUC debe tener 11 dígitos", "Ese correo ya está en uso") en vez de "Error al guardar".
- **Compras:** el aviso "Se sumaron N unidades al stock" ya no se muestra cuando la compra no coincide con ningún producto del inventario (el stock no cambia).
- **Inventario:** si un producto tiene historial y se "elimina", se explica que quedó desactivado.
- **Ventas:** el vendedor se rellena con quien tiene la sesión; si una venta ya estaba anulada, la lista se actualiza.
- **Punto de venta (modal):** estaba hecho con 45 estilos escritos a mano en colores de tema oscuro, íconos de Font Awesome (que no está instalado, no se veían) y clases que no existen (`btn-primary`, `btn-outline`). Se rehízo con las clases de tu propio diseño (`campo`, `tabla`, `btn-primario`, `app-icono`); ahora respeta el tema claro y oscuro. Enter en "Cantidad" agrega el producto.
- **Dashboard:** la tarjeta "Ganancia del mes" mostraba el total vendido, no la ganancia; ahora dice "Ventas del mes".

## Pendiente / ideas
- El Dashboard descarga todas las ventas con su detalle para calcular los totales; el backend ya tiene endpoints listos (`/api/dashboard/*`) que harían lo mismo con mucho menos datos.
- "Margen operativo" del Historial mensual resta también las compras pendientes (aún no recibidas).
- La preferencia "avisar de stock bajo" no se guarda en la base de datos (existe la tabla `preferencias_usuario`).
- Los `*.spec.ts` son los de la plantilla de Angular; no los pude ejecutar.

---

# Ronda 2: Kardex, RUC, mapeo de productos y seguridad

## Pantallas nuevas (menú lateral)
- **Kardex** (`/kardex`): historial de entradas y salidas. Filtros por producto, tipo de movimiento, fechas, entradas/salidas y búsqueda (producto, código o N.º de venta/compra); tarjetas con total de entradas, salidas y stock actual del producto elegido; fechas en hora de Lima; **exportar a CSV** (abre en Excel).
- **Mapeo de productos** (`/mapeo`), con dos pestañas:
  - *Ubicación en el almacén*: mapa por zona → pasillo → estante con los productos de cada uno (y "Libre" si está vacío), resumen (ocupadas / libres / sin ubicar), alta/edición/baja de ubicaciones, quitar un producto de su lugar y asignar ubicación a los productos que no tienen.
  - *Proveedores por producto*: tabla de vínculos (proveedor, código del proveedor, precio de compra, plazo de entrega, principal), filtro por proveedor, aviso de productos sin proveedor y alta/edición/baja de vínculos.

## Cambios en pantallas existentes
- **Proveedores:** campo **RUC** obligatorio con validación instantánea (11 dígitos, prefijo y dígito verificador), columna RUC, y datos nuevos: dirección, ciudad y condición de pago (contado / crédito con días). La búsqueda también encuentra por RUC.
- **Inventario:** campos **marca** y **ubicación en el almacén**, que se muestran bajo el nombre del producto. Se corrigió la unidad "Bolsa" (enviaba `bolsa` pero la base de datos usa `bol`, así que se guardaba como "Unidad").

## Seguridad
- Al iniciar sesión se guarda el **token** (solo en `sessionStorage`) y un interceptor (`interceptors/autorizacion.ts`) lo envía en cada petición al backend.
- Si el backend responde que la sesión no es válida o venció (`SESION_INVALIDA`), se muestra un aviso y se vuelve al login. Una contraseña actual incorrecta ya **no** cierra la sesión.
- **Botones según el rol** (`sesion.puede(...)`): el vendedor no ve crear/editar productos ni compras; el almacenero no ve ventas ni clientes; solo el administrador ve eliminar, anular venta y guardar los datos de la empresa. Es solo comodidad visual: el backend es quien bloquea (403).
- Configuración ya no manda `usuarioId`: el backend usa el del token.

## Pendiente / ideas
- No pude ejecutar `ng build` ni los `*.spec.ts` (sin acceso a npm); verifiqué tipos con piezas de reemplazo y revisé las plantillas a mano.
- El token vive en `sessionStorage` (se pierde al cerrar la pestaña, como pediría un sistema de caja).


## Ronda 3: FIFO y Kardex valorizado
- **Kardex:** columnas nuevas *Costo unit.*, *Total bruto* (cantidad × costo, sin IGV) y *Saldo valorizado*; tarjetas de total bruto de entradas/salidas y de saldo valorizado del producto. El botón ahora es **Descargar Excel** (.xlsx real con 2 hojas: Kardex y Lotes FIFO, hecho por el backend con los filtros puestos). El CSV se quitó.
- **Pantalla nueva «Lotes (FIFO)»** (`/lotes`, `pages/lotes/`): lotes de cada producto en el orden en que se venderán, con «1.º en salir», cuánto queda de cada uno, costo y valor, más el valor total del inventario y una explicación de FIFO.
- **Inventario:** campo opcional *Costo de compra por unidad* en el formulario del producto (valoriza el stock inicial o el stock que se suma a mano).
- Requiere el backend de la Ronda 3.

## Ronda 4: pantallas según el rol
- **Menú por rol** (`layout.ts`, `services/permisos.ts`): cada rol ve solo sus pantallas. Administrador: todas. Almacenero: Inventario, Kardex, Lotes, Mapeo, Compras, Proveedores, Reportes y Configuración. Vendedor: Inventario, Ventas, Clientes, Reportes y Configuración. Dashboard e Historial mensual: solo el administrador.
- **Direcciones escritas a mano:** un guard nuevo (`guards/rol.ts`) devuelve al usuario a su pantalla de inicio si intenta abrir una pantalla que su rol no puede ver.
- **Pantalla de inicio por rol:** administrador → Dashboard, almacenero → Inventario, vendedor → Ventas.
- **Kardex:** el nombre de cada producto de la tabla se puede **clickear** para ver solo su historial, con un aviso y botones "Ver sus lotes FIFO" y "Ver todos los productos". La pantalla Lotes acepta `?productoId=`.
- Requiere el backend de la Ronda 4 (si no, el vendedor aún vería datos por la API).

## Ronda 5 - Olvidé mi contraseña
- Nueva pantalla /recuperar (pages/recuperar) y enlace "¿Olvidaste tu contraseña?" en el login.
