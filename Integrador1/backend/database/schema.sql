-- ============================================================================
-- SISTEMA DE GESTIÓN DE ALMACÉN FERRETERO (ToolStore)
-- Script de Base de Datos Relacional Avanzado, Normalizado (3NF) y Optimizado
-- Motor: PostgreSQL 12+ / 14 / 15 / 16 / 17
-- Fecha de creación: 2026-10-10
-- Basado en los módulos y vistas del Frontend Angular:
--   - Login & Registro (Usuarios, Roles, Autenticación)
--   - Dashboard (Métricas en tiempo real, alertas de stock, gráficos de ventas)
--   - Inventario (Catálogo de productos, categorías, unidades de medida, stock)
--   - Ventas / POS (Cabecera y detalle de ventas, comprobantes, métodos de pago)
--   - Compras (Órdenes de compra a proveedores, recepción de mercancía)
--   - Clientes (Directorio comercial, documentos de identidad)
--   - Proveedores (Empresas distribuidoras, contactos y líneas de suministro)
--   - Reportes (Incidencias del equipo, seguimiento de solicitudes)
--   - Configuración (Datos fiscales de la empresa, preferencias del usuario)
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. LIMPIEZA DE TABLAS PREVIAS (DROP ORDENADO)
-- ============================================================================
DROP VIEW IF EXISTS vw_dashboard_resumen_hoy CASCADE;
DROP VIEW IF EXISTS vw_dashboard_ventas_mensuales CASCADE;
DROP VIEW IF EXISTS vw_dashboard_alertas_stock CASCADE;
DROP VIEW IF EXISTS vw_dashboard_ultimas_ventas CASCADE;
DROP VIEW IF EXISTS vw_inventario_completo CASCADE;
DROP VIEW IF EXISTS vw_ventas_listado CASCADE;
DROP VIEW IF EXISTS vw_compras_listado CASCADE;
DROP VIEW IF EXISTS vw_reportes_listado CASCADE;

DROP TABLE IF EXISTS detalle_ventas CASCADE;
DROP TABLE IF EXISTS ventas CASCADE;
DROP TABLE IF EXISTS detalle_compras CASCADE;
DROP TABLE IF EXISTS compras CASCADE;
DROP TABLE IF EXISTS kardex_movimientos CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS unidades_medida CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS proveedores CASCADE;
DROP TABLE IF EXISTS reportes CASCADE;
DROP TABLE IF EXISTS metodos_pago CASCADE;
DROP TABLE IF EXISTS preferencias_usuario CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS configuracion_empresa CASCADE;

-- ============================================================================
-- 2. TABLAS DE SEGURIDAD, ACCESO Y CONFIGURACIÓN DEL SISTEMA
-- ============================================================================

-- 2.1 Configuración de la Empresa / Ferretería (Soporta pantalla 'Configuración')
CREATE TABLE configuracion_empresa (
    id SERIAL PRIMARY KEY,
    nombre_comercial VARCHAR(150) NOT NULL DEFAULT 'Ferretería ToolStore',
    razon_social VARCHAR(200) DEFAULT 'ToolStore Ferretería S.A.C.',
    ruc VARCHAR(11) DEFAULT '20601234567',
    direccion VARCHAR(255) DEFAULT 'Av. Principal 1234, Lima, Perú',
    telefono VARCHAR(30) DEFAULT '(01) 456-7890',
    email VARCHAR(120) DEFAULT 'contacto@toolstore.com',
    moneda_simbolo VARCHAR(5) NOT NULL DEFAULT 'S/',
    moneda_codigo VARCHAR(5) NOT NULL DEFAULT 'PEN',
    porcentaje_igv NUMERIC(5,2) NOT NULL DEFAULT 18.00 CHECK (porcentaje_igv >= 0),
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 Roles de usuario
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL, -- 'ADMINISTRADOR', 'VENDEDOR', 'ALMACENERO'
    descripcion VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.3 Usuarios (Soporta 'Login', 'Registro' y autoría de operaciones)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    rol_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    nombre_completo VARCHAR(150) NOT NULL,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telefono VARCHAR(30),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.4 Preferencias del usuario (Soporta 'Configuración -> Preferencias')
CREATE TABLE preferencias_usuario (
    id SERIAL PRIMARY KEY,
    usuario_id INT UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    notificar_stock_bajo BOOLEAN NOT NULL DEFAULT TRUE,
    notificar_nuevas_ventas BOOLEAN NOT NULL DEFAULT FALSE,
    tema VARCHAR(20) NOT NULL DEFAULT 'light',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. CATÁLOGO MAESTRO: CATEGORÍAS, UNIDADES Y PRODUCTOS (INVENTARIO)
-- ============================================================================

-- 3.1 Categorías normalizadas (Soporta 'Inventario -> Categoría')
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3.2 Unidades de medida (Soporta 'Inventario -> Unidad: und, m, kg, gal, caja')
CREATE TABLE unidades_medida (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL, -- 'und', 'm', 'kg', 'gal', 'caja', 'bol'
    nombre VARCHAR(50) NOT NULL,        -- 'Unidad', 'Metro', 'Kilogramo', 'Galón', 'Caja', 'Bolsa'
    permite_decimales BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3.3 Catálogo de Productos (Soporta tabla y modal 'Inventario')
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(60) UNIQUE,
    categoria_id INT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    unidad_medida_id INT NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    precio_compra NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (precio_compra >= 0),
    precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (precio_venta >= 0),
    stock_actual NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (stock_actual >= 0),
    stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (stock_minimo >= 0),
    ubicacion_estante VARCHAR(100),
    imagen_url TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3.4 Kardex / Auditoría de Movimientos de Inventario (Nivel Avanzado)
CREATE TABLE kardex_movimientos (
    id BIGSERIAL PRIMARY KEY,
    producto_id INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo_movimiento VARCHAR(30) NOT NULL CHECK (
        tipo_movimiento IN (
            'INVENTARIO_INICIAL',
            'ENTRADA_COMPRA',
            'SALIDA_VENTA',
            'AJUSTE_POSITIVO',
            'AJUSTE_NEGATIVO',
            'ANULACION_VENTA',
            'ANULACION_COMPRA'
        )
    ),
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    stock_anterior NUMERIC(12,2) NOT NULL,
    stock_posterior NUMERIC(12,2) NOT NULL,
    costo_unitario NUMERIC(12,2) DEFAULT 0.00,
    precio_unitario NUMERIC(12,2) DEFAULT 0.00,
    referencia_origen VARCHAR(50), -- 'VENTA', 'COMPRA', 'MANUAL_PLUS', 'MANUAL_MINUS'
    referencia_id VARCHAR(50),     -- Código o ID de venta / compra
    motivo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. ENTIDADES COMERCIALES: CLIENTES Y PROVEEDORES
-- ============================================================================

-- 4.1 Directorio de Clientes (Soporta 'Clientes')
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    tipo_documento VARCHAR(20) NOT NULL DEFAULT 'DNI' CHECK (tipo_documento IN ('DNI', 'RUC', 'CE', 'PASAPORTE', 'VARIOS')),
    numero_documento VARCHAR(20),
    nombre VARCHAR(200) NOT NULL,
    telefono VARCHAR(30),
    email VARCHAR(150),
    direccion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4.2 Directorio de Proveedores (Soporta 'Proveedores')
CREATE TABLE proveedores (
    id SERIAL PRIMARY KEY,
    ruc VARCHAR(11) UNIQUE,
    empresa VARCHAR(200) NOT NULL,
    contacto VARCHAR(150),
    telefono VARCHAR(30),
    email VARCHAR(150),
    direccion TEXT,
    productos VARCHAR(255), -- '¿Qué provee?' Ej: 'Cemento, fierro corrugado'
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. MÉTODOS DE PAGO Y CAJA
-- ============================================================================

CREATE TABLE metodos_pago (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(30) UNIQUE NOT NULL, -- 'EFECTIVO', 'TARJETA', 'YAPE_PLIN', 'TRANSFERENCIA'
    nombre VARCHAR(60) NOT NULL,        -- 'Efectivo', 'Tarjeta', 'Yape/Plin', 'Transferencia'
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. VENTAS Y FACTURACIÓN / PUNTO DE VENTA (POS)
-- ============================================================================

-- 6.1 Cabecera de Ventas (Soporta tabla y formulario 'Ventas / POS')
CREATE TABLE ventas (
    id BIGSERIAL PRIMARY KEY,
    codigo_comprobante VARCHAR(50) UNIQUE NOT NULL, -- Ej: '#100001'
    cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    vendedor_id INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    metodo_pago_id INT NOT NULL REFERENCES metodos_pago(id) ON DELETE RESTRICT,
    tipo_comprobante VARCHAR(30) NOT NULL DEFAULT 'NOTA_VENTA' CHECK (
        tipo_comprobante IN ('NOTA_VENTA', 'BOLETA', 'FACTURA', 'TICKET')
    ),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    igv NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (igv >= 0),
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('COMPLETADA', 'ANULADA')),
    motivo_anulacion TEXT,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6.2 Detalle de Ventas (Productos vendidos por comprobante)
CREATE TABLE detalle_ventas (
    id BIGSERIAL PRIMARY KEY,
    venta_id BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    descuento NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (descuento >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. COMPRAS Y ABASTECIMIENTO
-- ============================================================================

-- 7.1 Cabecera de Compras (Soporta 'Compras')
CREATE TABLE compras (
    id SERIAL PRIMARY KEY,
    proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    numero_guia_factura VARCHAR(60),
    descripcion VARCHAR(255) NOT NULL, -- Ej: '50 bolsas de cemento'
    cantidad_total NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (cantidad_total > 0),
    costo_total NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (costo_total >= 0),
    fecha_compra DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_recepcion TIMESTAMPTZ,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Recibido', 'Cancelado')),
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7.2 Detalle de Compras (Productos abastecidos)
CREATE TABLE detalle_compras (
    id BIGSERIAL PRIMARY KEY,
    compra_id INT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id INT REFERENCES productos(id) ON DELETE SET NULL,
    descripcion_item VARCHAR(255) NOT NULL,
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 8. REPORTES E INCIDENCIAS DEL EQUIPO (Soporta 'Reportes')
-- ============================================================================

CREATE TABLE reportes (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    autor_nombre VARCHAR(150) NOT NULL, -- Sincronizado con form.autor
    categoria VARCHAR(50) NOT NULL CHECK (categoria IN ('Incidencia', 'Stock', 'Ventas', 'Sugerencia', 'Otro')),
    descripcion TEXT,
    estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En revisión', 'Resuelto')),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    solucion_nota TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. ÍNDICES DE RENDIMIENTO (OPTIMIZACIÓN DE CONSULTAS Y BÚSQUEDAS)
-- ============================================================================

-- Búsquedas en Inventario (por nombre y categoría)
CREATE INDEX idx_productos_nombre ON productos USING btree (LOWER(nombre));
CREATE INDEX idx_productos_categoria ON productos (categoria_id);
CREATE INDEX idx_productos_stock_alerta ON productos (stock_actual, stock_minimo);
CREATE INDEX idx_productos_activo ON productos (activo);

-- Búsquedas en Clientes y Proveedores
CREATE INDEX idx_clientes_nombre ON clientes USING btree (LOWER(nombre));
CREATE INDEX idx_clientes_numero_doc ON clientes (numero_documento);
CREATE INDEX idx_proveedores_empresa ON proveedores USING btree (LOWER(empresa));

-- Consultas temporales en Ventas y Compras
CREATE INDEX idx_ventas_fecha_hora ON ventas (fecha_hora);
CREATE INDEX idx_ventas_estado ON ventas (estado);
CREATE INDEX idx_ventas_cliente ON ventas (cliente_id);
CREATE INDEX idx_ventas_vendedor ON ventas (vendedor_id);
CREATE INDEX idx_detalle_ventas_venta ON detalle_ventas (venta_id);
CREATE INDEX idx_detalle_ventas_producto ON detalle_ventas (producto_id);

CREATE INDEX idx_compras_fecha ON compras (fecha_compra);
CREATE INDEX idx_compras_estado ON compras (estado);
CREATE INDEX idx_compras_proveedor ON compras (proveedor_id);

-- Movimientos Kardex
CREATE INDEX idx_kardex_producto_fecha ON kardex_movimientos (producto_id, created_at DESC);

-- Reportes
CREATE INDEX idx_reportes_estado ON reportes (estado);
CREATE INDEX idx_reportes_categoria ON reportes (categoria);
CREATE INDEX idx_reportes_fecha ON reportes (fecha DESC);

-- ============================================================================
-- 10. FUNCIONES Y TRIGGERS AUTOMÁTICOS (PL/pgSQL)
-- ============================================================================

-- 10.1 Actualizador automático de columna 'updated_at'
CREATE OR REPLACE FUNCTION fn_actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asignar trigger a todas las tablas con updated_at
CREATE TRIGGER trg_configuracion_updated_at BEFORE UPDATE ON configuracion_empresa FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_preferencias_updated_at BEFORE UPDATE ON preferencias_usuario FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_categorias_updated_at BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_productos_updated_at BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_proveedores_updated_at BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_ventas_updated_at BEFORE UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_compras_updated_at BEFORE UPDATE ON compras FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
CREATE TRIGGER trg_reportes_updated_at BEFORE UPDATE ON reportes FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

-- 10.2 Descuento de stock y registro en Kardex al vender un producto
CREATE OR REPLACE FUNCTION fn_procesar_detalle_venta()
RETURNS TRIGGER AS $$
DECLARE
    v_stock_anterior NUMERIC(12,2);
    v_codigo_venta VARCHAR(50);
    v_usuario_id INT;
BEGIN
    -- Obtener stock actual del producto con bloqueo para concurrencia
    SELECT stock_actual INTO v_stock_anterior
    FROM productos
    WHERE id = NEW.producto_id
    FOR UPDATE;

    -- Validar si hay stock suficiente
    IF v_stock_anterior < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto ID %. Stock actual: %, Solicitado: %',
            NEW.producto_id, v_stock_anterior, NEW.cantidad;
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

CREATE TRIGGER trg_descontar_stock_venta
AFTER INSERT ON detalle_ventas
FOR EACH ROW EXECUTE FUNCTION fn_procesar_detalle_venta();

-- 10.3 Restauración de stock al anular una venta
CREATE OR REPLACE FUNCTION fn_anular_venta()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_stock_ant NUMERIC(12,2);
BEGIN
    IF OLD.estado = 'COMPLETADA' AND NEW.estado = 'ANULADA' THEN
        FOR item IN (SELECT producto_id, cantidad, precio_unitario FROM detalle_ventas WHERE venta_id = NEW.id) LOOP
            SELECT stock_actual INTO v_stock_ant FROM productos WHERE id = item.producto_id FOR UPDATE;

            UPDATE productos
            SET stock_actual = stock_actual + item.cantidad
            WHERE id = item.producto_id;

            INSERT INTO kardex_movimientos (
                producto_id, usuario_id, tipo_movimiento, cantidad,
                stock_anterior, stock_posterior, precio_unitario,
                referencia_origen, referencia_id, motivo
            ) VALUES (
                item.producto_id,
                NEW.vendedor_id,
                'ANULACION_VENTA',
                item.cantidad,
                v_stock_ant,
                v_stock_ant + item.cantidad,
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

CREATE TRIGGER trg_anular_venta_restaurar_stock
AFTER UPDATE OF estado ON ventas
FOR EACH ROW EXECUTE FUNCTION fn_anular_venta();

-- 10.4 Ingreso de stock al marcar una compra como 'Recibido'
CREATE OR REPLACE FUNCTION fn_recepcion_compra()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_stock_ant NUMERIC(12,2);
BEGIN
    IF OLD.estado = 'Pendiente' AND NEW.estado = 'Recibido' THEN
        -- Si la compra tiene detalle de productos específicos
        FOR item IN (SELECT producto_id, cantidad, costo_unitario, descripcion_item FROM detalle_compras WHERE compra_id = NEW.id) LOOP
            IF item.producto_id IS NOT NULL THEN
                SELECT stock_actual INTO v_stock_ant FROM productos WHERE id = item.producto_id FOR UPDATE;

                UPDATE productos
                SET stock_actual = stock_actual + item.cantidad,
                    precio_compra = item.costo_unitario
                WHERE id = item.producto_id;

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

CREATE TRIGGER trg_recepcion_compra_ingreso_stock
AFTER UPDATE OF estado ON compras
FOR EACH ROW EXECUTE FUNCTION fn_recepcion_compra();

-- ============================================================================
-- 11. VISTAS SQL (MAPEO DIRECTO A LAS VISTAS Y COMPONENTES DE ANGULAR)
-- ============================================================================

-- 11.1 Vista para 'Inventario' (Mapeo directo con Producto de inventario.ts)
CREATE OR REPLACE VIEW vw_inventario_completo AS
SELECT 
    p.id,
    p.nombre,
    c.nombre AS categoria,
    u.codigo AS unidad,
    p.stock_actual AS stock,
    p.stock_minimo AS "stockMinimo",
    p.precio_venta AS precio,
    p.precio_compra AS "precioCompra",
    p.codigo_barras AS "codigoBarras",
    p.activo,
    CASE 
        WHEN p.stock_actual <= 0 THEN 'Agotado'
        WHEN p.stock_actual <= p.stock_minimo THEN 'Stock Bajo'
        ELSE 'Normal'
    END AS estado_stock
FROM productos p
JOIN categorias c ON p.categoria_id = c.id
JOIN unidades_medida u ON p.unidad_medida_id = u.id
ORDER BY p.nombre ASC;

-- 11.2 Vista para 'Ventas / POS' (Mapeo directo con Venta de ventas.ts)
CREATE OR REPLACE VIEW vw_ventas_listado AS
SELECT 
    v.codigo_comprobante AS id,
    v.id AS venta_pk,
    TO_CHAR(v.fecha_hora AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') AS fecha,
    TO_CHAR(v.fecha_hora AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora,
    c.nombre AS cliente,
    u.nombre_completo AS vendedor,
    mp.nombre AS "metodoPago",
    v.total,
    v.estado,
    v.fecha_hora AS fecha_orden
FROM ventas v
JOIN clientes c ON v.cliente_id = c.id
JOIN usuarios u ON v.vendedor_id = u.id
JOIN metodos_pago mp ON v.metodo_pago_id = mp.id
ORDER BY v.fecha_hora DESC;

-- 11.3 Vista para 'Compras' (Mapeo directo con Compra de compras.ts)
CREATE OR REPLACE VIEW vw_compras_listado AS
SELECT 
    c.id,
    p.empresa AS proveedor,
    c.descripcion,
    c.cantidad_total AS cantidad,
    c.costo_total AS "costoTotal",
    TO_CHAR(c.fecha_compra, 'DD/MM/YYYY') AS fecha,
    c.estado,
    c.created_at AS fecha_orden
FROM compras c
JOIN proveedores p ON c.proveedor_id = p.id
ORDER BY c.created_at DESC;

-- 11.4 Vista para 'Reportes' (Mapeo directo con Reporte de reportes.ts)
CREATE OR REPLACE VIEW vw_reportes_listado AS
SELECT 
    r.id,
    r.titulo,
    r.autor_nombre AS autor,
    r.categoria,
    r.descripcion,
    TO_CHAR(r.fecha, 'DD/MM/YYYY') AS fecha,
    r.estado,
    r.created_at AS fecha_orden
FROM reportes r
ORDER BY r.created_at DESC;

-- 11.5 Dashboard: Tarjetas de Resumen de Hoy (resumen en dashboard.ts)
CREATE OR REPLACE VIEW vw_dashboard_resumen_hoy AS
WITH datos_hoy AS (
    SELECT 
        COALESCE(SUM(total), 0) AS ventas_hoy,
        COUNT(id) AS conteo_ventas
    FROM ventas
    WHERE CAST(fecha_hora AT TIME ZONE 'America/Lima' AS DATE) = CURRENT_DATE
      AND estado = 'COMPLETADA'
),
clientes_hoy AS (
    SELECT COUNT(DISTINCT cliente_id) AS total_clientes
    FROM ventas
    WHERE CAST(fecha_hora AT TIME ZONE 'America/Lima' AS DATE) = CURRENT_DATE
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

-- 11.6 Dashboard: Gráfico de Ventas Mensuales (ventasMensuales en dashboard.ts)
CREATE OR REPLACE VIEW vw_dashboard_ventas_mensuales AS
WITH meses AS (
    SELECT generate_series(
        DATE_TRUNC('year', CURRENT_DATE),
        DATE_TRUNC('month', CURRENT_DATE),
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

-- 11.7 Dashboard: Alertas de Stock Bajo (alertas en dashboard.ts)
CREATE OR REPLACE VIEW vw_dashboard_alertas_stock AS
SELECT 
    p.nombre AS producto,
    'Quedan ' || TRIM(TO_CHAR(p.stock_actual, 'FM999,990.##')) || ' ' || u.codigo || 
    ' (Mínimo: ' || TRIM(TO_CHAR(p.stock_minimo, 'FM999,990.##')) || ')' AS detalle,
    CASE 
        WHEN p.stock_actual <= 0 THEN '#dc2626' -- Rojo fuerte si está agotado
        WHEN p.stock_actual <= (p.stock_minimo * 0.5) THEN '#ef4444' -- Rojo si es crítico (<50% del mínimo)
        ELSE '#f59e0b' -- Ámbar/amarillo alerta
    END AS color,
    p.stock_actual,
    p.stock_minimo
FROM productos p
JOIN unidades_medida u ON p.unidad_medida_id = u.id
WHERE p.activo = TRUE 
  AND p.stock_actual <= p.stock_minimo
ORDER BY (p.stock_actual / NULLIF(p.stock_minimo, 0)) ASC, p.stock_actual ASC
LIMIT 10;

-- 11.8 Dashboard: Últimas Ventas (ultimasVentas en dashboard.ts)
CREATE OR REPLACE VIEW vw_dashboard_ultimas_ventas AS
SELECT 
    v.codigo_comprobante AS id,
    c.nombre AS cliente,
    'S/ ' || TO_CHAR(v.total, 'FM999,990.00') AS total,
    v.fecha_hora
FROM ventas v
JOIN clientes c ON v.cliente_id = c.id
WHERE v.estado = 'COMPLETADA'
ORDER BY v.fecha_hora DESC
LIMIT 5;

-- ============================================================================
-- 12. DATOS SEMILLA (SEEDS REALISTAS PARA FERRETERÍA)
-- ============================================================================

-- 12.1 Empresa
INSERT INTO configuracion_empresa (nombre_comercial, razon_social, ruc, direccion, telefono, email, moneda_simbolo, moneda_codigo, porcentaje_igv)
VALUES ('ToolStore Ferretería', 'Comercial Ferretera ToolStore S.A.C.', '20608976543', 'Av. Nicolás Ayllón 1520, Lima', '(01) 428-9876', 'ventas@toolstore.pe', 'S/', 'PEN', 18.00);

-- 12.2 Roles del Sistema
INSERT INTO roles (nombre, descripcion) VALUES
('ADMINISTRADOR', 'Acceso total a todos los módulos y configuraciones'),
('VENDEDOR', 'Acceso a ventas / POS, clientes y consulta de catálogo'),
('ALMACENERO', 'Acceso a inventario, compras y recepción de mercadería');

-- 12.3 Usuarios Iniciales
-- Contraseña para 'admin': '1234' (almacenada con crypt/bf y compatible con la prueba actual del frontend)
INSERT INTO usuarios (rol_id, nombre_completo, usuario, email, password_hash, telefono) VALUES
(1, 'Administrador General', 'admin', 'admin@toolstore.pe', crypt('1234', gen_salt('bf')), '987654321'),
(2, 'Juan Pérez Vendedor', 'vendedor1', 'juan.perez@toolstore.pe', crypt('123456', gen_salt('bf')), '912345678'),
(3, 'Carlos Gómez Almacén', 'almacen1', 'carlos.gomez@toolstore.pe', crypt('123456', gen_salt('bf')), '934567890');

-- 12.4 Preferencias del Administrador
INSERT INTO preferencias_usuario (usuario_id, notificar_stock_bajo, notificar_nuevas_ventas)
VALUES (1, TRUE, TRUE);

-- 12.5 Unidades de Medida
INSERT INTO unidades_medida (codigo, nombre, permite_decimales) VALUES
('und', 'Unidad', FALSE),
('m', 'Metro', TRUE),
('kg', 'Kilogramo', TRUE),
('gal', 'Galón', TRUE),
('caja', 'Caja', FALSE),
('bol', 'Bolsa', FALSE);

-- 12.6 Categorías Ferretería
INSERT INTO categorias (nombre, descripcion) VALUES
('Materiales de Construcción', 'Cementos, fierro corrugado, arenas y aditivos'),
('Electricidad e Iluminación', 'Cables, tomacorrientes, llaves térmicas y focos LED'),
('Gasfitería y Tuberías', 'Tubos PVC, accesorios sanitarios, llaves y pegamentos'),
('Herramientas Manuales', 'Martillos, alicates, destornilladores, sierras y llaves'),
('Herramientas Eléctricas', 'Taladros, amoladoras, rotomartillos y lijadoras'),
('Pinturas y Acabados', 'Látex, esmaltes, brochas, rodillos, lijas y thinner'),
('Tornillería y Fijaciones', 'Tornillos drywall, clavos, pernos, tarugos y arandelas'),
('Seguridad Industrial', 'Cascos, guantes de nitrilo/cuero, lentes y mascarillas');

-- 12.7 Métodos de Pago
INSERT INTO metodos_pago (codigo, nombre) VALUES
('EFECTIVO', 'Efectivo'),
('TARJETA', 'Tarjeta'),
('YAPE_PLIN', 'Yape/Plin'),
('TRANSFERENCIA', 'Transferencia');

-- 12.8 Clientes
INSERT INTO clientes (tipo_documento, numero_documento, nombre, telefono, email, direccion, activo) VALUES
('VARIOS', '00000000', 'Público General / Cliente Varios', NULL, NULL, 'Venta en mostrador', TRUE),
('DNI', '45892134', 'Roberto Sánchez Mendoza', '987112233', 'roberto.sanchez@gmail.com', 'Jr. Los Cedros 342, San Borja', TRUE),
('RUC', '20556789123', 'Constructora Horizonte S.A.C.', '998877665', 'compras@constructorahorizonte.pe', 'Av. Javier Prado Este 2850, Surco', TRUE),
('DNI', '71239845', 'Elena Morales Vega', '976543210', 'elena.morales@hotmail.com', 'Calle Las Begonias 120, Lince', TRUE),
('DNI', '40987654', 'Miguel Ángel Torres', '945612378', 'mtorres@outlook.com', 'Av. Arequipa 1450, Lima', TRUE);

-- 12.9 Proveedores
INSERT INTO proveedores (ruc, empresa, contacto, telefono, email, direccion, productos, activo) VALUES
('20100035121', 'Aceros Arequipa S.A.', 'Jorge Ramos', '(01) 517-1800', 'ventas@acerosarequipa.com.pe', 'Av. Enrique Meiggs 297, Callao', 'Fierro corrugado, alambrón, clavos', TRUE),
('20100138281', 'Cementos Pacasmayo S.A.A.', 'Manuel Silva', '(01) 317-6000', 'pedidos@pacasmayo.com.pe', 'Calle La Colonia 180, Lima', 'Cemento Portland Extraforte, Tipo I', TRUE),
('20100098476', 'Indeco S.A.', 'Patricia Quispe', '(01) 710-8000', 'atencion@indeco.com.pe', 'Av. Universitaria 850, San Martín de Porres', 'Cables eléctricos THW, mellizos, vulcanizados', TRUE),
('20100234567', 'Pavco Wavin Perú', 'Luis Huamán', '(01) 627-5600', 'contacto@pavco.com.pe', 'Av. Industrial 450, Lurín', 'Tuberías y conexiones PVC de agua y desagüe', TRUE),
('20501234890', 'Distribuidora Ferretera Stanley Mayorista', 'Rosa Valdivia', '981234567', 'distribuidor@stanleyperu.com', 'Av. Colonial 2300, Cercado de Lima', 'Herramientas manuales, cajas de herramientas, cintas métricas', TRUE);

-- 12.10 Catálogo Inicial de Productos
INSERT INTO productos (codigo_barras, categoria_id, unidad_medida_id, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, ubicacion_estante) VALUES
('775123400001', 1, 6, 'Cemento Portland Tipo I Pacasmayo 42.5kg', 'Cemento estándar para estructuras en general', 25.50, 31.00, 120.00, 30.00, 'Almacén A - Rampa'),
('775123400002', 1, 1, 'Fierro Corrugado 1/2" Aceros Arequipa (9m)', 'Varilla de acero corrugado de construcción', 38.00, 46.50, 85.00, 20.00, 'Patio de Metales'),
('775123400003', 2, 2, 'Cable THW 2.5mm Indeco (por metro)', 'Cable unipolar de cobre para instalaciones domiciliarias', 1.80, 2.70, 8.00, 25.00, 'Pasillo 2 - Estante E1'), -- Alerta stock bajo
('775123400004', 3, 1, 'Tubo PVC 1/2" SAP Agua Fría Pavco (5m)', 'Tubería para red de distribución de agua potable', 11.50, 16.00, 14.00, 15.00, 'Pasillo 3 - Estante P2'), -- Alerta stock bajo
('775123400005', 4, 1, 'Martillo de Uña 16oz Stanley Fibra de Vidrio', 'Mango ergonómico anti-deslizante', 24.00, 35.00, 18.00, 5.00, 'Pasillo 1 - Vitrina V1'),
('775123400006', 6, 4, 'Pintura Látex Blanco Clásico Vencedor (Galón)', 'Pintura de alto rendimiento para interiores y exteriores', 32.00, 44.00, 22.00, 8.00, 'Pasillo 4 - Estante P1'),
('775123400007', 7, 3, 'Clavos de 2" con Cabeza Aceros Arequipa (por kg)', 'Clavos de acero estándar para madera', 4.50, 7.00, 4.00, 10.00, 'Pasillo 1 - Gaveta G4'), -- Alerta stock bajo
('775123400008', 5, 1, 'Taladro Percutor 1/2" 650W DeWalt DWD024', 'Velocidad variable reversible para concreto y metal', 195.00, 259.00, 7.00, 2.00, 'Vitrina Central');

-- 12.11 Movimientos Iniciales de Kardex
INSERT INTO kardex_movimientos (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_posterior, costo_unitario, referencia_origen, motivo)
SELECT id, 1, 'INVENTARIO_INICIAL', stock_actual, 0, stock_actual, precio_compra, 'INICIO', 'Carga inicial de inventario'
FROM productos;

-- 12.12 Ventas Iniciales (Alimentan el Dashboard y el Historial)
-- Venta 1: #100001 (Ayer)
INSERT INTO ventas (codigo_comprobante, cliente_id, vendedor_id, metodo_pago_id, tipo_comprobante, subtotal, igv, total, estado, fecha_hora)
VALUES ('#100001', 2, 2, 1, 'BOLETA', 69.49, 12.51, 82.00, 'COMPLETADA', CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours');

INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
VALUES 
(1, 5, 1, 35.00, 35.00), -- 1 Martillo Stanley
(1, 2, 1, 47.00, 47.00); -- 1 Fierro Corrugado

-- Venta 2: #100002 (Hoy)
INSERT INTO ventas (codigo_comprobante, cliente_id, vendedor_id, metodo_pago_id, tipo_comprobante, subtotal, igv, total, estado, fecha_hora)
VALUES ('#100002', 3, 1, 3, 'FACTURA', 1313.56, 236.44, 1550.00, 'COMPLETADA', CURRENT_TIMESTAMP - INTERVAL '2 hours');

INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
VALUES 
(2, 1, 50, 31.00, 1550.00); -- 50 bolsas cemento

-- Venta 3: #100003 (Hoy)
INSERT INTO ventas (codigo_comprobante, cliente_id, vendedor_id, metodo_pago_id, tipo_comprobante, subtotal, igv, total, estado, fecha_hora)
VALUES ('#100003', 4, 2, 2, 'BOLETA', 105.08, 18.92, 124.00, 'COMPLETADA', CURRENT_TIMESTAMP - INTERVAL '45 minutes');

INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
VALUES 
(3, 6, 2, 44.00, 88.00), -- 2 Galones de Pintura
(3, 4, 2, 18.00, 36.00); -- 2 Tubos PVC

-- 12.13 Compras Iniciales
INSERT INTO compras (proveedor_id, usuario_id, numero_guia_factura, descripcion, cantidad_total, costo_total, fecha_compra, fecha_recepcion, estado, observaciones) VALUES
(2, 1, 'F001-0004521', '50 bolsas de cemento Portland Tipo I', 50, 1275.00, CURRENT_DATE - 3, CURRENT_TIMESTAMP - INTERVAL '2 days', 'Recibido', 'Pedido entregado conforme en almacén'),
(1, 1, 'F002-0012890', '100 varillas de fierro corrugado 1/2"', 100, 3800.00, CURRENT_DATE, NULL, 'Pendiente', 'Coordinado despacho para mañana primera hora'),
(4, 3, 'F005-0003410', '40 tubos PVC agua fría 1/2" Pavco', 40, 460.00, CURRENT_DATE, NULL, 'Pendiente', 'Reposición de stock crítico');

-- Detalle de compra inicial recibida
INSERT INTO detalle_compras (compra_id, producto_id, descripcion_item, cantidad, costo_unitario, subtotal)
VALUES (1, 1, 'Cemento Portland Tipo I Pacasmayo 42.5kg', 50, 25.50, 1275.00);

-- 12.14 Reportes Iniciales del Equipo
INSERT INTO reportes (titulo, autor_nombre, categoria, descripcion, estado, fecha) VALUES
('Falla en balanza digital de mostrador', 'Carlos Gómez', 'Incidencia', 'La balanza digital del área de tornillería presenta descalibración intermitente de +/- 50 gramos al pesar clavos.', 'Pendiente', CURRENT_DATE),
('Stock mínimo alcanzado en cable THW 2.5mm', 'Juan Pérez', 'Stock', 'Quedan únicamente 8 metros de cable THW 2.5mm. Los clientes solicitan rollos completos de 100m.', 'En revisión', CURRENT_DATE),
('Sugerencia: Habilitar cobros con código QR en segundo punto', 'Juan Pérez', 'Sugerencia', 'Los clientes los fines de semana forman cola para pagar con Yape. Sería óptimo imprimir un segundo QR visible.', 'Resuelto', CURRENT_DATE - 1);

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

