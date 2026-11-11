-- ============================================================================
-- MIGRACIÓN 001 (NO destructiva): se puede ejecutar sobre una BD que ya tiene datos.
-- Aplicar con:  psql -U postgres -d almacen_ferretero -f database/migraciones/001_correcciones.sql
--
-- 1) Dashboard: "hoy" y "mes" se calculan con la hora de Lima, no con la zona horaria del
--    servidor (con la BD en UTC, desde las 7 pm el dashboard mostraba 0 ventas).
-- 2) Mensaje de stock insuficiente con el nombre del producto.
-- 3) Fechas por defecto de compras y reportes también en hora de Lima.
-- ============================================================================
BEGIN;

CREATE OR REPLACE VIEW vw_dashboard_resumen_hoy AS
WITH datos_hoy AS (
    SELECT 
        COALESCE(SUM(total), 0) AS ventas_hoy,
        COUNT(id) AS conteo_ventas
    FROM ventas
    WHERE CAST(fecha_hora AT TIME ZONE 'America/Lima' AS DATE) = CAST(NOW() AT TIME ZONE 'America/Lima' AS DATE)
      AND estado = 'COMPLETADA'
),
clientes_hoy AS (
    SELECT COUNT(DISTINCT cliente_id) AS total_clientes
    FROM ventas
    WHERE CAST(fecha_hora AT TIME ZONE 'America/Lima' AS DATE) = CAST(NOW() AT TIME ZONE 'America/Lima' AS DATE)
      AND estado = 'COMPLETADA'
),
alertas_hoy AS (
    SELECT COUNT(id) AS total_alertas
    FROM productos
    WHERE activo = TRUE AND stock_actual <= stock_minimo
)
SELECT 'Ventas del día' AS titulo, 'S/ ' || TO_CHAR(dh.ventas_hoy, 'FM999,999,990.00') AS valor, 'fa-coins' AS icono, '#10b981' AS color, FALSE AS alerta FROM datos_hoy dh
UNION ALL
SELECT 'Transacciones hoy' AS titulo, CAST(dh.conteo_ventas AS VARCHAR) AS valor, 'fa-receipt' AS icono, '#0284c7' AS color, FALSE AS alerta FROM datos_hoy dh
UNION ALL
SELECT 'Stock crítico' AS titulo, CAST(ah.total_alertas AS VARCHAR) || ' producto(s)' AS valor, 'fa-triangle-exclamation' AS icono, '#ef4444' AS color, (ah.total_alertas > 0) AS alerta FROM alertas_hoy ah
UNION ALL
SELECT 'Clientes atendidos' AS titulo, CAST(ch.total_clientes AS VARCHAR) AS valor, 'fa-users' AS icono, '#8b5cf6' AS color, FALSE AS alerta FROM clientes_hoy ch;

CREATE OR REPLACE VIEW vw_dashboard_ventas_mensuales AS
WITH meses AS (
    SELECT generate_series(
        DATE_TRUNC('year', NOW() AT TIME ZONE 'America/Lima'),
        DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Lima'),
        INTERVAL '1 month'
    ) AS mes_inicio
)
SELECT 
    CASE EXTRACT(MONTH FROM m.mes_inicio)
        WHEN 1 THEN 'Ene'
        WHEN 2 THEN 'Feb'
        WHEN 3 THEN 'Mar'
        WHEN 4 THEN 'Abr'
        WHEN 5 THEN 'May'
        WHEN 6 THEN 'Jun'
        WHEN 7 THEN 'Jul'
        WHEN 8 THEN 'Ago'
        WHEN 9 THEN 'Set'
        WHEN 10 THEN 'Oct'
        WHEN 11 THEN 'Nov'
        WHEN 12 THEN 'Dic'
    END AS mes,
    EXTRACT(MONTH FROM m.mes_inicio) AS mes_num,
    COALESCE(SUM(v.total), 0)::NUMERIC(12,2) AS valor
FROM meses m
LEFT JOIN ventas v 
    ON DATE_TRUNC('month', v.fecha_hora AT TIME ZONE 'America/Lima') = m.mes_inicio
   AND v.estado = 'COMPLETADA'
GROUP BY m.mes_inicio
ORDER BY m.mes_inicio ASC;

CREATE OR REPLACE FUNCTION fn_procesar_detalle_venta()
RETURNS TRIGGER AS $$
DECLARE
    v_stock_anterior NUMERIC(12,2);
    v_nombre_producto VARCHAR(200);
    v_codigo_venta VARCHAR(50);
    v_usuario_id INT;
BEGIN
    -- Obtener stock actual del producto con bloqueo para concurrencia
    SELECT stock_actual, nombre INTO v_stock_anterior, v_nombre_producto
    FROM productos
    WHERE id = NEW.producto_id
    FOR UPDATE;

    -- Validar si hay stock suficiente
    IF v_stock_anterior < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para "%". Stock actual: %, solicitado: %',
            v_nombre_producto, v_stock_anterior, NEW.cantidad;
    END IF;

    -- Obtener datos de cabecera de la venta
    SELECT codigo_comprobante, vendedor_id INTO v_codigo_venta, v_usuario_id
    FROM ventas
    WHERE id = NEW.venta_id;

    -- Actualizar stock en productos
    UPDATE productos
    SET stock_actual = stock_actual - NEW.cantidad
    WHERE id = NEW.producto_id;

    -- Registrar movimiento en el Kardex
    INSERT INTO kardex_movimientos (
        producto_id, usuario_id, tipo_movimiento, cantidad,
        stock_anterior, stock_posterior, precio_unitario,
        referencia_origen, referencia_id, motivo
    ) VALUES (
        NEW.producto_id,
        v_usuario_id,
        'SALIDA_VENTA',
        NEW.cantidad,
        v_stock_anterior,
        v_stock_anterior - NEW.cantidad,
        NEW.precio_unitario,
        'VENTA',
        v_codigo_venta,
        'Venta realizada en caja / POS'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE compras  ALTER COLUMN fecha_compra SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date;
ALTER TABLE reportes ALTER COLUMN fecha        SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date;

COMMIT;
