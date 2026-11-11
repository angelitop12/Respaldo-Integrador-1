-- ============================================================================
-- 004 · MÁS PRODUCTOS DE EJEMPLO PARA EL INVENTARIO (50 productos)
-- ----------------------------------------------------------------------------
-- Requisito: haber ejecutado antes la migración 003 (FIFO). Si hiciste "npm run db:reset", ya la tiene.
-- Es seguro ejecutarlo más de una vez: no repite los productos que ya existen (compara nombre y código de barras).
-- Cada producto nuevo entra con su código PRD-0000, su ubicación en el almacén, un LOTE FIFO inicial
-- y su movimiento "Inventario inicial" en el Kardex (con costo), igual que si se hubiera registrado desde el sistema.
-- ============================================================================

-- Ubicaciones nuevas para los productos de seguridad, herramientas y accesorios de pintura
INSERT INTO ubicaciones_almacen (codigo, zona, pasillo, estante, nivel, descripcion) VALUES
('S-1-V2-1', 'Sala de ventas', '1', 'V2', 1, 'Vitrina de herramientas manuales: destornilladores, cintas y niveles'),
('S-4-P2-1', 'Sala de ventas', '4', 'P2', 1, 'Brochas, rodillos y lijas'),
('S-5-E1-1', 'Sala de ventas', '5', 'E1', 1, 'Seguridad industrial: cascos, guantes, lentes y mascarillas')
ON CONFLICT (codigo) DO NOTHING;

WITH nuevos (nombre, categoria, unidad, marca, compra, venta, stock, minimo, ubicacion, barras) AS (
  VALUES
    ('Cemento Sol Tipo I 42.5kg', 'Materiales de Construcción', 'bol', 'Sol', 24.80, 29.90, 150, 40, 'A-R-01-1', '775123400101'),
    ('Cemento Andino Tipo V 42.5kg', 'Materiales de Construcción', 'bol', 'Andino', 27.50, 33.00, 60, 20, 'A-R-02-1', '775123400102'),
    ('Fierro Corrugado 3/8" Aceros Arequipa (9m)', 'Materiales de Construcción', 'und', 'Aceros Arequipa', 18.50, 23.00, 200, 50, 'P-P-01-1', '775123400103'),
    ('Fierro Corrugado 5/8" Aceros Arequipa (9m)', 'Materiales de Construcción', 'und', 'Aceros Arequipa', 55.00, 67.00, 90, 25, 'P-P-01-1', '775123400104'),
    ('Alambre Negro N° 16 (por kg)', 'Materiales de Construcción', 'kg', 'Aceros Arequipa', 5.20, 7.50, 80, 20, 'P-P-01-1', '775123400105'),
    ('Ladrillo King Kong 18 Huecos', 'Materiales de Construcción', 'und', 'Lark', 1.05, 1.60, 2000, 500, 'A-R-02-1', '775123400106'),
    ('Arena Gruesa (bolsa 25kg)', 'Materiales de Construcción', 'bol', NULL, 3.50, 5.50, 120, 30, 'A-R-02-1', '775123400107'),
    ('Yeso en Polvo 25kg', 'Materiales de Construcción', 'bol', 'Yesera Lima', 9.50, 14.00, 8, 10, 'A-R-01-1', '775123400108'),
    ('Cable THW 4mm Indeco (por metro)', 'Electricidad e Iluminación', 'm', 'Indeco', 2.90, 4.20, 300, 80, 'S-2-E1-1', '775123400109'),
    ('Cable Mellizo 2x14 AWG (por metro)', 'Electricidad e Iluminación', 'm', 'Indeco', 1.60, 2.50, 400, 100, 'S-2-E1-1', '775123400110'),
    ('Tomacorriente Doble con Tierra Bticino', 'Electricidad e Iluminación', 'und', 'Bticino', 6.80, 11.50, 60, 15, 'S-2-E2-1', '775123400111'),
    ('Interruptor Simple Bticino', 'Electricidad e Iluminación', 'und', 'Bticino', 4.50, 8.00, 70, 15, 'S-2-E2-1', '775123400112'),
    ('Llave Térmica 2x20A Schneider', 'Electricidad e Iluminación', 'und', 'Schneider', 22.00, 34.00, 25, 8, 'S-2-E2-1', '775123400113'),
    ('Foco LED 9W Luz Blanca Philips', 'Electricidad e Iluminación', 'und', 'Philips', 3.80, 7.00, 150, 40, 'S-2-E2-1', '775123400114'),
    ('Cinta Aislante 3M 18mm', 'Electricidad e Iluminación', 'und', '3M', 2.20, 4.00, 100, 25, 'S-2-E1-1', '775123400115'),
    ('Tubo Conduit PVC 3/4" (3m)', 'Electricidad e Iluminación', 'und', 'Pavco', 3.20, 5.00, 80, 20, 'S-2-E1-1', '775123400116'),
    ('Codo PVC 1/2" SAP Agua Fría', 'Gasfitería y Tuberías', 'und', 'Pavco', 0.60, 1.20, 300, 80, 'S-3-P2-1', '775123400117'),
    ('Tubo PVC 4" Desagüe Pavco (3m)', 'Gasfitería y Tuberías', 'und', 'Pavco', 24.00, 34.00, 35, 10, 'S-3-P2-1', '775123400118'),
    ('Llave de Paso 1/2" Bronce', 'Gasfitería y Tuberías', 'und', 'Vainsa', 12.50, 20.00, 40, 10, 'S-3-P3-1', '775123400119'),
    ('Pegamento para PVC Pavco 1/4 Galón', 'Gasfitería y Tuberías', 'gal', 'Pavco', 18.00, 27.00, 30, 8, 'S-3-P3-1', '775123400120'),
    ('Cinta Teflón 3/4"', 'Gasfitería y Tuberías', 'und', NULL, 0.90, 2.00, 200, 50, 'S-3-P3-1', '775123400121'),
    ('Grifo para Lavatorio Cromado', 'Gasfitería y Tuberías', 'und', 'Vainsa', 28.00, 45.00, 20, 5, 'S-3-P3-1', '775123400122'),
    ('Alicate Universal 8" Stanley', 'Herramientas Manuales', 'und', 'Stanley', 22.00, 35.00, 25, 6, 'S-1-V1-1', '775123400123'),
    ('Destornillador Plano 1/4" x 6" Stanley', 'Herramientas Manuales', 'und', 'Stanley', 7.50, 13.00, 40, 10, 'S-1-V2-1', '775123400124'),
    ('Destornillador Estrella N° 2 Stanley', 'Herramientas Manuales', 'und', 'Stanley', 7.50, 13.00, 40, 10, 'S-1-V2-1', '775123400125'),
    ('Cinta Métrica 5m Stanley', 'Herramientas Manuales', 'und', 'Stanley', 14.00, 24.00, 35, 8, 'S-1-V2-1', '775123400126'),
    ('Serrucho 20" Bellota', 'Herramientas Manuales', 'und', 'Bellota', 21.00, 34.00, 15, 4, 'S-1-V1-1', '775123400127'),
    ('Llave Francesa 10" Stanley', 'Herramientas Manuales', 'und', 'Stanley', 29.00, 46.00, 3, 3, 'S-1-V1-1', '775123400128'),
    ('Nivel de Burbuja 24"', 'Herramientas Manuales', 'und', 'Stanley', 18.00, 30.00, 14, 4, 'S-1-V2-1', '775123400129'),
    ('Juego de Llaves Allen 9 Piezas', 'Herramientas Manuales', 'und', 'Stanley', 11.00, 19.00, 20, 5, 'S-1-V2-1', '775123400130'),
    ('Amoladora Angular 4 1/2" 850W Bosch', 'Herramientas Eléctricas', 'und', 'Bosch', 165.00, 219.00, 9, 3, 'S-C-V0-1', '775123400131'),
    ('Rotomartillo SDS Plus 800W Makita', 'Herramientas Eléctricas', 'und', 'Makita', 380.00, 489.00, 2, 2, 'S-C-V0-1', '775123400132'),
    ('Lijadora Orbital 200W Black+Decker', 'Herramientas Eléctricas', 'und', 'Black+Decker', 120.00, 165.00, 6, 2, 'S-C-V0-1', '775123400133'),
    ('Sierra Circular 7 1/4" 1400W DeWalt', 'Herramientas Eléctricas', 'und', 'DeWalt', 310.00, 399.00, 4, 2, 'S-C-V0-1', '775123400134'),
    ('Pintura Látex Blanco Vencedor (Balde 4 Galones)', 'Pinturas y Acabados', 'und', 'Vencedor', 95.00, 129.00, 12, 4, 'S-4-P1-1', '775123400135'),
    ('Esmalte Sintético Negro Tekno 1/4 Galón', 'Pinturas y Acabados', 'und', 'Tekno', 16.50, 26.00, 20, 5, 'S-4-P1-1', '775123400136'),
    ('Thinner Acrílico (Galón)', 'Pinturas y Acabados', 'gal', 'Vencedor', 24.00, 36.00, 25, 6, 'S-4-P1-1', '775123400137'),
    ('Brocha 3" Cerda Natural', 'Pinturas y Acabados', 'und', 'Tumi', 5.50, 10.00, 50, 12, 'S-4-P2-1', '775123400138'),
    ('Rodillo 9" con Mango', 'Pinturas y Acabados', 'und', 'Tumi', 7.00, 13.00, 40, 10, 'S-4-P2-1', '775123400139'),
    ('Lija de Agua N° 220 (pliego)', 'Pinturas y Acabados', 'und', 'Norton', 0.90, 2.00, 200, 50, 'S-4-P2-1', '775123400140'),
    ('Tornillo Drywall 1" (caja 100 unidades)', 'Tornillería y Fijaciones', 'caja', NULL, 7.00, 12.00, 60, 15, 'S-1-G4-1', '775123400141'),
    ('Tarugo Plástico 1/4" con Tornillo (bolsa 50)', 'Tornillería y Fijaciones', 'bol', 'Fischer', 3.00, 6.00, 80, 20, 'S-1-G4-1', '775123400142'),
    ('Perno Hexagonal 3/8" x 2"', 'Tornillería y Fijaciones', 'und', NULL, 0.80, 1.80, 300, 80, 'S-1-G4-1', '775123400143'),
    ('Clavos de 3" con Cabeza (por kg)', 'Tornillería y Fijaciones', 'kg', 'Aceros Arequipa', 4.30, 6.80, 60, 15, 'S-1-G4-1', '775123400144'),
    ('Arandela Plana 3/8" (bolsa 100)', 'Tornillería y Fijaciones', 'bol', NULL, 4.50, 8.50, 50, 12, 'S-1-G4-1', '775123400145'),
    ('Casco de Seguridad Blanco 3M', 'Seguridad Industrial', 'und', '3M', 14.00, 24.00, 30, 8, 'S-5-E1-1', '775123400146'),
    ('Guantes de Cuero Reforzado (par)', 'Seguridad Industrial', 'und', NULL, 7.00, 13.00, 60, 15, 'S-5-E1-1', '775123400147'),
    ('Lentes de Seguridad Transparentes', 'Seguridad Industrial', 'und', '3M', 4.50, 9.00, 70, 18, 'S-5-E1-1', '775123400148'),
    ('Mascarilla N95 (caja 20 unidades)', 'Seguridad Industrial', 'caja', '3M', 28.00, 45.00, 25, 6, 'S-5-E1-1', '775123400149'),
    ('Chaleco Reflectivo Naranja', 'Seguridad Industrial', 'und', NULL, 9.00, 16.00, 25, 8, 'S-5-E1-1', '775123400150')
),
insertados AS (
  INSERT INTO productos (codigo_barras, categoria_id, unidad_medida_id, nombre, marca, precio_compra, precio_venta,
                         stock_actual, stock_minimo, ubicacion_id)
  SELECT n.barras, c.id, u.id, n.nombre, n.marca, n.compra, n.venta, n.stock, n.minimo, ub.id
  FROM nuevos n
  JOIN categorias c ON c.nombre = n.categoria
  JOIN unidades_medida u ON u.codigo = n.unidad
  LEFT JOIN ubicaciones_almacen ub ON ub.codigo = n.ubicacion
  WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.nombre = n.nombre OR p.codigo_barras = n.barras)
  RETURNING id, stock_actual, precio_compra
),
kardex AS (
  INSERT INTO kardex_movimientos (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_posterior,
                                  costo_unitario, referencia_origen, referencia_id, motivo)
  SELECT id, 1, 'INVENTARIO_INICIAL', stock_actual, 0, stock_actual, precio_compra, 'INICIO', id::text,
         'Carga inicial de productos de ejemplo'
  FROM insertados
  WHERE stock_actual > 0
)
SELECT fn_fifo_ingresar(id, stock_actual, precio_compra, 'INICIAL', id::text)
FROM insertados
WHERE stock_actual > 0;

-- Código interno (PRD-0001, PRD-0002…) para los productos que no lo tengan
UPDATE productos SET codigo_interno = 'PRD-' || LPAD(id::text, 4, '0') WHERE codigo_interno IS NULL;

-- Resumen: cuántos productos hay ahora
SELECT COUNT(*) AS productos_en_inventario FROM productos WHERE activo = TRUE;
