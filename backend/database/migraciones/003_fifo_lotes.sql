-- ============================================================================
-- FIFO (PEPS: Primeras Entradas, Primeras Salidas) - VALORIZACIÓN POR LOTES
-- ----------------------------------------------------------------------------
-- Cada ingreso de mercadería (compra recibida, stock inicial, ajuste positivo)
-- crea un LOTE con su cantidad y su costo unitario. Cada venta consume
-- primero del lote más antiguo, luego del siguiente, y así sucesivamente.
-- El costo de lo vendido (y del stock que queda) sale de esos lotes.
-- ============================================================================

-- Lotes de inventario: una fila por cada ingreso de mercadería
CREATE TABLE IF NOT EXISTS lotes_inventario (
    id BIGSERIAL PRIMARY KEY,
    producto_id INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    origen VARCHAR(20) NOT NULL CHECK (origen IN ('INICIAL', 'COMPRA', 'AJUSTE', 'ANULACION', 'MIGRACION')),
    referencia_id VARCHAR(50),
    cantidad_inicial NUMERIC(12,2) NOT NULL CHECK (cantidad_inicial > 0),
    cantidad_restante NUMERIC(12,2) NOT NULL CHECK (cantidad_restante >= 0),
    costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (costo_unitario >= 0),
    fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_lote_restante CHECK (cantidad_restante <= cantidad_inicial)
);

-- Índice para encontrar rápido el lote más antiguo con existencias de cada producto
CREATE INDEX IF NOT EXISTS idx_lotes_fifo
    ON lotes_inventario (producto_id, fecha_ingreso, id) WHERE cantidad_restante > 0;

-- Qué lotes consumió cada línea de venta (sirve para devolver el stock al lote correcto si se anula)
CREATE TABLE IF NOT EXISTS consumos_lote (
    id BIGSERIAL PRIMARY KEY,
    lote_id BIGINT NOT NULL REFERENCES lotes_inventario(id) ON DELETE RESTRICT,
    detalle_venta_id BIGINT NOT NULL REFERENCES detalle_ventas(id) ON DELETE CASCADE,
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consumos_detalle ON consumos_lote (detalle_venta_id);

-- Kardex valorizado: cada movimiento guarda también su COSTO TOTAL (cantidad x costo unitario)
ALTER TABLE kardex_movimientos ADD COLUMN IF NOT EXISTS costo_total NUMERIC(14,2);

-- Si quien inserta el movimiento no indica el costo total, se calcula solo
CREATE OR REPLACE FUNCTION fn_kardex_costo_total()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.costo_total IS NULL THEN
        NEW.costo_total := ROUND(NEW.cantidad * COALESCE(NEW.costo_unitario, 0), 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kardex_costo_total ON kardex_movimientos;
CREATE TRIGGER trg_kardex_costo_total
BEFORE INSERT ON kardex_movimientos
FOR EACH ROW EXECUTE FUNCTION fn_kardex_costo_total();

-- Crea un lote nuevo (entrada de mercadería). Devuelve el id del lote.
CREATE OR REPLACE FUNCTION fn_fifo_ingresar(
    p_producto INT, p_cantidad NUMERIC, p_costo NUMERIC, p_origen VARCHAR, p_referencia VARCHAR DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RETURN NULL;
    END IF;
    INSERT INTO lotes_inventario (producto_id, origen, referencia_id, cantidad_inicial, cantidad_restante, costo_unitario)
    VALUES (p_producto, p_origen, p_referencia, p_cantidad, p_cantidad, COALESCE(p_costo, 0))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Descuenta la cantidad desde el lote MÁS ANTIGUO (FIFO). Devuelve el COSTO TOTAL de lo consumido.
-- Si es una venta, anota de qué lotes salió (consumos_lote) para poder revertirlo.
CREATE OR REPLACE FUNCTION fn_fifo_consumir_total(
    p_producto INT, p_cantidad NUMERIC, p_detalle_venta BIGINT DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    lote RECORD;
    v_restante NUMERIC := p_cantidad;
    v_toma NUMERIC;
    v_total NUMERIC := 0;
    v_costo_ref NUMERIC;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RETURN 0;
    END IF;

    FOR lote IN
        SELECT id, cantidad_restante, costo_unitario
        FROM lotes_inventario
        WHERE producto_id = p_producto AND cantidad_restante > 0
        ORDER BY fecha_ingreso ASC, id ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_restante <= 0;
        v_toma := LEAST(lote.cantidad_restante, v_restante);

        UPDATE lotes_inventario SET cantidad_restante = cantidad_restante - v_toma WHERE id = lote.id;

        IF p_detalle_venta IS NOT NULL THEN
            INSERT INTO consumos_lote (lote_id, detalle_venta_id, cantidad, costo_unitario)
            VALUES (lote.id, p_detalle_venta, v_toma, lote.costo_unitario);
        END IF;

        v_total := v_total + v_toma * lote.costo_unitario;
        v_restante := v_restante - v_toma;
    END LOOP;

    -- Seguridad: si hubiera stock sin lote (datos anteriores al FIFO), se valoriza al último costo de compra
    IF v_restante > 0 THEN
        SELECT precio_compra INTO v_costo_ref FROM productos WHERE id = p_producto;
        v_total := v_total + v_restante * COALESCE(v_costo_ref, 0);
    END IF;

    RETURN ROUND(v_total, 2);
END;
$$ LANGUAGE plpgsql;

-- Igual que la anterior pero devuelve el costo unitario promedio de lo consumido
CREATE OR REPLACE FUNCTION fn_fifo_consumir(
    p_producto INT, p_cantidad NUMERIC, p_detalle_venta BIGINT DEFAULT NULL
) RETURNS NUMERIC AS $$
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RETURN 0;
    END IF;
    RETURN ROUND(fn_fifo_consumir_total(p_producto, p_cantidad, p_detalle_venta) / p_cantidad, 2);
END;
$$ LANGUAGE plpgsql;

-- VENTA: descuenta el stock, consume los lotes más antiguos y anota el costo FIFO en el Kardex
CREATE OR REPLACE FUNCTION fn_procesar_detalle_venta()
RETURNS TRIGGER AS $$
DECLARE
    v_stock_anterior NUMERIC(12,2);
    v_nombre_producto VARCHAR(200);
    v_codigo_venta VARCHAR(50);
    v_usuario_id INT;
    v_total NUMERIC(14,2);
BEGIN
    SELECT stock_actual, nombre INTO v_stock_anterior, v_nombre_producto
    FROM productos
    WHERE id = NEW.producto_id
    FOR UPDATE;

    IF v_stock_anterior < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para "%". Stock actual: %, solicitado: %',
            v_nombre_producto, v_stock_anterior, NEW.cantidad;
    END IF;

    SELECT codigo_comprobante, vendedor_id INTO v_codigo_venta, v_usuario_id
    FROM ventas
    WHERE id = NEW.venta_id;

    UPDATE productos
    SET stock_actual = stock_actual - NEW.cantidad
    WHERE id = NEW.producto_id;

    -- FIFO: sale primero lo que entró primero
    v_total := fn_fifo_consumir_total(NEW.producto_id, NEW.cantidad, NEW.id);

    INSERT INTO kardex_movimientos (
        producto_id, usuario_id, tipo_movimiento, cantidad,
        stock_anterior, stock_posterior, costo_unitario, costo_total, precio_unitario,
        referencia_origen, referencia_id, motivo
    ) VALUES (
        NEW.producto_id,
        v_usuario_id,
        'SALIDA_VENTA',
        NEW.cantidad,
        v_stock_anterior,
        v_stock_anterior - NEW.cantidad,
        ROUND(v_total / NEW.cantidad, 2),
        v_total,
        NEW.precio_unitario,
        'VENTA',
        v_codigo_venta,
        'Venta realizada en caja / POS'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ANULACIÓN DE VENTA: devuelve el stock a los MISMOS lotes de los que salió
CREATE OR REPLACE FUNCTION fn_anular_venta()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    c RECORD;
    v_stock_ant NUMERIC(12,2);
    v_pendiente NUMERIC;
    v_total NUMERIC;
    v_costo_ref NUMERIC;
BEGIN
    IF OLD.estado = 'COMPLETADA' AND NEW.estado = 'ANULADA' THEN
        FOR item IN (SELECT id, producto_id, cantidad, precio_unitario FROM detalle_ventas WHERE venta_id = NEW.id) LOOP
            SELECT stock_actual, precio_compra INTO v_stock_ant, v_costo_ref FROM productos WHERE id = item.producto_id FOR UPDATE;

            UPDATE productos
            SET stock_actual = stock_actual + item.cantidad
            WHERE id = item.producto_id;

            v_pendiente := item.cantidad;
            v_total := 0;

            FOR c IN SELECT lote_id, cantidad, costo_unitario FROM consumos_lote WHERE detalle_venta_id = item.id ORDER BY id LOOP
                UPDATE lotes_inventario SET cantidad_restante = cantidad_restante + c.cantidad WHERE id = c.lote_id;
                v_total := v_total + c.cantidad * c.costo_unitario;
                v_pendiente := v_pendiente - c.cantidad;
            END LOOP;

            -- Ventas anteriores al FIFO (sin lotes registrados): se crea un lote nuevo con el último costo
            IF v_pendiente > 0 THEN
                PERFORM fn_fifo_ingresar(item.producto_id, v_pendiente, v_costo_ref, 'ANULACION', NEW.codigo_comprobante);
                v_total := v_total + v_pendiente * COALESCE(v_costo_ref, 0);
            END IF;

            INSERT INTO kardex_movimientos (
                producto_id, usuario_id, tipo_movimiento, cantidad,
                stock_anterior, stock_posterior, costo_unitario, costo_total, precio_unitario,
                referencia_origen, referencia_id, motivo
            ) VALUES (
                item.producto_id,
                NEW.vendedor_id,
                'ANULACION_VENTA',
                item.cantidad,
                v_stock_ant,
                v_stock_ant + item.cantidad,
                ROUND(v_total / item.cantidad, 2),
                ROUND(v_total, 2),
                item.precio_unitario,
                'VENTA',
                NEW.codigo_comprobante,
                COALESCE(NEW.motivo_anulacion, 'Venta anulada por el administrador')
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- COMPRA RECIBIDA: suma el stock y crea un LOTE nuevo con el costo de esa compra
CREATE OR REPLACE FUNCTION fn_recepcion_compra()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_stock_ant NUMERIC(12,2);
BEGIN
    IF OLD.estado = 'Pendiente' AND NEW.estado = 'Recibido' THEN
        FOR item IN (SELECT producto_id, cantidad, costo_unitario, descripcion_item FROM detalle_compras WHERE compra_id = NEW.id) LOOP
            IF item.producto_id IS NOT NULL THEN
                SELECT stock_actual INTO v_stock_ant FROM productos WHERE id = item.producto_id FOR UPDATE;

                UPDATE productos
                SET stock_actual = stock_actual + item.cantidad,
                    precio_compra = item.costo_unitario
                WHERE id = item.producto_id;

                PERFORM fn_fifo_ingresar(item.producto_id, item.cantidad, item.costo_unitario, 'COMPRA', CAST(NEW.id AS VARCHAR));

                INSERT INTO kardex_movimientos (
                    producto_id, usuario_id, tipo_movimiento, cantidad,
                    stock_anterior, stock_posterior, costo_unitario,
                    referencia_origen, referencia_id, motivo
                ) VALUES (
                    item.producto_id,
                    NEW.usuario_id,
                    'ENTRADA_COMPRA',
                    item.cantidad,
                    v_stock_ant,
                    v_stock_ant + item.cantidad,
                    item.costo_unitario,
                    'COMPRA',
                    CAST(NEW.id AS VARCHAR),
                    'Recepción de mercadería de proveedor'
                );
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Lotes de arranque: el stock que ya existe se convierte en un lote por producto
-- (con el último costo de compra conocido). Solo para productos que aún no tienen lotes.
INSERT INTO lotes_inventario (producto_id, origen, referencia_id, cantidad_inicial, cantidad_restante, costo_unitario, fecha_ingreso)
SELECT p.id, 'MIGRACION', 'STOCK_PREVIO', p.stock_actual, p.stock_actual, p.precio_compra, p.created_at
FROM productos p
WHERE p.stock_actual > 0
  AND NOT EXISTS (SELECT 1 FROM lotes_inventario l WHERE l.producto_id = p.id);

-- Kardex de ventas hechas antes del FIFO: se completa su costo con el último costo de compra
UPDATE kardex_movimientos k
SET costo_unitario = p.precio_compra
FROM productos p
WHERE p.id = k.producto_id
  AND k.tipo_movimiento IN ('SALIDA_VENTA', 'ANULACION_VENTA')
  AND COALESCE(k.costo_unitario, 0) = 0;

-- Kardex anterior al FIFO: las entradas sin costo se completan con el último costo de compra
UPDATE kardex_movimientos k
SET costo_unitario = p.precio_compra
FROM productos p
WHERE p.id = k.producto_id
  AND k.tipo_movimiento IN ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')
  AND COALESCE(k.costo_unitario, 0) = 0;

-- Costo total de los movimientos que aún no lo tienen
UPDATE kardex_movimientos
SET costo_total = ROUND(cantidad * COALESCE(costo_unitario, 0), 2)
WHERE costo_total IS NULL;

-- Vista del Kardex VALORIZADO (con costo total, valor de venta y saldo valorizado acumulado por producto)
CREATE OR REPLACE VIEW vw_kardex_listado AS
SELECT
    k.id,
    k.producto_id AS "productoId",
    p.nombre AS producto,
    p.codigo_interno AS "codigoInterno",
    c.nombre AS categoria,
    um.codigo AS unidad,
    k.tipo_movimiento AS tipo,
    CASE WHEN k.tipo_movimiento IN ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'AJUSTE_POSITIVO', 'ANULACION_VENTA')
         THEN 'ENTRADA' ELSE 'SALIDA' END AS sentido,
    k.cantidad,
    k.stock_anterior AS "stockAnterior",
    k.stock_posterior AS "stockPosterior",
    k.costo_unitario AS "costoUnitario",
    k.precio_unitario AS "precioUnitario",
    k.referencia_origen AS "referenciaOrigen",
    k.referencia_id AS referencia,
    k.motivo,
    usr.nombre_completo AS usuario,
    k.created_at AS "fechaHora",
    k.costo_total AS "costoTotal",
    CASE WHEN k.tipo_movimiento IN ('SALIDA_VENTA', 'ANULACION_VENTA')
         THEN ROUND(k.cantidad * COALESCE(k.precio_unitario, 0), 2) END AS "valorVenta",
    SUM(CASE WHEN k.tipo_movimiento IN ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'AJUSTE_POSITIVO', 'ANULACION_VENTA')
             THEN COALESCE(k.costo_total, 0) ELSE -COALESCE(k.costo_total, 0) END)
        OVER (PARTITION BY k.producto_id ORDER BY k.id) AS "saldoValorizado"
FROM kardex_movimientos k
JOIN productos p ON p.id = k.producto_id
JOIN categorias c ON c.id = p.categoria_id
JOIN unidades_medida um ON um.id = p.unidad_medida_id
LEFT JOIN usuarios usr ON usr.id = k.usuario_id;

-- Vista de lotes lista para la pantalla (orden FIFO por producto)
CREATE OR REPLACE VIEW vw_lotes_fifo AS
SELECT
    l.id,
    l.producto_id AS "productoId",
    p.nombre AS producto,
    p.codigo_interno AS "codigoInterno",
    um.codigo AS unidad,
    l.origen,
    l.referencia_id AS referencia,
    l.fecha_ingreso AS "fechaIngreso",
    l.cantidad_inicial AS "cantidadInicial",
    l.cantidad_restante AS "cantidadRestante",
    l.costo_unitario AS "costoUnitario",
    ROUND(l.cantidad_restante * l.costo_unitario, 2) AS valor,
    CASE WHEN l.cantidad_restante > 0
         THEN ROW_NUMBER() OVER (PARTITION BY l.producto_id, (l.cantidad_restante > 0) ORDER BY l.fecha_ingreso, l.id)
         ELSE NULL END AS "ordenSalida"
FROM lotes_inventario l
JOIN productos p ON p.id = l.producto_id
JOIN unidades_medida um ON um.id = p.unidad_medida_id;
