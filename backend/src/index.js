// ==========================================================================
// Backend - Almacén Ferretero (ToolStore)
// ==========================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { ROLES, firmarToken, autenticar, permitir } = require('./seguridad');
const { construirExcelKardex } = require('./kardexExcel');
const { correoConfigurado, enviarCorreo } = require('./correo');

const app = express();

// Detrás del proxy de un hosting (Render, etc.) la IP real del visitante viene en una cabecera;
// sin esto, todos los visitantes compartirían el mismo límite de intentos de login.
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// --------------------------------------------------------------------------
// Middlewares
// --------------------------------------------------------------------------
// CORS_ORIGIN (en .env) limita qué páginas pueden llamar a la API. Vacío = cualquiera (solo desarrollo).
const origenesPermitidos = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors(origenesPermitidos.length ? { origin: origenesPermitidos } : undefined));
app.use(express.json({ limit: '1mb' }));

// Seguridad: todo /api exige token, salvo estado, login y registro (ver seguridad.js)
app.use('/api', autenticar);

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------
const PG = { FK: '23503', UNICO: '23505', CHECK: '23514', RAISE: 'P0001' };
const ZONA = "'America/Lima'";

// Error "esperado": se responde al cliente con su estado y mensaje (y hace ROLLBACK si ocurre en una transacción)
class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function responderError(res, error, mensajeGenerico, etiqueta) {
  if (error instanceof ErrorHttp) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(`${etiqueta}:`, error);
  return res.status(500).json({ error: mensajeGenerico });
}

// Ejecuta fn(client) dentro de BEGIN/COMMIT; si algo falla hace ROLLBACK y relanza el error
async function enTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* conexión ya caída */ }
    throw error;
  } finally {
    client.release();
  }
}

// Evita que dos peticiones simultáneas generen el mismo correlativo (ventas / compras)
function bloquearCorrelativo(db, nombre) {
  return db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [nombre]);
}

const parseId = (valor) => (/^\d+$/.test(String(valor)) ? Number(valor) : null);
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const redondear2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// true/false (o "true"/"false") -> booleano; cualquier otra cosa -> null (= "no cambiar")
const aBooleano = (v) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null);

// Devuelve el número, `porDefecto` si no vino, o NaN si vino algo que no es un número
function numero(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

// Acepta 'DD/MM/YYYY' o 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD' (o null si no es una fecha real)
function parseFecha(valor) {
  const s = texto(String(valor ?? ''));
  let d, m, a;
  let coincide = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (coincide) {
    [, d, m, a] = coincide;
  } else {
    coincide = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!coincide) return null;
    [, a, m, d] = coincide;
  }
  const fecha = new Date(Date.UTC(+a, +m - 1, +d));
  if (fecha.getUTCFullYear() !== +a || fecha.getUTCMonth() !== +m - 1 || fecha.getUTCDate() !== +d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// RUC peruano: 11 dígitos, empieza con 10/15/17/20 y el último dígito es el verificador de SUNAT (módulo 11)
function rucValido(ruc) {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = factores.reduce((acc, f, i) => acc + f * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const digito = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return digito === Number(ruc[10]);
}

const validarId = (valor, nombre = 'ID') => {
  const id = parseId(valor);
  if (!id) throw new ErrorHttp(400, `${nombre} inválido`);
  return id;
};

// --------------------------------------------------------------------------
// Estado del servidor
// --------------------------------------------------------------------------
app.get('/api/estado', async (req, res) => {
  let baseDatos = true;
  try {
    await pool.query('SELECT 1');
  } catch {
    baseDatos = false;
  }
  res.json({
    ok: true,
    baseDatos,
    mensaje: 'El servidor Node.js del Almacén Ferretero está en línea.'
  });
});

// --------------------------------------------------------------------------
// DASHBOARD
// --------------------------------------------------------------------------
function rutaDeVista(ruta, vista, etiqueta) {
  app.get(ruta, async (req, res) => {
    try {
      const resultado = await pool.query(`SELECT * FROM ${vista}`);
      res.json(resultado.rows);
    } catch (error) {
      responderError(res, error, 'Error interno del servidor al consultar la base de datos', `Error al consultar ${etiqueta}`);
    }
  });
}
rutaDeVista('/api/dashboard/resumen', 'vw_dashboard_resumen_hoy', 'el dashboard');
rutaDeVista('/api/dashboard/alertas', 'vw_dashboard_alertas_stock', 'alertas de stock');
rutaDeVista('/api/dashboard/ultimas-ventas', 'vw_dashboard_ultimas_ventas', 'últimas ventas');
rutaDeVista('/api/dashboard/ventas-mensuales', 'vw_dashboard_ventas_mensuales', 'ventas mensuales');

// --------------------------------------------------------------------------
// INVENTARIO
// --------------------------------------------------------------------------
async function obtenerCategoriaId(db, nombre) {
  const existente = await db.query('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [nombre]);
  if (existente.rows.length > 0) return existente.rows[0].id;
  const nueva = await db.query('INSERT INTO categorias (nombre) VALUES ($1) RETURNING id', [nombre]);
  return nueva.rows[0].id;
}

async function obtenerUnidadId(db, codigo) {
  const unidad = await db.query('SELECT id FROM unidades_medida WHERE codigo = $1', [codigo]);
  if (unidad.rows.length > 0) return unidad.rows[0].id;
  const porDefecto = await db.query("SELECT id FROM unidades_medida WHERE codigo = 'und'");
  if (porDefecto.rows.length > 0) return porDefecto.rows[0].id;
  throw new ErrorHttp(400, 'Unidad de medida no válida');
}

async function verificarUbicacion(db, id) {
  const u = await db.query('SELECT activo FROM ubicaciones_almacen WHERE id = $1', [id]);
  if (u.rows.length === 0) throw new ErrorHttp(400, 'La ubicación indicada no existe');
  if (!u.rows[0].activo) throw new ErrorHttp(400, 'La ubicación indicada está inactiva');
}

// Lee y valida los datos de un producto (acepta los nombres de campo del frontend y los de la BD)
function leerProducto(body) {
  const nombre = texto(body.nombre);
  if (!nombre) throw new ErrorHttp(400, 'El nombre del producto es obligatorio');
  if (nombre.length > 200) throw new ErrorHttp(400, 'El nombre del producto no puede superar 200 caracteres');

  const stock = numero(body.stock ?? body.stock_actual, 0);
  const stockMinimo = numero(body.stockMinimo ?? body.stock_minimo, 5);
  const precio = numero(body.precio ?? body.precio_venta, 0);
  if ([stock, stockMinimo, precio].some(n => Number.isNaN(n) || n < 0)) {
    throw new ErrorHttp(400, 'Stock, stock mínimo y precio deben ser números mayores o iguales a 0');
  }

  // Costo de compra por unidad (opcional): valoriza el stock inicial y los ajustes positivos en el FIFO
  const costoCrudo = body.costo ?? body.precioCompra ?? body.precio_compra;
  const costo = costoCrudo === undefined || costoCrudo === null || costoCrudo === '' ? undefined : numero(costoCrudo, 0);
  if (costo !== undefined && (Number.isNaN(costo) || costo < 0)) {
    throw new ErrorHttp(400, 'El costo de compra debe ser un número mayor o igual a 0');
  }

  const marca = body.marca === undefined ? undefined : texto(body.marca);
  if (marca && marca.length > 100) throw new ErrorHttp(400, 'La marca no puede superar 100 caracteres');
  let ubicacionId;
  if (body.ubicacionId !== undefined) {
    ubicacionId = body.ubicacionId === null || body.ubicacionId === '' ? null : parseId(body.ubicacionId);
    if (ubicacionId === 0 || (body.ubicacionId !== null && body.ubicacionId !== '' && !ubicacionId)) {
      throw new ErrorHttp(400, 'Ubicación inválida');
    }
  }

  return {
    nombre,
    marca,
    ubicacionId,
    categoria: texto(body.categoria) || 'General',
    unidad: texto(body.unidad || body.unidad_medida) || 'und',
    stock: redondear2(stock),
    stockMinimo: redondear2(stockMinimo),
    precio: redondear2(precio),
    costo: costo === undefined ? undefined : redondear2(costo)
  };
}

app.get('/api/inventario', async (req, res) => {
  try {
    // Los productos "eliminados" que tienen historial quedan desactivados y no se muestran
    const resultado = await pool.query('SELECT * FROM vw_inventario_completo WHERE activo = TRUE');
    // El vendedor ve precios de venta y stock, pero no cuánto costó comprar cada producto
    if (req.usuario.rol === ROLES.VENDEDOR) {
      return res.json(resultado.rows.map(({ precioCompra, ...resto }) => resto));
    }
    res.json(resultado.rows);
  } catch (error) {
    responderError(res, error, 'Error interno al cargar inventario', 'Error al consultar el inventario');
  }
});

app.post('/api/inventario', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const p = leerProducto(req.body || {});
    const producto = await enTransaccion(async (db) => {
      const categoriaId = await obtenerCategoriaId(db, p.categoria);
      const unidadId = await obtenerUnidadId(db, p.unidad);

      if (p.ubicacionId) await verificarUbicacion(db, p.ubicacionId);

      const nuevo = await db.query(
        `INSERT INTO productos (nombre, categoria_id, unidad_medida_id, stock_actual, stock_minimo, precio_venta, marca, ubicacion_id, precio_compra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [p.nombre, categoriaId, unidadId, p.stock, p.stockMinimo, p.precio, p.marca || null, p.ubicacionId || null, p.costo ?? 0]
      );
      const fila = nuevo.rows[0];
      const codigoInterno = 'PRD-' + String(fila.id).padStart(4, '0');
      await db.query('UPDATE productos SET codigo_interno = $1 WHERE id = $2 AND codigo_interno IS NULL', [codigoInterno, fila.id]);
      fila.codigo_interno = codigoInterno;

      // Si ya nace con stock, queda registrado en el Kardex y se crea su primer lote FIFO
      if (p.stock > 0) {
        const costoInicial = p.costo ?? 0;
        await db.query(
          `INSERT INTO kardex_movimientos
             (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_posterior, costo_unitario, referencia_origen, referencia_id, motivo)
           VALUES ($1, $4, 'INVENTARIO_INICIAL', $2, 0, $2, $5, 'INICIO', $3, 'Stock inicial al registrar el producto')`,
          [fila.id, p.stock, String(fila.id), req.usuario.id, costoInicial]
        );
        await db.query("SELECT fn_fifo_ingresar($1, $2, $3, 'INICIAL', $4)", [fila.id, p.stock, costoInicial, String(fila.id)]);
      }
      return fila;
    });
    res.status(201).json({ mensaje: 'Producto guardado correctamente', producto });
  } catch (error) {
    responderError(res, error, 'Error interno del servidor', 'Error al guardar el producto');
  }
});

// Editar un producto (modal completo o botones +/- de stock)
app.put('/api/inventario/:id', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const p = leerProducto(req.body || {});
    await enTransaccion(async (db) => {
      const actual = await db.query('SELECT stock_actual, marca, ubicacion_id, precio_compra FROM productos WHERE id = $1 FOR UPDATE', [id]);
      if (actual.rows.length === 0) throw new ErrorHttp(404, 'Producto no encontrado');
      const stockAnterior = redondear2(Number(actual.rows[0].stock_actual));
      // Si el frontend no manda marca o ubicación, se conservan las que ya tenía
      const marca = p.marca === undefined ? actual.rows[0].marca : (p.marca || null);
      const ubicacionId = p.ubicacionId === undefined ? actual.rows[0].ubicacion_id : p.ubicacionId;
      if (ubicacionId && ubicacionId !== actual.rows[0].ubicacion_id) await verificarUbicacion(db, ubicacionId);

      const categoriaId = await obtenerCategoriaId(db, p.categoria);
      const unidadId = await obtenerUnidadId(db, p.unidad);

      await db.query(
        `UPDATE productos
         SET nombre = $1, categoria_id = $2, unidad_medida_id = $3,
             stock_actual = $4, stock_minimo = $5, precio_venta = $6,
             marca = $8, ubicacion_id = $9
         WHERE id = $7`,
        [p.nombre, categoriaId, unidadId, p.stock, p.stockMinimo, p.precio, id, marca, ubicacionId]
      );

      // Todo cambio manual de stock queda en el Kardex y en los lotes FIFO:
      //  - si sube, entra un lote nuevo (con el costo indicado o el último costo de compra)
      //  - si baja, se descuenta del lote más antiguo
      if (p.stock !== stockAnterior) {
        const sube = p.stock > stockAnterior;
        const diferencia = redondear2(Math.abs(p.stock - stockAnterior));
        let costoMov;
        let totalMov;
        if (sube) {
          costoMov = p.costo ?? Number(actual.rows[0].precio_compra || 0);
          totalMov = redondear2(diferencia * costoMov);
          await db.query("SELECT fn_fifo_ingresar($1, $2, $3, 'AJUSTE', $4)", [id, diferencia, costoMov, String(id)]);
        } else {
          const consumo = await db.query('SELECT fn_fifo_consumir_total($1, $2) AS total', [id, diferencia]);
          totalMov = Number(consumo.rows[0].total || 0);
          costoMov = redondear2(totalMov / diferencia);
        }
        await db.query(
          `INSERT INTO kardex_movimientos
             (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_posterior, costo_unitario, costo_total, referencia_origen, referencia_id, motivo)
           VALUES ($1, $8, $2, $3, $4, $5, $9, $10, $6, $7, 'Ajuste manual desde Inventario')`,
          [id, sube ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO', diferencia,
            stockAnterior, p.stock, sube ? 'MANUAL_PLUS' : 'MANUAL_MINUS', String(id), req.usuario.id, costoMov, totalMov]
        );
      }
    });
    res.json({ ok: true, mensaje: 'Producto actualizado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error interno al actualizar', 'Error al actualizar el producto');
  }
});

app.delete('/api/inventario/:id', permitir(), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    try {
      const borrado = await pool.query('DELETE FROM productos WHERE id = $1', [id]);
      if (borrado.rowCount === 0) throw new ErrorHttp(404, 'Producto no encontrado');
      return res.json({ ok: true, mensaje: 'Producto eliminado correctamente' });
    } catch (error) {
      if (error.code !== PG.FK) throw error;
    }
    // Tiene ventas, compras o movimientos de Kardex: no se puede borrar sin perder el historial.
    // Se desactiva: deja de aparecer en el inventario, pero el historial se conserva.
    await pool.query('UPDATE productos SET activo = FALSE WHERE id = $1', [id]);
    res.json({
      ok: true,
      desactivado: true,
      mensaje: 'El producto tiene historial de movimientos, por eso se desactivó en lugar de borrarse.'
    });
  } catch (error) {
    responderError(res, error, 'Error al eliminar el producto', 'Error al eliminar el producto');
  }
});

// --------------------------------------------------------------------------
// CATEGORÍAS
// --------------------------------------------------------------------------
app.get('/api/categorias', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT id, nombre, descripcion, activo FROM categorias WHERE activo = true ORDER BY nombre ASC');
    res.json(resultado.rows);
  } catch (error) {
    responderError(res, error, 'Error interno al cargar categorías', 'Error al consultar categorías');
  }
});

app.post('/api/categorias', permitir(ROLES.ALMACENERO), async (req, res) => {
  const nombre = texto((req.body || {}).nombre);
  const descripcion = texto((req.body || {}).descripcion);
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
  }
  try {
    const existente = await pool.query('SELECT id, nombre, descripcion, activo FROM categorias WHERE LOWER(nombre) = LOWER($1)', [nombre]);
    if (existente.rows.length > 0) {
      return res.status(200).json({ ok: true, categoria: existente.rows[0], mensaje: 'La categoría ya existía' });
    }
    const nuevo = await pool.query(
      'INSERT INTO categorias (nombre, descripcion, activo) VALUES ($1, $2, true) RETURNING *',
      [nombre, descripcion || null]
    );
    res.status(201).json({ ok: true, categoria: nuevo.rows[0], mensaje: 'Categoría creada con éxito' });
  } catch (error) {
    responderError(res, error, 'Error interno al crear categoría', 'Error al crear categoría');
  }
});

// --------------------------------------------------------------------------
// VENTAS / POS
// --------------------------------------------------------------------------
app.get('/api/ventas', permitir(ROLES.VENDEDOR), async (req, res) => {
  try {
    const query = `
      SELECT
        v.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', dv.id,
                'producto_id', dv.producto_id,
                'producto', COALESCE(p.nombre, 'Producto #' || dv.producto_id),
                'cantidad', dv.cantidad::numeric,
                'precio', dv.precio_unitario::numeric,
                'subtotal', dv.subtotal::numeric
              )
              ORDER BY dv.id
            )
            FROM detalle_ventas dv
            LEFT JOIN productos p ON dv.producto_id = p.id
            WHERE dv.venta_id = v.venta_pk::bigint
          ),
          '[]'::json
        ) AS items
      FROM vw_ventas_listado v
      ORDER BY v.fecha_orden DESC
    `;
    const resultado = await pool.query(query);
    res.json(resultado.rows);
  } catch (error) {
    responderError(res, error, 'Error interno al cargar el historial de ventas', 'Error al consultar ventas');
  }
});

// Registrar una venta con su carrito. El trigger de la BD descuenta el stock y llena el Kardex.
app.post('/api/ventas', permitir(ROLES.VENDEDOR), async (req, res) => {
  const { cliente, metodoPago, carrito } = req.body || {};

  if (!texto(cliente)) {
    return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
  }
  if (!Array.isArray(carrito) || carrito.length === 0) {
    return res.status(400).json({ error: 'El carrito debe contener al menos un producto' });
  }

  try {
    const venta = await enTransaccion(async (db) => {
      // 0. Validar el carrito y completar precios desde la BD cuando el frontend no los manda
      const items = carrito.map((it, i) => {
        const productoId = parseId(it && it.producto_id);
        const cantidad = numero(it && it.cantidad, NaN);
        const precio = numero(it && it.precio, null);
        if (!productoId) throw new ErrorHttp(400, `Producto inválido en la posición ${i + 1} del carrito`);
        if (!(cantidad > 0)) throw new ErrorHttp(400, `La cantidad debe ser mayor a 0 (posición ${i + 1} del carrito)`);
        if (precio !== null && (Number.isNaN(precio) || precio < 0)) {
          throw new ErrorHttp(400, `Precio inválido en la posición ${i + 1} del carrito`);
        }
        return { productoId, cantidad, precio };
      });

      const ids = [...new Set(items.map(it => it.productoId))];
      const productos = await db.query('SELECT id, nombre, precio_venta, activo FROM productos WHERE id = ANY($1::int[])', [ids]);
      const porId = new Map(productos.rows.map(p => [p.id, p]));
      for (const it of items) {
        const p = porId.get(it.productoId);
        if (!p) throw new ErrorHttp(400, `El producto con ID ${it.productoId} no existe`);
        if (!p.activo) throw new ErrorHttp(400, `El producto "${p.nombre}" está desactivado`);
        if (it.precio === null) it.precio = Number(p.precio_venta);
        it.subtotal = redondear2(it.cantidad * it.precio);
      }

      // 1. Cliente (búsqueda o creación)
      const nombreCliente = texto(cliente);
      const clienteRes = await db.query('SELECT id FROM clientes WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [nombreCliente]);
      let clienteId;
      if (clienteRes.rows.length > 0) {
        clienteId = clienteRes.rows[0].id;
      } else {
        const nuevo = await db.query('INSERT INTO clientes (nombre, activo) VALUES ($1, true) RETURNING id', [nombreCliente]);
        clienteId = nuevo.rows[0].id;
      }

      // 2. Vendedor: el usuario que inició sesión (viene del token, no del body)
      const vendedorId = req.usuario.id;

      // 3. Método de pago (por nombre; si no coincide, el primero)
      const pago = await db.query('SELECT id FROM metodos_pago WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [texto(metodoPago) || 'Efectivo']);
      let metodoPagoId;
      if (pago.rows.length > 0) {
        metodoPagoId = pago.rows[0].id;
      } else {
        const primero = await db.query('SELECT id FROM metodos_pago ORDER BY id ASC LIMIT 1');
        if (primero.rows.length === 0) throw new ErrorHttp(500, 'No hay métodos de pago configurados');
        metodoPagoId = primero.rows[0].id;
      }

      // 4. Totales (los precios incluyen IGV; la tasa sale de la configuración de la empresa)
      const cfg = await db.query('SELECT porcentaje_igv FROM configuracion_empresa ORDER BY id ASC LIMIT 1');
      const tasaIgv = cfg.rows.length > 0 ? Number(cfg.rows[0].porcentaje_igv) : 18;
      const total = redondear2(items.reduce((acc, it) => acc + it.subtotal, 0));
      const subtotal = redondear2(total / (1 + tasaIgv / 100));
      const igv = redondear2(total - subtotal);

      // 5. Código correlativo (con bloqueo para que dos ventas simultáneas no repitan código)
      await bloquearCorrelativo(db, 'ventas_codigo');
      const maximo = await db.query(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo_comprobante, '[^0-9]', '', 'g'), '')::bigint), 100000) + 1 AS siguiente
         FROM ventas`
      );
      const codigo = '#' + String(maximo.rows[0].siguiente);

      // 6. Cabecera
      const cabecera = await db.query(
        `INSERT INTO ventas (codigo_comprobante, cliente_id, vendedor_id, metodo_pago_id, subtotal, igv, total, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETADA')
         RETURNING id, codigo_comprobante`,
        [codigo, clienteId, vendedorId, metodoPagoId, subtotal, igv, total]
      );
      const ventaId = cabecera.rows[0].id;

      // 7. Detalle (el trigger valida y descuenta el stock)
      for (const it of items) {
        await db.query(
          `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [ventaId, it.productoId, it.cantidad, it.precio, it.subtotal]
        );
      }
      return cabecera.rows[0];
    });

    res.status(201).json({ mensaje: 'Venta y carrito registrados con éxito', venta });
  } catch (error) {
    // Stock insuficiente: lo lanza el trigger (RAISE EXCEPTION) o el CHECK de stock_actual >= 0
    if (error.code === PG.RAISE) return res.status(400).json({ error: error.message });
    if (error.code === PG.CHECK) return res.status(400).json({ error: 'Stock insuficiente para completar la venta' });
    responderError(res, error, 'Error al registrar la venta', 'Error en la transacción de venta');
  }
});

// Anular una venta (el trigger de la BD restaura el stock)
app.put('/api/ventas/:codigo/anular', permitir(), async (req, res) => {
  const crudo = texto(req.params.codigo);
  const codigo = crudo.startsWith('#') ? crudo : `#${crudo}`;
  const motivo = texto((req.body || {}).motivo) || 'Anulado desde el sistema POS';

  try {
    const anulada = await pool.query(
      "UPDATE ventas SET estado = 'ANULADA', motivo_anulacion = $2 WHERE codigo_comprobante = $1 AND estado = 'COMPLETADA' RETURNING id",
      [codigo, motivo]
    );
    if (anulada.rowCount === 0) {
      const existe = await pool.query('SELECT estado FROM ventas WHERE codigo_comprobante = $1', [codigo]);
      if (existe.rows.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
      return res.status(409).json({ error: 'La venta ya estaba anulada' });
    }
    res.json({ ok: true, mensaje: 'Venta anulada y stock restaurado exitosamente' });
  } catch (error) {
    responderError(res, error, 'Error interno al anular', 'Error al anular venta');
  }
});

// --------------------------------------------------------------------------
// KARDEX (historial de movimientos de stock)
// --------------------------------------------------------------------------
const TIPOS_KARDEX = ['INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'SALIDA_VENTA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'ANULACION_VENTA', 'ANULACION_COMPRA'];

// Arma el WHERE del Kardex a partir de los filtros opcionales: productoId, tipo, sentido (ENTRADA/SALIDA),
// desde, hasta (fechas en hora de Lima) y q (texto). Lo usan la pantalla y la exportación a Excel.
function filtrosKardex(query) {
  const { productoId, tipo, sentido, desde, hasta, q } = query;
  const condiciones = [];
  const valores = [];
  const agregar = (sql, valor) => {
    valores.push(valor);
    condiciones.push(sql.replace('?', `$${valores.length}`));
  };

  if (productoId !== undefined && productoId !== '') agregar('"productoId" = ?', validarId(productoId, 'productoId'));
  if (tipo) {
    if (!TIPOS_KARDEX.includes(String(tipo))) throw new ErrorHttp(400, 'Tipo de movimiento no válido');
    agregar('tipo = ?', String(tipo));
  }
  if (sentido) {
    if (!['ENTRADA', 'SALIDA'].includes(String(sentido))) throw new ErrorHttp(400, 'Sentido no válido (ENTRADA o SALIDA)');
    agregar('sentido = ?', String(sentido));
  }
  if (desde) {
    const d = parseFecha(desde);
    if (!d) throw new ErrorHttp(400, 'La fecha "desde" no es válida');
    agregar(`("fechaHora" AT TIME ZONE ${ZONA})::date >= ?::date`, d);
  }
  if (hasta) {
    const h = parseFecha(hasta);
    if (!h) throw new ErrorHttp(400, 'La fecha "hasta" no es válida');
    agregar(`("fechaHora" AT TIME ZONE ${ZONA})::date <= ?::date`, h);
  }
  if (texto(q)) {
    valores.push(`%${texto(q).replace(/[\\%_]/g, '\\$&')}%`);
    const n = valores.length;
    condiciones.push(`(producto ILIKE $${n} OR COALESCE(referencia, '') ILIKE $${n} OR COALESCE("codigoInterno", '') ILIKE $${n})`);
  }
  return { donde: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', valores };
}

const numerosKardex = (f) => ({
  ...f,
  id: Number(f.id),
  cantidad: Number(f.cantidad),
  stockAnterior: Number(f.stockAnterior),
  stockPosterior: Number(f.stockPosterior),
  costoUnitario: Number(f.costoUnitario || 0),
  costoTotal: Number(f.costoTotal || 0),
  precioUnitario: Number(f.precioUnitario || 0),
  valorVenta: f.valorVenta === null || f.valorVenta === undefined ? null : Number(f.valorVenta),
  saldoValorizado: Number(f.saldoValorizado || 0)
});

app.get('/api/kardex', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const { donde, valores } = filtrosKardex(req.query);
    const limite = Math.min(parseId(req.query.limite) || 500, 2000);
    const resultado = await pool.query(
      `SELECT * FROM vw_kardex_listado ${donde} ORDER BY id DESC LIMIT ${limite}`,
      valores
    );
    // El orden es por id (no por fecha): el id se asigna con el producto ya bloqueado, así que sigue el orden real
    // en que cambió el stock aunque dos ventas ocurran al mismo tiempo. Así el saldo siempre cuadra.
    res.json(resultado.rows.map(numerosKardex));
  } catch (error) {
    responderError(res, error, 'Error al cargar el kardex', 'Error al consultar el kardex');
  }
});

// Excel del Kardex valorizado (mismos filtros que la pantalla). Hojas: Kardex y Lotes FIFO.
app.get('/api/kardex/excel', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const { donde, valores } = filtrosKardex(req.query);
    const maximo = 20000;
    const limite = Math.min(parseId(req.query.limite) || 5000, maximo);
    const productoId = req.query.productoId !== undefined && req.query.productoId !== '' ? validarId(req.query.productoId, 'productoId') : null;

    // Se toman los movimientos MÁS RECIENTES y se ordenan por producto y por orden real (id) para que el saldo se lea de arriba abajo
    const movs = await pool.query(
      `SELECT * FROM (SELECT * FROM vw_kardex_listado ${donde} ORDER BY id DESC LIMIT ${limite}) k ORDER BY producto, "productoId", id`,
      valores
    );
    const filtroLotes = productoId ? 'WHERE "productoId" = $1' : '';
    const lotes = await pool.query(
      `SELECT * FROM vw_lotes_fifo ${filtroLotes ? filtroLotes + ' AND' : 'WHERE'} "cantidadRestante" > 0 ORDER BY producto, "fechaIngreso", id`,
      productoId ? [productoId] : []
    );
    const resumen = await pool.query(
      `SELECT p.nombre AS producto, p.codigo_interno AS "codigoInterno", um.codigo AS unidad,
              p.stock_actual AS stock, p.precio_compra AS "ultimoCosto",
              COUNT(l.id) FILTER (WHERE l.cantidad_restante > 0) AS lotes,
              COALESCE(SUM(l.cantidad_restante * l.costo_unitario), 0) AS valor
         FROM productos p
         JOIN unidades_medida um ON um.id = p.unidad_medida_id
         LEFT JOIN lotes_inventario l ON l.producto_id = p.id
        ${productoId ? 'WHERE p.id = $1' : ''}
        GROUP BY p.id, um.codigo
        ORDER BY p.nombre`,
      productoId ? [productoId] : []
    );
    const empresa = await pool.query('SELECT nombre_comercial FROM configuracion_empresa ORDER BY id ASC LIMIT 1');
    const quien = await pool.query('SELECT nombre_completo FROM usuarios WHERE id = $1', [req.usuario.id]);

    const nombreProducto = productoId ? (resumen.rows[0] && resumen.rows[0].producto) || `N.º ${productoId}` : '';
    const archivo = construirExcelKardex({
      movimientos: movs.rows.map(numerosKardex),
      lotes: lotes.rows,
      resumen: resumen.rows,
      productoUnico: !!productoId,
      limitado: movs.rows.length >= limite,
      usuario: quien.rows[0] && quien.rows[0].nombre_completo,
      empresa: empresa.rows[0] && empresa.rows[0].nombre_comercial,
      filtros: {
        producto: nombreProducto,
        tipo: req.query.tipo ? String(req.query.tipo) : '',
        sentido: req.query.sentido ? String(req.query.sentido) : '',
        desde: req.query.desde ? parseFecha(req.query.desde) : '',
        hasta: req.query.hasta ? parseFecha(req.query.hasta) : '',
        q: texto(req.query.q)
      }
    });

    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Kardex_valorizado_${hoy}.xlsx"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(archivo);
  } catch (error) {
    responderError(res, error, 'Error al generar el Excel del kardex', 'Error al exportar el kardex');
  }
});

// --------------------------------------------------------------------------
// LOTES FIFO (valorización del inventario por orden de llegada)
// --------------------------------------------------------------------------
// Filtros opcionales: productoId; todos=1 incluye también los lotes ya agotados
app.get('/api/lotes', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const condiciones = [];
    const valores = [];
    if (req.query.productoId) {
      const productoId = parseId(req.query.productoId);
      if (!productoId) throw new ErrorHttp(400, 'Producto inválido');
      valores.push(productoId);
      condiciones.push(`"productoId" = $${valores.length}`);
    }
    if (req.query.todos !== '1') condiciones.push('"cantidadRestante" > 0');
    const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const resultado = await pool.query(
      `SELECT * FROM vw_lotes_fifo ${donde} ORDER BY producto, "fechaIngreso", id`,
      valores
    );
    const lotes = resultado.rows.map(f => ({
      ...f,
      id: Number(f.id),
      cantidadInicial: Number(f.cantidadInicial),
      cantidadRestante: Number(f.cantidadRestante),
      costoUnitario: Number(f.costoUnitario),
      valor: Number(f.valor),
      ordenSalida: f.ordenSalida === null ? null : Number(f.ordenSalida)
    }));
    const valorTotal = redondear2(lotes.reduce((acc, l) => acc + l.valor, 0));
    res.json({ valorTotal, lotes });
  } catch (error) {
    responderError(res, error, 'Error al cargar los lotes', 'Error al consultar los lotes FIFO');
  }
});

// --------------------------------------------------------------------------
// MAPEO DE PRODUCTOS (1): ubicaciones del almacén
// --------------------------------------------------------------------------
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function leerUbicacion(body) {
  const zona = texto(body.zona);
  const pasillo = texto(body.pasillo).toUpperCase();
  const estante = texto(body.estante).toUpperCase();
  const nivel = numero(body.nivel, 1);
  const descripcion = texto(body.descripcion);

  if (!zona || !pasillo || !estante) throw new ErrorHttp(400, 'Zona, pasillo y estante son obligatorios');
  if (zona.length > 60) throw new ErrorHttp(400, 'La zona no puede superar 60 caracteres');
  if (pasillo.length > 10 || estante.length > 10) throw new ErrorHttp(400, 'Pasillo y estante admiten hasta 10 caracteres');
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 50) throw new ErrorHttp(400, 'El nivel debe ser un número entero entre 1 y 50');
  if (descripcion.length > 150) throw new ErrorHttp(400, 'La descripción no puede superar 150 caracteres');

  const codigo = (texto(body.codigo) || `${sinTildes(zona).charAt(0)}-${pasillo}-${estante}-${nivel}`).toUpperCase();
  if (codigo.length > 30) throw new ErrorHttp(400, 'El código no puede superar 30 caracteres');
  return { zona, pasillo, estante, nivel, descripcion, codigo };
}

app.get('/api/ubicaciones', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT u.id, u.codigo, u.zona, u.pasillo, u.estante, u.nivel, u.descripcion, u.activo,
              COALESCE(
                json_agg(json_build_object('id', p.id, 'nombre', p.nombre, 'stock', p.stock_actual, 'unidad', um.codigo)
                         ORDER BY p.nombre) FILTER (WHERE p.id IS NOT NULL AND p.activo),
                '[]'::json) AS productos
       FROM ubicaciones_almacen u
       LEFT JOIN productos p ON p.ubicacion_id = u.id
       LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
       GROUP BY u.id
       ORDER BY u.zona, u.pasillo, u.estante, u.nivel`
    );
    res.json(resultado.rows);
  } catch (error) {
    responderError(res, error, 'Error al cargar las ubicaciones', 'Error al consultar ubicaciones');
  }
});

const MENSAJE_UBICACION_REPETIDA = 'Ya existe una ubicación con ese código o con esa misma zona, pasillo, estante y nivel';

app.post('/api/ubicaciones', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const u = leerUbicacion(req.body || {});
    const resultado = await pool.query(
      `INSERT INTO ubicaciones_almacen (codigo, zona, pasillo, estante, nivel, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [u.codigo, u.zona, u.pasillo, u.estante, u.nivel, u.descripcion || null]
    );
    res.status(201).json({ mensaje: 'Ubicación creada correctamente', ubicacion: resultado.rows[0] });
  } catch (error) {
    if (error.code === PG.UNICO) return res.status(409).json({ error: MENSAJE_UBICACION_REPETIDA });
    responderError(res, error, 'Error al crear la ubicación', 'Error al crear ubicación');
  }
});

app.put('/api/ubicaciones/:id', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const u = leerUbicacion(req.body || {});
    const resultado = await pool.query(
      `UPDATE ubicaciones_almacen
       SET codigo = $1, zona = $2, pasillo = $3, estante = $4, nivel = $5, descripcion = $6,
           activo = COALESCE($7, activo)
       WHERE id = $8 RETURNING *`,
      [u.codigo, u.zona, u.pasillo, u.estante, u.nivel, u.descripcion || null, aBooleano((req.body || {}).activo), id]
    );
    if (resultado.rows.length === 0) throw new ErrorHttp(404, 'Ubicación no encontrada');
    res.json({ ok: true, mensaje: 'Ubicación actualizada correctamente', ubicacion: resultado.rows[0] });
  } catch (error) {
    if (error.code === PG.UNICO) return res.status(409).json({ error: MENSAJE_UBICACION_REPETIDA });
    responderError(res, error, 'Error al actualizar la ubicación', 'Error al actualizar ubicación');
  }
});

app.delete('/api/ubicaciones/:id', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const borrada = await pool.query('DELETE FROM ubicaciones_almacen WHERE id = $1', [id]);
    if (borrada.rowCount === 0) throw new ErrorHttp(404, 'Ubicación no encontrada');
    res.json({ ok: true, mensaje: 'Ubicación eliminada correctamente' });
  } catch (error) {
    if (error.code === PG.FK) {
      return res.status(409).json({ error: 'Esa ubicación tiene productos asignados. Reubícalos primero o márcala como inactiva.' });
    }
    responderError(res, error, 'Error al eliminar la ubicación', 'Error al eliminar ubicación');
  }
});

// Asignar (o quitar, con ubicacionId = null) la ubicación de un producto
app.put('/api/inventario/:id/ubicacion', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const { ubicacionId } = req.body || {};
    const destino = ubicacionId === null || ubicacionId === undefined || ubicacionId === '' ? null : validarId(ubicacionId, 'ubicacionId');
    if (destino) await verificarUbicacion(pool, destino);
    const resultado = await pool.query('UPDATE productos SET ubicacion_id = $1 WHERE id = $2', [destino, id]);
    if (resultado.rowCount === 0) throw new ErrorHttp(404, 'Producto no encontrado');
    res.json({ ok: true, mensaje: destino ? 'Producto ubicado correctamente' : 'Se quitó la ubicación del producto' });
  } catch (error) {
    responderError(res, error, 'Error al asignar la ubicación', 'Error al asignar ubicación');
  }
});

// --------------------------------------------------------------------------
// MAPEO DE PRODUCTOS (2): qué proveedor vende cada producto
// --------------------------------------------------------------------------
app.get('/api/productos-proveedores', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const condiciones = [];
    const valores = [];
    if (req.query.productoId !== undefined && req.query.productoId !== '') {
      valores.push(validarId(req.query.productoId, 'productoId'));
      condiciones.push(`pp.producto_id = $${valores.length}`);
    }
    if (req.query.proveedorId !== undefined && req.query.proveedorId !== '') {
      valores.push(validarId(req.query.proveedorId, 'proveedorId'));
      condiciones.push(`pp.proveedor_id = $${valores.length}`);
    }
    const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const resultado = await pool.query(
      `SELECT pp.producto_id AS "productoId", p.nombre AS producto,
              pp.proveedor_id AS "proveedorId", pr.empresa AS proveedor, pr.ruc,
              pp.codigo_proveedor AS "codigoProveedor", pp.precio_compra::float8 AS "precioCompra",
              pp.plazo_entrega_dias AS "plazoEntregaDias", pp.es_principal AS "esPrincipal"
       FROM producto_proveedor pp
       JOIN productos p ON p.id = pp.producto_id
       JOIN proveedores pr ON pr.id = pp.proveedor_id
       ${donde}
       ORDER BY p.nombre, pp.es_principal DESC, pr.empresa`,
      valores
    );
    res.json(resultado.rows);
  } catch (error) {
    responderError(res, error, 'Error al cargar el mapeo producto-proveedor', 'Error al consultar producto-proveedor');
  }
});

// Crea el vínculo o lo actualiza si ya existe. Un producto solo puede tener un proveedor principal.
app.put('/api/productos-proveedores', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const b = req.body || {};
    const productoId = validarId(b.productoId, 'productoId');
    const proveedorId = validarId(b.proveedorId, 'proveedorId');
    const precio = numero(b.precioCompra, 0);
    const plazo = numero(b.plazoEntregaDias, 1);
    const codigoProveedor = texto(b.codigoProveedor);
    if (Number.isNaN(precio) || precio < 0) throw new ErrorHttp(400, 'El precio de compra debe ser un número mayor o igual a 0');
    if (!Number.isInteger(plazo) || plazo < 0 || plazo > 365) throw new ErrorHttp(400, 'El plazo de entrega debe ser un número entero de días (0 a 365)');
    if (codigoProveedor.length > 60) throw new ErrorHttp(400, 'El código del proveedor no puede superar 60 caracteres');
    const esPrincipal = aBooleano(b.esPrincipal) === true;

    await enTransaccion(async (db) => {
      const existe = await db.query(
        'SELECT (SELECT COUNT(*) FROM productos WHERE id = $1) AS p, (SELECT COUNT(*) FROM proveedores WHERE id = $2) AS pr',
        [productoId, proveedorId]
      );
      if (Number(existe.rows[0].p) === 0) throw new ErrorHttp(404, 'Producto no encontrado');
      if (Number(existe.rows[0].pr) === 0) throw new ErrorHttp(404, 'Proveedor no encontrado');

      if (esPrincipal) {
        await db.query('UPDATE producto_proveedor SET es_principal = FALSE WHERE producto_id = $1 AND proveedor_id <> $2', [productoId, proveedorId]);
      }
      await db.query(
        `INSERT INTO producto_proveedor (producto_id, proveedor_id, codigo_proveedor, precio_compra, plazo_entrega_dias, es_principal)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (producto_id, proveedor_id) DO UPDATE
         SET codigo_proveedor = EXCLUDED.codigo_proveedor, precio_compra = EXCLUDED.precio_compra,
             plazo_entrega_dias = EXCLUDED.plazo_entrega_dias, es_principal = EXCLUDED.es_principal`,
        [productoId, proveedorId, codigoProveedor || null, redondear2(precio), plazo, esPrincipal]
      );
    });
    res.json({ ok: true, mensaje: 'Vínculo producto-proveedor guardado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al guardar el vínculo', 'Error al guardar producto-proveedor');
  }
});

app.delete('/api/productos-proveedores/:productoId/:proveedorId', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const productoId = validarId(req.params.productoId, 'productoId');
    const proveedorId = validarId(req.params.proveedorId, 'proveedorId');
    const borrado = await pool.query('DELETE FROM producto_proveedor WHERE producto_id = $1 AND proveedor_id = $2', [productoId, proveedorId]);
    if (borrado.rowCount === 0) throw new ErrorHttp(404, 'Ese vínculo no existe');
    res.json({ ok: true, mensaje: 'Vínculo eliminado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar el vínculo', 'Error al eliminar producto-proveedor');
  }
});

// --------------------------------------------------------------------------
// CLIENTES
// --------------------------------------------------------------------------
const mapearCliente = (c) => ({
  id: c.id,
  nombre: c.nombre || '',
  telefono: c.telefono || '',
  email: c.email || '',
  direccion: c.direccion || '',
  activo: c.activo ?? true
});

app.get('/api/clientes', permitir(ROLES.VENDEDOR), async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
    res.json(resultado.rows.map(mapearCliente));
  } catch (error) {
    responderError(res, error, 'Error interno al cargar clientes', 'Error al consultar clientes');
  }
});

app.post('/api/clientes', permitir(ROLES.VENDEDOR), async (req, res) => {
  const { nombre, telefono, email, direccion } = req.body || {};
  if (!texto(nombre)) {
    return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO clientes (nombre, telefono, email, direccion, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [texto(nombre), texto(telefono), texto(email), texto(direccion)]
    );
    res.status(201).json(mapearCliente(resultado.rows[0]));
  } catch (error) {
    responderError(res, error, 'Error al guardar el cliente', 'Error al crear cliente');
  }
});

// Editar un cliente (datos o interruptor Activo/Inactivo): solo cambia lo que llega en el body
app.put('/api/clientes/:id', permitir(ROLES.VENDEDOR), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const { nombre, telefono, email, direccion, activo } = req.body || {};
    if (nombre !== undefined && !texto(nombre)) {
      throw new ErrorHttp(400, 'El nombre del cliente no puede estar vacío');
    }
    const resultado = await pool.query(
      `UPDATE clientes
       SET nombre = COALESCE($1, nombre),
           telefono = COALESCE($2, telefono),
           email = COALESCE($3, email),
           direccion = COALESCE($4, direccion),
           activo = COALESCE($5, activo)
       WHERE id = $6
       RETURNING *`,
      [
        nombre === undefined || nombre === null ? null : texto(nombre),
        telefono === undefined || telefono === null ? null : texto(telefono),
        email === undefined || email === null ? null : texto(email),
        direccion === undefined || direccion === null ? null : texto(direccion),
        aBooleano(activo),
        id
      ]
    );
    if (resultado.rows.length === 0) throw new ErrorHttp(404, 'Cliente no encontrado');
    res.json({ ok: true, cliente: resultado.rows[0] });
  } catch (error) {
    responderError(res, error, 'Error al actualizar el cliente', 'Error al actualizar cliente');
  }
});

app.delete('/api/clientes/:id', permitir(), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const borrado = await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    if (borrado.rowCount === 0) throw new ErrorHttp(404, 'Cliente no encontrado');
    res.json({ ok: true, mensaje: 'Cliente eliminado correctamente' });
  } catch (error) {
    if (error.code === PG.FK) {
      return res.status(409).json({ error: 'No se puede eliminar este cliente porque ya tiene ventas registradas. Puedes marcarlo como Inactivo.' });
    }
    responderError(res, error, 'Error al eliminar el cliente', 'Error al eliminar cliente');
  }
});

// --------------------------------------------------------------------------
// PROVEEDORES
// --------------------------------------------------------------------------
const mapearProveedor = (p) => ({
  id: p.id,
  ruc: p.ruc || '',
  empresa: p.empresa || '',
  contacto: p.contacto || '',
  telefono: p.telefono || '',
  email: p.email || '',
  direccion: p.direccion || '',
  ciudad: p.ciudad || '',
  condicionPago: p.condicion_pago || 'CONTADO',
  diasCredito: p.dias_credito || 0,
  productos: p.productos || '',
  activo: p.activo ?? true
});

const MENSAJE_RUC_INVALIDO = 'El RUC no es válido: debe tener 11 dígitos, empezar con 10, 15, 17 o 20 y tener el dígito verificador correcto';

// Lee y valida los datos de un proveedor. Los campos que no llegan quedan en `undefined` (= no cambiar).
function leerProveedor(body, { creando }) {
  const campo = (valor, nombre, max) => {
    if (valor === undefined || valor === null) return undefined;
    const t = texto(String(valor));
    if (t.length > max) throw new ErrorHttp(400, `${nombre} no puede superar ${max} caracteres`);
    return t;
  };

  const empresa = campo(body.empresa, 'El nombre de la empresa', 200);
  if (creando && !empresa) throw new ErrorHttp(400, 'El nombre de la empresa es obligatorio');
  if (empresa !== undefined && !empresa) throw new ErrorHttp(400, 'El nombre de la empresa no puede estar vacío');

  const ruc = campo(body.ruc, 'El RUC', 11);
  if (creando && !ruc) throw new ErrorHttp(400, 'El RUC del proveedor es obligatorio');

  const email = campo(body.email, 'El correo', 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorHttp(400, 'El correo del proveedor no es válido');

  let condicionPago;
  if (body.condicionPago !== undefined && body.condicionPago !== null) {
    condicionPago = texto(String(body.condicionPago)).toUpperCase();
    if (!['CONTADO', 'CREDITO'].includes(condicionPago)) throw new ErrorHttp(400, 'La condición de pago debe ser CONTADO o CREDITO');
  }
  let diasCredito = numero(body.diasCredito, undefined);
  if (diasCredito !== undefined && (!Number.isInteger(diasCredito) || diasCredito < 0 || diasCredito > 365)) {
    throw new ErrorHttp(400, 'Los días de crédito deben ser un número entero entre 0 y 365');
  }
  if (condicionPago === 'CONTADO') diasCredito = 0;

  return {
    empresa, ruc, email, condicionPago, diasCredito,
    contacto: campo(body.contacto, 'El contacto', 150),
    telefono: campo(body.telefono, 'El teléfono', 30),
    direccion: campo(body.direccion, 'La dirección', 300),
    ciudad: campo(body.ciudad, 'La ciudad', 100),
    productos: campo(body.productos, 'El detalle de productos', 255),
    observaciones: campo(body.observaciones, 'Las observaciones', 1000)
  };
}

const respuestaRucRepetido = (res) => res.status(409).json({ error: 'Ya existe un proveedor registrado con ese RUC' });

app.get('/api/proveedores', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM proveedores ORDER BY id DESC');
    res.json(resultado.rows.map(mapearProveedor));
  } catch (error) {
    responderError(res, error, 'Error interno al cargar proveedores', 'Error al consultar proveedores');
  }
});

app.post('/api/proveedores', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const p = leerProveedor(req.body || {}, { creando: true });
    if (!rucValido(p.ruc)) throw new ErrorHttp(400, MENSAJE_RUC_INVALIDO);
    const resultado = await pool.query(
      `INSERT INTO proveedores (ruc, empresa, contacto, telefono, email, direccion, ciudad, condicion_pago, dias_credito, productos, observaciones, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
       RETURNING *`,
      [p.ruc, p.empresa, p.contacto || null, p.telefono || null, p.email || null, p.direccion || null, p.ciudad || null,
      p.condicionPago || 'CONTADO', p.diasCredito || 0, p.productos || null, p.observaciones || null]
    );
    res.status(201).json(mapearProveedor(resultado.rows[0]));
  } catch (error) {
    if (error.code === PG.UNICO) return respuestaRucRepetido(res);
    responderError(res, error, 'Error al guardar el proveedor', 'Error al crear proveedor');
  }
});

app.put('/api/proveedores/:id', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const p = leerProveedor(req.body || {}, { creando: false });

    const actual = await pool.query('SELECT ruc FROM proveedores WHERE id = $1', [id]);
    if (actual.rows.length === 0) throw new ErrorHttp(404, 'Proveedor no encontrado');
    // Solo se valida el RUC si cambió (así no se bloquean proveedores antiguos con un RUC que no cumplía)
    if (p.ruc !== undefined && p.ruc !== (actual.rows[0].ruc || '') && !rucValido(p.ruc)) {
      throw new ErrorHttp(400, MENSAJE_RUC_INVALIDO);
    }

    const aValor = (v) => (v === undefined ? null : v);
    const resultado = await pool.query(
      `UPDATE proveedores
       SET empresa = COALESCE($1, empresa),
           contacto = COALESCE($2, contacto),
           telefono = COALESCE($3, telefono),
           email = COALESCE($4, email),
           productos = COALESCE($5, productos),
           activo = COALESCE($6, activo),
           ruc = CASE WHEN $7::text IS NULL THEN ruc ELSE NULLIF($7::text, '') END,
           direccion = COALESCE($8, direccion),
           ciudad = COALESCE($9, ciudad),
           condicion_pago = COALESCE($10, condicion_pago),
           dias_credito = COALESCE($11, dias_credito),
           observaciones = COALESCE($12, observaciones)
       WHERE id = $13
       RETURNING *`,
      [aValor(p.empresa), aValor(p.contacto), aValor(p.telefono), aValor(p.email), aValor(p.productos),
      aBooleano((req.body || {}).activo), aValor(p.ruc), aValor(p.direccion), aValor(p.ciudad),
      aValor(p.condicionPago), aValor(p.diasCredito), aValor(p.observaciones), id]
    );
    res.json({ ok: true, proveedor: mapearProveedor(resultado.rows[0]) });
  } catch (error) {
    if (error.code === PG.UNICO) return respuestaRucRepetido(res);
    responderError(res, error, 'Error al actualizar el proveedor', 'Error al actualizar proveedor');
  }
});

app.delete('/api/proveedores/:id', permitir(), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const borrado = await pool.query('DELETE FROM proveedores WHERE id = $1', [id]);
    if (borrado.rowCount === 0) throw new ErrorHttp(404, 'Proveedor no encontrado');
    res.json({ ok: true, mensaje: 'Proveedor eliminado correctamente' });
  } catch (error) {
    if (error.code === PG.FK) {
      return res.status(409).json({ error: 'No se puede eliminar porque tiene compras asociadas. Puedes marcarlo como Inactivo.' });
    }
    responderError(res, error, 'Error al eliminar el proveedor', 'Error al eliminar proveedor');
  }
});

// --------------------------------------------------------------------------
// COMPRAS
// --------------------------------------------------------------------------
app.get('/api/compras', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        c.id,
        COALESCE(p.empresa, 'Proveedor #' || c.proveedor_id) AS proveedor,
        c.descripcion,
        c.cantidad_total,
        c.costo_total,
        TO_CHAR(c.fecha_compra, 'DD/MM/YYYY') AS fecha,
        EXTRACT(EPOCH FROM c.created_at) * 1000 AS ts,
        c.estado
      FROM compras c
      LEFT JOIN proveedores p ON c.proveedor_id = p.id
      ORDER BY c.fecha_compra DESC, c.id DESC
    `);
    res.json(resultado.rows.map(c => ({
      id: c.id,
      proveedor: c.proveedor || 'Proveedor General',
      descripcion: c.descripcion || '',
      cantidad: Number(c.cantidad_total || 0),
      costoTotal: Number(c.costo_total || 0),
      fecha: c.fecha || '',
      ts: Number(c.ts || Date.now()),
      estado: c.estado === 'Recibido' ? 'Recibido' : 'Pendiente'
    })));
  } catch (error) {
    responderError(res, error, 'Error interno al cargar compras', 'Error al consultar compras');
  }
});

// Registrar una compra. Si entra como "Recibido", se pasa por el trigger de la BD,
// que suma el stock y deja el movimiento en el Kardex (una sola lógica para ambos casos).
app.post('/api/compras', permitir(ROLES.ALMACENERO), async (req, res) => {
  const { proveedor, descripcion, cantidad, costoTotal, producto_id, estado } = req.body || {};
  try {
    const nombreProveedor = texto(proveedor);
    const descripcionCompra = texto(descripcion);
    if (!nombreProveedor || !descripcionCompra) {
      throw new ErrorHttp(400, 'El proveedor y la descripción son obligatorios');
    }
    const cant = numero(cantidad, 1);
    const costo = numero(costoTotal, 0);
    if (!(cant > 0)) throw new ErrorHttp(400, 'La cantidad debe ser mayor a 0');
    if (Number.isNaN(costo) || costo < 0) throw new ErrorHttp(400, 'El costo total debe ser un número mayor o igual a 0');
    const costoUnitario = redondear2(costo / cant);
    const recibida = String(estado || '').toLowerCase() !== 'pendiente';

    const resultado = await enTransaccion(async (db) => {
      // Proveedor (por nombre de empresa; si no existe se crea)
      const prov = await db.query('SELECT id FROM proveedores WHERE LOWER(empresa) = LOWER($1) LIMIT 1', [nombreProveedor]);
      let proveedorId;
      if (prov.rows.length > 0) {
        proveedorId = prov.rows[0].id;
      } else {
        const nuevo = await db.query('INSERT INTO proveedores (empresa, activo) VALUES ($1, true) RETURNING id', [nombreProveedor]);
        proveedorId = nuevo.rows[0].id;
      }

      const usuarioId = req.usuario.id; // quien inició sesión (token)

      // Número de guía correlativo de la serie F001 (F001-0004522, ...)
      await bloquearCorrelativo(db, 'compras_guia');
      const maximo = await db.query(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero_guia_factura, '-', 2), '[^0-9]', '', 'g'), '')::bigint), 4521) + 1 AS siguiente
         FROM compras
         WHERE numero_guia_factura LIKE 'F001-%'`
      );
      const numeroGuia = 'F001-' + String(maximo.rows[0].siguiente).padStart(7, '0');

      // Siempre se inserta como Pendiente; si corresponde, luego se marca Recibido (dispara el trigger)
      const compra = await db.query(
        `INSERT INTO compras
           (proveedor_id, usuario_id, numero_guia_factura, descripcion, cantidad_total, costo_total, estado, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pendiente', 'Registrado desde el sistema web')
         RETURNING id`,
        [proveedorId, usuarioId, numeroGuia, descripcionCompra, cant, costo]
      );
      const compraId = compra.rows[0].id;

      // Producto asociado: el indicado por el frontend o el que coincida con la descripción
      let productoId = null;
      if (producto_id !== undefined && producto_id !== null && producto_id !== '') {
        productoId = parseId(producto_id);
        if (!productoId) throw new ErrorHttp(400, 'producto_id inválido');
      } else {
        const porNombre = await db.query('SELECT id FROM productos WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [descripcionCompra]);
        if (porNombre.rows.length > 0) productoId = porNombre.rows[0].id;
      }
      if (productoId) {
        await db.query(
          `INSERT INTO detalle_compras (compra_id, producto_id, descripcion_item, cantidad, costo_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [compraId, productoId, descripcionCompra, cant, costoUnitario, costo]
        );
      }

      if (recibida) {
        await db.query("UPDATE compras SET estado = 'Recibido', fecha_recepcion = NOW() WHERE id = $1", [compraId]);
      }

      const final = await db.query('SELECT * FROM compras WHERE id = $1', [compraId]);
      return { compra: final.rows[0], stockActualizado: recibida && Boolean(productoId) };
    });

    res.status(201).json({ ok: true, ...resultado });
  } catch (error) {
    if (error.code === PG.FK) {
      return res.status(400).json({ error: 'El producto indicado no existe en el inventario' });
    }
    responderError(res, error, 'Error al registrar la compra en PostgreSQL', 'Error al insertar en compras');
  }
});

// Marcar una compra como "Recibido" y sumar el stock (lo hace el trigger fn_recepcion_compra)
app.put('/api/compras/:id/recibir', permitir(ROLES.ALMACENERO), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const resultado = await enTransaccion(async (db) => {
      const compraRes = await db.query('SELECT * FROM compras WHERE id = $1 FOR UPDATE', [id]);
      if (compraRes.rows.length === 0) throw new ErrorHttp(404, 'Compra no encontrada');
      const compra = compraRes.rows[0];

      if (compra.estado === 'Recibido') return { yaRecibida: true };
      if (compra.estado === 'Cancelado') throw new ErrorHttp(409, 'No se puede recibir una compra cancelada');

      // Si la compra no tiene detalle, intentamos vincularla con un producto por su descripción
      let detalles = await db.query('SELECT id FROM detalle_compras WHERE compra_id = $1', [id]);
      if (detalles.rows.length === 0) {
        const producto = await db.query('SELECT id FROM productos WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [texto(compra.descripcion)]);
        if (producto.rows.length > 0) {
          const cant = Number(compra.cantidad_total || 1);
          const costo = Number(compra.costo_total || 0);
          await db.query(
            `INSERT INTO detalle_compras (compra_id, producto_id, descripcion_item, cantidad, costo_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, producto.rows[0].id, compra.descripcion, cant, cant > 0 ? redondear2(costo / cant) : 0, costo]
          );
          detalles = { rows: [{}] };
        }
      }

      await db.query("UPDATE compras SET estado = 'Recibido', fecha_recepcion = NOW() WHERE id = $1", [id]);
      return { yaRecibida: false, stockActualizado: detalles.rows.length > 0 };
    });

    if (resultado.yaRecibida) {
      return res.json({ ok: true, mensaje: 'La compra ya había sido marcada como recibida' });
    }
    res.json({
      ok: true,
      stockActualizado: resultado.stockActualizado,
      mensaje: resultado.stockActualizado
        ? 'Pedido marcado como recibido y stock sumado al inventario'
        : 'Pedido marcado como recibido. No coincide con ningún producto del inventario, así que el stock no cambió.'
    });
  } catch (error) {
    responderError(res, error, 'Error al actualizar el estado de la compra', 'Error al recibir compra');
  }
});

app.delete('/api/compras/:id', permitir(), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const borrado = await pool.query('DELETE FROM compras WHERE id = $1', [id]);
    if (borrado.rowCount === 0) throw new ErrorHttp(404, 'Compra no encontrada');
    res.json({ ok: true, mensaje: 'Compra eliminada correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar la compra', 'Error al eliminar compra');
  }
});

// --------------------------------------------------------------------------
// REPORTES
// --------------------------------------------------------------------------
const CATEGORIAS_REPORTE = ['Incidencia', 'Stock', 'Ventas', 'Sugerencia', 'Otro'];
const ESTADOS_REPORTE = ['Pendiente', 'En revisión', 'Resuelto'];

app.get('/api/reportes', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, titulo, autor, categoria, descripcion, fecha, estado FROM vw_reportes_listado ORDER BY fecha_orden DESC, id DESC'
    );
    res.json(resultado.rows);
  } catch (error) {
    responderError(res, error, 'Error al cargar reportes', 'Error al consultar reportes');
  }
});

app.post('/api/reportes', async (req, res) => {
  try {
    const { titulo, autor, categoria, descripcion, fecha, estado } = req.body || {};
    if (!texto(titulo)) throw new ErrorHttp(400, 'El título del reporte es obligatorio');
    if (!CATEGORIAS_REPORTE.includes(categoria)) {
      throw new ErrorHttp(400, `Categoría inválida. Usa una de: ${CATEGORIAS_REPORTE.join(', ')}`);
    }
    const estadoFinal = estado || 'Pendiente';
    if (!ESTADOS_REPORTE.includes(estadoFinal)) {
      throw new ErrorHttp(400, `Estado inválido. Usa uno de: ${ESTADOS_REPORTE.join(', ')}`);
    }
    // El frontend puede mandar la fecha como DD/MM/YYYY; la BD la guarda como DATE (YYYY-MM-DD)
    let fechaSql = null;
    if (fecha) {
      fechaSql = parseFecha(fecha);
      if (!fechaSql) throw new ErrorHttp(400, 'Fecha inválida. Usa el formato DD/MM/AAAA');
    }

    const resultado = await pool.query(
      `INSERT INTO reportes (titulo, autor_nombre, categoria, descripcion, fecha, estado)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, (CURRENT_TIMESTAMP AT TIME ZONE ${ZONA})::date), $6)
       RETURNING id, titulo, autor_nombre AS autor, categoria, descripcion, TO_CHAR(fecha, 'DD/MM/YYYY') AS fecha, estado`,
      [texto(titulo), texto(autor) || 'Usuario', categoria, texto(descripcion), fechaSql, estadoFinal]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    responderError(res, error, 'Error al guardar el reporte', 'Error al crear reporte');
  }
});

// Cambiar el estado de un reporte ("Pendiente", "En revisión", "Resuelto")
app.put('/api/reportes/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const estado = (req.body || {}).estado;
    if (!ESTADOS_REPORTE.includes(estado)) {
      throw new ErrorHttp(400, `Estado inválido. Usa uno de: ${ESTADOS_REPORTE.join(', ')}`);
    }
    const resultado = await pool.query('UPDATE reportes SET estado = $1 WHERE id = $2', [estado, id]);
    if (resultado.rowCount === 0) throw new ErrorHttp(404, 'Reporte no encontrado');
    res.json({ ok: true, mensaje: 'Estado actualizado' });
  } catch (error) {
    responderError(res, error, 'Error al actualizar', 'Error al actualizar estado del reporte');
  }
});

app.delete('/api/reportes/:id', permitir(), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const borrado = await pool.query('DELETE FROM reportes WHERE id = $1', [id]);
    if (borrado.rowCount === 0) throw new ErrorHttp(404, 'Reporte no encontrado');
    res.json({ ok: true, mensaje: 'Reporte eliminado' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar', 'Error al eliminar reporte');
  }
});

// --------------------------------------------------------------------------
// CONFIGURACIÓN Y PERFIL
// El perfil es siempre el del usuario que inició sesión (viene del token).
// --------------------------------------------------------------------------
app.get('/api/configuracion', async (req, res) => {
  try {
    const empRes = await pool.query('SELECT * FROM configuracion_empresa ORDER BY id ASC LIMIT 1');
    const userRes = await pool.query('SELECT id, nombre_completo, email, usuario FROM usuarios WHERE id = $1', [req.usuario.id]);

    const empresa = empRes.rows[0] || {};
    const usuario = userRes.rows[0] || {};

    res.json({
      empresa: {
        nombre: empresa.nombre_comercial || 'Ferretería ToolStore',
        ruc: empresa.ruc || '',
        direccion: empresa.direccion || '',
        telefono: empresa.telefono || '',
        moneda: empresa.moneda_simbolo || 'S/'
      },
      perfil: {
        nombre: usuario.nombre_completo || 'Administrador',
        correo: usuario.email || ''
      }
    });
  } catch (error) {
    responderError(res, error, 'Error al obtener la configuración', 'Error al obtener configuración');
  }
});

app.put('/api/configuracion/empresa', permitir(), async (req, res) => {
  try {
    const { nombre, ruc, direccion, telefono, moneda } = req.body || {};
    if (!texto(nombre)) throw new ErrorHttp(400, 'El nombre de la empresa es obligatorio');
    if (texto(ruc) && !/^\d{11}$/.test(texto(ruc))) throw new ErrorHttp(400, 'El RUC debe tener 11 dígitos');
    if (texto(moneda).length > 5) throw new ErrorHttp(400, 'El símbolo de moneda es demasiado largo');

    const valores = [texto(nombre), texto(ruc), texto(direccion), texto(telefono), texto(moneda) || 'S/'];
    const existente = await pool.query('SELECT id FROM configuracion_empresa ORDER BY id ASC LIMIT 1');
    if (existente.rows.length > 0) {
      await pool.query(
        `UPDATE configuracion_empresa
         SET nombre_comercial = $1, ruc = $2, direccion = $3, telefono = $4, moneda_simbolo = $5
         WHERE id = $6`,
        [...valores, existente.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO configuracion_empresa (nombre_comercial, ruc, direccion, telefono, moneda_simbolo)
         VALUES ($1, $2, $3, $4, $5)`,
        valores
      );
    }
    res.json({ ok: true, mensaje: 'Datos de la empresa guardados correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al guardar datos de empresa', 'Error al guardar datos de empresa');
  }
});

app.put('/api/configuracion/perfil', async (req, res) => {
  try {
    const { nombre, correo } = req.body || {};
    if (!texto(nombre)) throw new ErrorHttp(400, 'El nombre es obligatorio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(correo))) throw new ErrorHttp(400, 'Ingresa un correo electrónico válido');

    const destino = await pool.query('SELECT id FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (destino.rows.length === 0) throw new ErrorHttp(404, 'Usuario no encontrado');

    await pool.query(
      'UPDATE usuarios SET nombre_completo = $1, email = $2 WHERE id = $3',
      [texto(nombre), texto(correo).toLowerCase(), destino.rows[0].id]
    );
    res.json({ ok: true, mensaje: 'Perfil actualizado correctamente' });
  } catch (error) {
    if (error.code === PG.UNICO) {
      return res.status(409).json({ error: 'Ese correo electrónico ya está en uso por otro usuario' });
    }
    responderError(res, error, 'Error al actualizar perfil', 'Error al actualizar perfil');
  }
});

// --------------------------------------------------------------------------
// AUTENTICACIÓN (REGISTRO Y LOGIN)
// --------------------------------------------------------------------------
// Rol que recibe quien se registra desde la web. NUNCA debe ser administrador por defecto.
const ROL_REGISTRO = (process.env.ROL_REGISTRO || 'VENDEDOR').trim().toUpperCase();

app.post(['/api/auth/registro', '/api/auth/register'], async (req, res) => {
  // REGISTRO_ABIERTO=0 en el .env cierra el registro público (útil cuando el sistema está en internet)
  if (['0', 'false', 'no'].includes((process.env.REGISTRO_ABIERTO || '').trim().toLowerCase())) {
    return res.status(403).json({ error: 'El registro está cerrado. Pide a un administrador que te cree la cuenta.' });
  }
  const { nombre, nombre_completo, correo, email, usuario, password, telefono } = req.body || {};
  const nombreFinal = texto(nombre || nombre_completo);
  const correoFinal = texto(correo || email).toLowerCase();
  const usuarioFinal = texto(usuario);
  const passwordFinal = typeof password === 'string' ? password : '';

  if (!nombreFinal || !correoFinal || !usuarioFinal || !passwordFinal) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoFinal)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
  }
  if (passwordFinal.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (passwordFinal.length > 72) {
    return res.status(400).json({ error: 'La contraseña no puede superar 72 caracteres' });
  }

  try {
    const existeUsuario = await pool.query('SELECT 1 FROM usuarios WHERE LOWER(usuario) = LOWER($1)', [usuarioFinal]);
    if (existeUsuario.rows.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    }
    const existeCorreo = await pool.query('SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1)', [correoFinal]);
    if (existeCorreo.rows.length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
    }

    const rolRes = await pool.query('SELECT id FROM roles WHERE UPPER(nombre) = $1 AND activo = TRUE', [ROL_REGISTRO]);
    if (rolRes.rows.length === 0) {
      console.error(`El rol "${ROL_REGISTRO}" no existe en la tabla roles`);
      return res.status(500).json({ error: 'El sistema no tiene configurado el rol para nuevos usuarios' });
    }

    // La contraseña se guarda con bcrypt (pgcrypto: crypt + gen_salt('bf'))
    const nuevo = await pool.query(
      `INSERT INTO usuarios (rol_id, nombre_completo, usuario, email, password_hash, telefono, activo)
       VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf')), $6, true)
       RETURNING id, nombre_completo, usuario, email`,
      [rolRes.rows[0].id, nombreFinal, usuarioFinal, correoFinal, passwordFinal, texto(telefono) || null]
    );
    const u = nuevo.rows[0];

    try {
      await pool.query(
        `INSERT INTO preferencias_usuario (usuario_id, notificar_stock_bajo, notificar_nuevas_ventas)
         VALUES ($1, true, true)
         ON CONFLICT (usuario_id) DO NOTHING`,
        [u.id]
      );
    } catch (errorPreferencias) {
      console.warn('Aviso al inicializar preferencias de usuario:', errorPreferencias.message);
    }

    console.log(`Usuario "${u.usuario}" registrado con ID ${u.id}.`);
    return res.status(201).json({
      ok: true,
      mensaje: 'Usuario registrado exitosamente',
      usuario: { id: u.id, nombre: u.nombre_completo, usuario: u.usuario, email: u.email }
    });
  } catch (error) {
    if (error.code === PG.UNICO) {
      return res.status(400).json({ error: 'El usuario o el correo ya están registrados' });
    }
    responderError(res, error, 'Error interno del servidor al registrar el usuario', 'Error al registrar usuario');
  }
});

// Límite de intentos fallidos por IP + usuario (en memoria; se reinicia con el servidor)
const VENTANA_LOGIN_MS = 15 * 60 * 1000;
const MAX_FALLOS_LOGIN = 10;
const fallosLogin = new Map();

const loginBloqueado = (clave) => {
  const f = fallosLogin.get(clave);
  if (!f) return false;
  if (Date.now() - f.desde > VENTANA_LOGIN_MS) {
    fallosLogin.delete(clave);
    return false;
  }
  return f.cuenta >= MAX_FALLOS_LOGIN;
};
const registrarFalloLogin = (clave) => {
  const f = fallosLogin.get(clave);
  if (f && Date.now() - f.desde <= VENTANA_LOGIN_MS) f.cuenta += 1;
  else fallosLogin.set(clave, { cuenta: 1, desde: Date.now() });
};
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, f] of fallosLogin) if (ahora - f.desde > VENTANA_LOGIN_MS) fallosLogin.delete(clave);
}, VENTANA_LOGIN_MS).unref();

app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body || {};
  const usuarioIngresado = texto(usuario);
  const passwordIngresada = typeof password === 'string' ? password : '';

  if (!usuarioIngresado || !passwordIngresada) {
    return res.status(400).json({ error: 'Ingresa tu usuario y contraseña' });
  }

  const clave = `${req.ip}|${usuarioIngresado.toLowerCase()}`;
  if (loginBloqueado(clave)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
  }

  try {
    // Se puede entrar con el nombre de usuario o con el correo. La contraseña se compara en la BD (bcrypt).
    const resultado = await pool.query(
      `SELECT u.id, u.nombre_completo, u.email, u.usuario, r.nombre AS rol,
              (u.password_hash = crypt($2, u.password_hash)) AS coincide
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       WHERE (LOWER(u.usuario) = LOWER($1) OR LOWER(u.email) = LOWER($1)) AND u.activo = true`,
      [usuarioIngresado, passwordIngresada]
    );

    const u = resultado.rows.find(fila => fila.coincide);
    if (!u) {
      registrarFalloLogin(clave);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    fallosLogin.delete(clave);
    pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [u.id]).catch(() => { });
    const { token, expiraEn } = firmarToken({ id: u.id, usuario: u.usuario, rol: u.rol });
    return res.json({
      ok: true,
      token,
      expiraEn,
      usuario: { id: u.id, nombre: u.nombre_completo, usuario: u.usuario, email: u.email, rol: u.rol }
    });
  } catch (error) {
    responderError(res, error, 'Error en el servidor de autenticación', 'Error en login');
  }
});

// Cambiar la contraseña desde Configuración. Exige la contraseña actual, así que
// funciona igual que un login (y comparte el límite de intentos fallidos).
app.put('/api/auth/cambiar-clave', async (req, res) => {
  try {
    const { actual, nueva } = req.body || {};
    const id = req.usuario.id; // solo se puede cambiar la clave propia (viene del token)
    const claveActual = typeof actual === 'string' ? actual : '';
    const claveNueva = typeof nueva === 'string' ? nueva : '';

    if (!claveActual || !claveNueva) throw new ErrorHttp(400, 'Completa la contraseña actual y la nueva');
    if (claveNueva.length < 6) throw new ErrorHttp(400, 'La nueva contraseña debe tener al menos 6 caracteres');
    if (claveNueva.length > 72) throw new ErrorHttp(400, 'La contraseña no puede superar 72 caracteres');
    if (claveNueva === claveActual) throw new ErrorHttp(400, 'La nueva contraseña debe ser distinta a la actual');

    const clave = `${req.ip}|cambiar-clave|${id}`;
    if (loginBloqueado(clave)) {
      throw new ErrorHttp(429, 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.');
    }

    const usuario = await pool.query(
      'SELECT (password_hash = crypt($2, password_hash)) AS coincide FROM usuarios WHERE id = $1 AND activo = true',
      [id, claveActual]
    );
    if (usuario.rows.length === 0) throw new ErrorHttp(404, 'Usuario no encontrado');
    if (!usuario.rows[0].coincide) {
      registrarFalloLogin(clave);
      throw new ErrorHttp(401, 'La contraseña actual es incorrecta');
    }

    await pool.query("UPDATE usuarios SET password_hash = crypt($2, gen_salt('bf')), ultimo_cambio_clave = NOW() WHERE id = $1", [id, claveNueva]);
    fallosLogin.delete(clave);
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al cambiar la contraseña', 'Error al cambiar contraseña');
  }
});

// --------------------------------------------------------------------------
// RECUPERAR CONTRASEÑA (olvidé mi contraseña)
// --------------------------------------------------------------------------
// 1) La persona escribe su usuario o correo y se genera un código de 6 dígitos (vale 15 minutos).
// 2) Con ese código + una contraseña nueva se restablece la clave.
// El sistema no tiene servidor de correo: el código se muestra en la terminal del backend
// (en producción aquí se conectaría el envío por correo). El código se guarda cifrado.
const MIN_VIDA_CODIGO = 15;
const MAX_INTENTOS_CODIGO = 5;
let tablaRecuperacionLista = null;

function asegurarTablaRecuperacion() {
  if (!tablaRecuperacionLista) {
    tablaRecuperacionLista = pool.query(`
      CREATE TABLE IF NOT EXISTS recuperaciones_clave (
        id SERIAL PRIMARY KEY,
        usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        codigo_hash VARCHAR(64) NOT NULL,
        sal VARCHAR(32) NOT NULL,
        expira_en TIMESTAMPTZ NOT NULL,
        intentos INT NOT NULL DEFAULT 0,
        usado BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).catch((e) => { tablaRecuperacionLista = null; throw e; });
  }
  return tablaRecuperacionLista;
}

const hashCodigo = (sal, codigo) => crypto.createHash('sha256').update(`${sal}:${codigo}`).digest('hex');
const buscarUsuarioActivo = (ident) => pool.query(
  `SELECT id, usuario, email, nombre_completo FROM usuarios
   WHERE (LOWER(usuario) = LOWER($1) OR LOWER(email) = LOWER($1)) AND activo = true
   ORDER BY id LIMIT 1`, [ident]);

app.post('/api/auth/olvide-clave', async (req, res) => {
  try {
    const ident = texto((req.body || {}).identificador);
    if (!ident) throw new ErrorHttp(400, 'Escribe tu usuario o tu correo');

    const clave = `${req.ip}|olvide|${ident.toLowerCase()}`;
    if (loginBloqueado(clave)) throw new ErrorHttp(429, 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.');
    registrarFalloLogin(clave); // cuenta cada solicitud: máximo 10 cada 15 minutos

    await asegurarTablaRecuperacion();
    const encontrado = await buscarUsuarioActivo(ident);
    if (encontrado.rows.length) {
      const u = encontrado.rows[0];
      // Máximo un código por minuto por usuario
      const reciente = await pool.query(
        "SELECT 1 FROM recuperaciones_clave WHERE usuario_id = $1 AND created_at > NOW() - INTERVAL '1 minute'", [u.id]);
      if (!reciente.rows.length) {
        const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const sal = crypto.randomBytes(16).toString('hex');
        await pool.query('UPDATE recuperaciones_clave SET usado = true WHERE usuario_id = $1 AND usado = false', [u.id]);
        await pool.query(
          `INSERT INTO recuperaciones_clave (usuario_id, codigo_hash, sal, expira_en)
           VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
          [u.id, hashCodigo(sal, codigo), sal, String(MIN_VIDA_CODIGO)]);
        const mostrarEnTerminal = () => {
          console.log('==================================================================');
          console.log(` CÓDIGO DE RECUPERACIÓN para "${u.usuario}" (${u.email})`);
          console.log(` Código: ${codigo}   (vale ${MIN_VIDA_CODIGO} minutos)`);
          console.log('==================================================================');
        };
        if (correoConfigurado()) {
          // Se envía sin esperar la respuesta: así la pantalla responde igual de rápido exista o no la cuenta.
          // Si el correo falla, el código se muestra en la terminal para que el administrador pueda dárselo.
          enviarCorreo({
            para: u.email,
            asunto: 'Tu código para recuperar tu contraseña - ToolStore',
            texto: `Hola ${u.nombre_completo},\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta de ToolStore (usuario: ${u.usuario}).\n\nTu código es: ${codigo}\n\nVale ${MIN_VIDA_CODIGO} minutos y solo se puede usar una vez. Si tú no lo pediste, ignora este mensaje: tu contraseña sigue siendo la misma.\n\nToolStore`
          }).then(() => console.log(`Código de recuperación enviado por correo a ${u.email}`))
            .catch((e) => { console.error('No se pudo enviar el correo de recuperación:', e.message); mostrarEnTerminal(); });
        } else {
          mostrarEnTerminal();
        }
      }
    }
    // Siempre la misma respuesta: no se revela si el usuario existe o no
    const porCorreo = correoConfigurado();
    res.json({
      ok: true,
      porCorreo,
      mensaje: porCorreo
        ? `Si la cuenta existe, te enviamos un código de 6 dígitos al correo con el que te registraste. Vale ${MIN_VIDA_CODIGO} minutos.`
        : `Si la cuenta existe, se generó un código de 6 dígitos que vale ${MIN_VIDA_CODIGO} minutos.`
    });
  } catch (error) {
    responderError(res, error, 'No se pudo generar el código de recuperación', 'Error en olvide-clave');
  }
});

app.post('/api/auth/restablecer-clave', async (req, res) => {
  try {
    const { identificador, codigo, nueva } = req.body || {};
    const ident = texto(identificador);
    const cod = texto(codigo);
    const claveNueva = typeof nueva === 'string' ? nueva : '';

    if (!ident || !cod || !claveNueva) throw new ErrorHttp(400, 'Completa el usuario, el código y la nueva contraseña');
    if (!/^\d{6}$/.test(cod)) throw new ErrorHttp(400, 'El código tiene 6 dígitos');
    if (claveNueva.length < 6) throw new ErrorHttp(400, 'La nueva contraseña debe tener al menos 6 caracteres');
    if (claveNueva.length > 72) throw new ErrorHttp(400, 'La contraseña no puede superar 72 caracteres');

    const clave = `${req.ip}|restablecer|${ident.toLowerCase()}`;
    if (loginBloqueado(clave)) throw new ErrorHttp(429, 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.');

    await asegurarTablaRecuperacion();
    const MENSAJE_INVALIDO = 'El código no es válido o ya venció. Pide uno nuevo.';
    const encontrado = await buscarUsuarioActivo(ident);
    if (!encontrado.rows.length) { registrarFalloLogin(clave); throw new ErrorHttp(400, MENSAJE_INVALIDO); }
    const u = encontrado.rows[0];

    const fila = await pool.query(
      `SELECT id, codigo_hash, sal, intentos FROM recuperaciones_clave
       WHERE usuario_id = $1 AND usado = false AND expira_en > NOW()
       ORDER BY id DESC LIMIT 1`, [u.id]);
    if (!fila.rows.length) { registrarFalloLogin(clave); throw new ErrorHttp(400, MENSAJE_INVALIDO); }
    const r = fila.rows[0];

    const esperado = Buffer.from(r.codigo_hash);
    const recibido = Buffer.from(hashCodigo(r.sal, cod));
    if (esperado.length !== recibido.length || !crypto.timingSafeEqual(esperado, recibido)) {
      registrarFalloLogin(clave);
      const intentos = r.intentos + 1;
      await pool.query('UPDATE recuperaciones_clave SET intentos = $2, usado = ($2 >= $3) WHERE id = $1',
        [r.id, intentos, MAX_INTENTOS_CODIGO]);
      throw new ErrorHttp(400, intentos >= MAX_INTENTOS_CODIGO
        ? 'Demasiados intentos con este código. Pide uno nuevo.'
        : `Código incorrecto. Te quedan ${MAX_INTENTOS_CODIGO - intentos} intento(s).`);
    }

    // Se marca como usado primero: un código solo sirve una vez, aunque lleguen dos peticiones a la vez
    const consumido = await pool.query(
      'UPDATE recuperaciones_clave SET usado = true WHERE id = $1 AND usado = false RETURNING id', [r.id]);
    if (!consumido.rows.length) throw new ErrorHttp(400, MENSAJE_INVALIDO);

    await pool.query("UPDATE usuarios SET password_hash = crypt($2, gen_salt('bf')), ultimo_cambio_clave = NOW() WHERE id = $1", [u.id, claveNueva]);
    await pool.query('UPDATE recuperaciones_clave SET usado = true WHERE usuario_id = $1', [u.id]);
    fallosLogin.delete(clave);
    fallosLogin.delete(`${req.ip}|${u.usuario.toLowerCase()}`); // por si el login quedó bloqueado por intentos fallidos
    console.log(`Contraseña restablecida para "${u.usuario}".`);
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    responderError(res, error, 'No se pudo restablecer la contraseña', 'Error en restablecer-clave');
  }
});

// --------------------------------------------------------------------------
// La página (frontend) publicada desde el mismo servidor
// --------------------------------------------------------------------------
// Si existe frontend/dist (se crea con "npm run build" dentro de frontend), el backend también muestra la página:
// así todo vive en una sola dirección web y no hay problemas de CORS. En tu computadora, con "npm start" en
// el frontend, esto no hace nada: sigues usando http://localhost:4200.
const fs = require('fs');
const TIPOS_ARCHIVO = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

function buscarCarpetaFrontend() {
  const candidatas = [];
  if (process.env.FRONTEND_DIST) candidatas.push(path.resolve(process.env.FRONTEND_DIST));
  const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  try {
    for (const nombre of fs.readdirSync(dist)) candidatas.push(path.join(dist, nombre, 'browser'), path.join(dist, nombre));
  } catch { /* no hay carpeta dist: modo desarrollo */ }
  return candidatas.find((c) => fs.existsSync(path.join(c, 'index.html'))) || null;
}

const carpetaFrontend = buscarCarpetaFrontend();
if (carpetaFrontend) {
  console.log(`Mostrando la página desde: ${carpetaFrontend}`);
  const enviarArchivo = (req, res, archivo, tamano) => {
    const ext = path.extname(archivo).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', TIPOS_ARCHIVO[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', tamano);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Los archivos con "hash" en el nombre (main-AB12CD34.js) no cambian nunca: se pueden guardar un año
    res.setHeader('Cache-Control', /-[A-Za-z0-9]{8,}\.[a-z0-9]+$/i.test(path.basename(archivo)) && ext !== '.html'
      ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(archivo).on('error', () => res.destroy()).pipe(res);
  };

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let ruta;
    try { ruta = decodeURIComponent((req.originalUrl || req.url || '/').split('?')[0]); } catch { return next(); }
    if (ruta === '/api' || ruta.startsWith('/api/') || ruta.includes('\0')) return next();

    // Solo se sirven archivos que estén dentro de la carpeta de la página (no se puede salir de ella con "../")
    const archivo = path.resolve(carpetaFrontend, '.' + ruta);
    if (archivo === carpetaFrontend || archivo.startsWith(carpetaFrontend + path.sep)) {
      let info = null;
      try { info = fs.statSync(archivo); } catch { /* no existe */ }
      if (info && info.isFile()) return enviarArchivo(req, res, archivo, info.size);
    }
    // Pide un archivo que no existe (/algo.js): 404 normal. Cualquier otra ruta (/login, /kardex...) es de Angular.
    if (path.extname(ruta)) return next();
    const indice = path.join(carpetaFrontend, 'index.html');
    try { return enviarArchivo(req, res, indice, fs.statSync(indice).size); } catch { return next(); }
  });
}

// --------------------------------------------------------------------------
// Rutas inexistentes y errores generales (siempre responden JSON)
// --------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

app.use((error, req, res, next) => {
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  console.error('Error no controlado:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// --------------------------------------------------------------------------
// Arranque
// --------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const servidor = app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
  pool.query('SELECT 1')
    .then(() => console.log('Conexión exitosa a la base de datos PostgreSQL.'))
    .catch((error) => {
      console.error('No se pudo conectar a PostgreSQL:', error.message);
      console.error('Revisa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME en tu archivo .env');
    });
});

const cerrar = () => {
  servidor.close(() => pool.end().finally(() => process.exit(0)));
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
