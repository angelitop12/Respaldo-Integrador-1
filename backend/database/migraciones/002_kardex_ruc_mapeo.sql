-- ============================================================================
-- Migración 002: Kardex (historial), RUC de proveedores, mapeo de productos
--                y más información en las tablas.
--
-- Es NO destructiva e idempotente: se puede ejecutar más de una vez y no borra datos.
-- Si creaste la BD con el schema.sql nuevo, ya viene incluida (no hace falta correrla).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROVEEDORES: más datos y RUC validado
-- ----------------------------------------------------------------------------
ALTER TABLE proveedores
    ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100),
    ADD COLUMN IF NOT EXISTS condicion_pago VARCHAR(10) NOT NULL DEFAULT 'CONTADO',
    ADD COLUMN IF NOT EXISTS dias_credito INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS observaciones TEXT;

DO $$
BEGIN
    -- El RUC peruano tiene 11 dígitos y empieza con 10, 15, 17 o 20.
    -- NOT VALID: no revisa los registros que ya existían, solo los nuevos o modificados.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_proveedores_ruc') THEN
        ALTER TABLE proveedores
            ADD CONSTRAINT ck_proveedores_ruc CHECK (ruc IS NULL OR ruc ~ '^(10|15|17|20)[0-9]{9}$') NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_proveedores_pago') THEN
        ALTER TABLE proveedores
            ADD CONSTRAINT ck_proveedores_pago CHECK (condicion_pago IN ('CONTADO', 'CREDITO') AND dias_credito >= 0);
    END IF;
END $$;

-- Los RUC de ejemplo eran inventados y no pasaban el dígito verificador de SUNAT; se corrigen
-- (solo si todavía tienen el valor de ejemplo, así no se toca ningún dato que tú hayas escrito).
UPDATE proveedores SET ruc = '20100098475' WHERE ruc = '20100098476';
UPDATE proveedores SET ruc = '20100234565' WHERE ruc = '20100234567';
UPDATE proveedores SET ruc = '20501234894' WHERE ruc = '20501234890';

UPDATE proveedores SET ciudad = 'Callao', condicion_pago = 'CREDITO', dias_credito = 30 WHERE ruc = '20100035121' AND ciudad IS NULL;
UPDATE proveedores SET ciudad = 'Lima',   condicion_pago = 'CREDITO', dias_credito = 15 WHERE ruc = '20100138281' AND ciudad IS NULL;
UPDATE proveedores SET ciudad = 'Lima',   condicion_pago = 'CREDITO', dias_credito = 30 WHERE ruc = '20100098475' AND ciudad IS NULL;
UPDATE proveedores SET ciudad = 'Lurín'                                                  WHERE ruc = '20100234565' AND ciudad IS NULL;
UPDATE proveedores SET ciudad = 'Lima'                                                   WHERE ruc = '20501234894' AND ciudad IS NULL;

-- ----------------------------------------------------------------------------
-- 2. CLIENTES y USUARIOS: más datos
-- ----------------------------------------------------------------------------
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS distrito VARCHAR(100),
    ADD COLUMN IF NOT EXISTS observaciones TEXT;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS ultimo_cambio_clave TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 3. MAPA DEL ALMACÉN: ubicaciones (zona / pasillo / estante / nivel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ubicaciones_almacen (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(30) UNIQUE NOT NULL,        -- Ej: 'S-2-E1-1' (zona-pasillo-estante-nivel)
    zona VARCHAR(60) NOT NULL,                 -- Ej: 'Sala de ventas', 'Almacén A', 'Patio de Metales'
    pasillo VARCHAR(10) NOT NULL,
    estante VARCHAR(10) NOT NULL,
    nivel INT NOT NULL DEFAULT 1 CHECK (nivel >= 1),
    descripcion VARCHAR(150),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (zona, pasillo, estante, nivel)
);

-- ----------------------------------------------------------------------------
-- 4. PRODUCTOS: marca, código interno y ubicación
-- ----------------------------------------------------------------------------
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS marca VARCHAR(100),
    ADD COLUMN IF NOT EXISTS codigo_interno VARCHAR(30),
    ADD COLUMN IF NOT EXISTS ubicacion_id INT REFERENCES ubicaciones_almacen(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_codigo_interno ON productos (codigo_interno);
CREATE INDEX IF NOT EXISTS idx_productos_ubicacion ON productos (ubicacion_id);

UPDATE productos SET codigo_interno = 'PRD-' || LPAD(id::text, 4, '0') WHERE codigo_interno IS NULL;

-- ----------------------------------------------------------------------------
-- 5. MAPEO PRODUCTO <-> PROVEEDOR (qué proveedor vende qué, a qué precio y en cuánto tiempo)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_proveedor (
    producto_id INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    codigo_proveedor VARCHAR(60),              -- Código con el que el proveedor conoce al producto
    precio_compra NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (precio_compra >= 0),
    plazo_entrega_dias INT NOT NULL DEFAULT 1 CHECK (plazo_entrega_dias >= 0),
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (producto_id, proveedor_id)
);

-- Un producto solo puede tener UN proveedor principal
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_proveedor_principal ON producto_proveedor (producto_id) WHERE es_principal;
CREATE INDEX IF NOT EXISTS idx_producto_proveedor_proveedor ON producto_proveedor (proveedor_id);

DROP TRIGGER IF EXISTS trg_ubicaciones_updated_at ON ubicaciones_almacen;
CREATE TRIGGER trg_ubicaciones_updated_at BEFORE UPDATE ON ubicaciones_almacen
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();
DROP TRIGGER IF EXISTS trg_producto_proveedor_updated_at ON producto_proveedor;
CREATE TRIGGER trg_producto_proveedor_updated_at BEFORE UPDATE ON producto_proveedor
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

-- ----------------------------------------------------------------------------
-- 6. KARDEX: índices para consultar el historial rápido
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kardex_producto_fecha ON kardex_movimientos (producto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_fecha ON kardex_movimientos (created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. DATOS DE EJEMPLO (solo se aplican a los productos de ejemplo, por su código de barras)
-- ----------------------------------------------------------------------------
INSERT INTO ubicaciones_almacen (codigo, zona, pasillo, estante, nivel, descripcion) VALUES
('A-R-01-1', 'Almacén A',        'R', '01', 1, 'Rampa de descarga: cemento y bolsas pesadas'),
('A-R-02-1', 'Almacén A',        'R', '02', 1, 'Rampa de descarga: reserva'),
('P-P-01-1', 'Patio de Metales', 'P', '01', 1, 'Fierro corrugado y perfiles'),
('S-1-V1-1', 'Sala de ventas',   '1', 'V1', 1, 'Vitrina de herramientas manuales'),
('S-1-G4-1', 'Sala de ventas',   '1', 'G4', 1, 'Gaveta de clavos y fijaciones'),
('S-2-E1-1', 'Sala de ventas',   '2', 'E1', 1, 'Cables y material eléctrico'),
('S-2-E2-1', 'Sala de ventas',   '2', 'E2', 1, 'Iluminación y tomacorrientes'),
('S-3-P2-1', 'Sala de ventas',   '3', 'P2', 1, 'Tuberías y accesorios PVC'),
('S-3-P3-1', 'Sala de ventas',   '3', 'P3', 1, 'Pegamentos y llaves de agua'),
('S-4-P1-1', 'Sala de ventas',   '4', 'P1', 1, 'Pinturas y acabados'),
('S-C-V0-1', 'Sala de ventas',   'C', 'V0', 1, 'Vitrina central: herramientas eléctricas')
ON CONFLICT (codigo) DO NOTHING;

UPDATE productos p
SET ubicacion_id = u.id,
    marca = COALESCE(p.marca, m.marca)
FROM (VALUES
    ('775123400001', 'A-R-01-1', 'Pacasmayo'),
    ('775123400002', 'P-P-01-1', 'Aceros Arequipa'),
    ('775123400003', 'S-2-E1-1', 'Indeco'),
    ('775123400004', 'S-3-P2-1', 'Pavco'),
    ('775123400005', 'S-1-V1-1', 'Stanley'),
    ('775123400006', 'S-4-P1-1', 'Vencedor'),
    ('775123400007', 'S-1-G4-1', 'Aceros Arequipa'),
    ('775123400008', 'S-C-V0-1', 'DeWalt')
) AS m (codigo_barras, ubicacion, marca)
JOIN ubicaciones_almacen u ON u.codigo = m.ubicacion
WHERE p.codigo_barras = m.codigo_barras AND p.ubicacion_id IS NULL;

INSERT INTO producto_proveedor (producto_id, proveedor_id, codigo_proveedor, precio_compra, plazo_entrega_dias, es_principal)
SELECT p.id, pr.id, m.cod_prov, m.precio, m.plazo, TRUE
FROM (VALUES
    ('775123400001', '20100138281', 'CEM-I-425',  25.50, 2),
    ('775123400002', '20100035121', 'FC-1/2-9M',  38.00, 3),
    ('775123400003', '20100098475', 'THW-2.5',     1.80, 4),
    ('775123400004', '20100234565', 'SAP-1/2-5M', 11.50, 5),
    ('775123400005', '20501234894', 'ST-MU16',    24.00, 2),
    ('775123400007', '20100035121', 'CL-2-KG',     4.50, 3),
    ('775123400008', '20501234894', 'DWD024',    195.00, 7)
) AS m (codigo_barras, ruc, cod_prov, precio, plazo)
JOIN productos p ON p.codigo_barras = m.codigo_barras
JOIN proveedores pr ON pr.ruc = m.ruc
ON CONFLICT (producto_id, proveedor_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. VISTAS (se vuelven a crear; las columnas nuevas van al final)
-- ----------------------------------------------------------------------------
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
    END AS estado_stock,
    p.marca,
    p.codigo_interno AS "codigoInterno",
    p.ubicacion_id AS "ubicacionId",
    COALESCE(ub.codigo, p.ubicacion_estante) AS ubicacion
FROM productos p
JOIN categorias c ON p.categoria_id = c.id
JOIN unidades_medida u ON p.unidad_medida_id = u.id
LEFT JOIN ubicaciones_almacen ub ON ub.id = p.ubicacion_id
ORDER BY p.nombre ASC;

-- Historial del Kardex listo para mostrar en pantalla
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
    k.created_at AS "fechaHora"
FROM kardex_movimientos k
JOIN productos p ON p.id = k.producto_id
JOIN categorias c ON c.id = p.categoria_id
JOIN unidades_medida um ON um.id = p.unidad_medida_id
LEFT JOIN usuarios usr ON usr.id = k.usuario_id;
