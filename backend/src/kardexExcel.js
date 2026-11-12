// Arma el Excel del Kardex valorizado (método FIFO) con 3 hojas:
//   1. Kardex valorizado    - una fila por movimiento: entradas, salidas, saldo y valor de venta
//   2. Lotes FIFO vigentes  - de qué compras está hecho el stock actual y cuál sale primero
//   3. Resumen por producto - stock, lotes, costo promedio y valor del inventario
const { Libro } = require('./excel');

const TEXTO_TIPO = {
  INVENTARIO_INICIAL: 'Inventario inicial',
  ENTRADA_COMPRA: 'Compra recibida',
  SALIDA_VENTA: 'Venta',
  AJUSTE_POSITIVO: 'Ajuste (+)',
  AJUSTE_NEGATIVO: 'Ajuste (−)',
  ANULACION_VENTA: 'Venta anulada',
  ANULACION_COMPRA: 'Compra anulada'
};
const TEXTO_ORIGEN = {
  INICIAL: 'Stock inicial',
  COMPRA: 'Compra',
  AJUSTE: 'Ajuste manual',
  ANULACION: 'Venta anulada',
  MIGRACION: 'Stock previo al FIFO'
};

const AZUL = '1F3864';
const VERDE = '2E7D32';
const ROJO = 'C0392B';
const CELESTE = '1F5FA8';
const DORADO = '7F6000';
const GRIS = '595959';
const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function textoFechaLima(fecha) {
  return new Date(fecha).toLocaleString('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

// datos: { movimientos, lotes, resumen, filtros: { producto, tipo, sentido, desde, hasta, q }, productoUnico, limitado, usuario, empresa }
function construirExcelKardex(datos) {
  const L = new Libro();
  const SOLES = '"S/ "#,##0.00';
  const NUM = '#,##0.00';
  const vacias = (n) => Array(n).fill(null);

  // ---- estilos ------------------------------------------------------------
  const sTitulo = L.estilo({ negrita: true, tam: 16, color: AZUL });
  const sSub = L.estilo({ tam: 10, color: '404040' });
  const sNota = L.estilo({ cursiva: true, tam: 9, color: GRIS, ajustar: true });
  const sTh = L.estilo({ negrita: true, tam: 10, color: 'FFFFFF', fondo: AZUL, h: 'center', ajustar: true, borde: 'fino' });
  const grupo = (fondo) => L.estilo({ negrita: true, tam: 10, color: 'FFFFFF', fondo, h: 'center', borde: 'fino' });
  const base = { tam: 10, borde: 'fino' };
  const sTxt = L.estilo({ ...base });
  const sTxtC = L.estilo({ ...base, h: 'center' });
  const sEntero = L.estilo({ ...base, formato: '0', h: 'center' });
  const sFecha = L.estilo({ ...base, h: 'center', formato: 'dd/mm/yyyy hh:mm' });
  const sNum = L.estilo({ ...base, formato: NUM });
  const sSol = L.estilo({ ...base, formato: SOLES });
  const sEntN = L.estilo({ ...base, formato: NUM, fondo: 'F1F8F1' });
  const sEntS = L.estilo({ ...base, formato: SOLES, fondo: 'F1F8F1' });
  const sSalN = L.estilo({ ...base, formato: NUM, fondo: 'FDF3F2' });
  const sSalS = L.estilo({ ...base, formato: SOLES, fondo: 'FDF3F2' });
  const sSaldoN = L.estilo({ ...base, formato: NUM, fondo: 'F0F5FC' });
  const sSaldoS = L.estilo({ ...base, formato: SOLES, fondo: 'F0F5FC' });
  const sVenta = L.estilo({ ...base, formato: SOLES, fondo: 'FFF8E1' });
  const sVacio = L.estilo({ cursiva: true, color: GRIS, h: 'center', borde: 'fino' });
  const sTotTxt = L.estilo({ negrita: true, tam: 10, fondo: 'FFF2CC', borde: 'fino' });
  const sTotNum = L.estilo({ negrita: true, tam: 10, formato: NUM, fondo: 'FFF2CC', borde: 'fino' });
  const sTotSol = L.estilo({ negrita: true, tam: 10, formato: SOLES, fondo: 'FFF2CC', borde: 'fino' });
  const sTotC = L.estilo({ negrita: true, tam: 10, fondo: 'FFF2CC', borde: 'fino', h: 'center' });
  const sCont = L.estilo({ ...base, color: 'A6A6A6' });
  const sContC = L.estilo({ ...base, color: 'A6A6A6', h: 'center' });
  const sContF = L.estilo({ ...base, color: 'A6A6A6', h: 'center', formato: 'dd/mm/yyyy hh:mm' });
  const sSaldoT = L.estilo({ ...base, formato: NUM, fondo: 'E3ECF9', negrita: true });
  const sSaldoTS = L.estilo({ ...base, formato: SOLES, fondo: 'E3ECF9', negrita: true });
  const sPrimero = L.estilo({ ...base, h: 'center', negrita: true, color: VERDE });

  const f = datos.filtros || {};
  const generado = `Generado el ${textoFechaLima(new Date())} por ${datos.usuario || 'sistema'}`;
  const partesFiltro = [
    `Producto: ${f.producto || 'todos'}`,
    `Movimiento: ${f.tipo ? (TEXTO_TIPO[f.tipo] || f.tipo) : f.sentido ? (f.sentido === 'ENTRADA' ? 'solo entradas' : 'solo salidas') : 'todos'}`,
    `Desde: ${f.desde || '—'}`,
    `Hasta: ${f.hasta || '—'}`,
    ...(f.q ? [`Búsqueda: "${f.q}"`] : [])
  ].join('   ·   ');

  // =========================================================================
  // HOJA 1: KARDEX VALORIZADO (A..S) - tres bloques: Entradas, Salidas y Saldo por lote
  // =========================================================================
  const h1 = L.hoja('Kardex valorizado', { color: AZUL });
  const COLS = 19;
  h1.fila(1, [{ v: `${(datos.empresa || 'ToolStore Ferretería').toUpperCase()} — KARDEX VALORIZADO`, s: sTitulo }, ...vacias(COLS - 1)], 26);
  h1.fila(2, [{ v: 'Método de valorización: FIFO (PEPS: primeras entradas, primeras salidas)  ·  Moneda: soles (S/)  ·  Total = cantidad × costo unitario, sin IGV', s: sSub }], 16);
  h1.fila(3, [{ v: partesFiltro, s: sSub }], 16);
  h1.fila(4, [{ v: generado + (datos.limitado ? '  ·  Se muestran solo los movimientos más recientes (límite de exportación)' : ''), s: sNota }], 14);
  h1.combinar('A1:S1').combinar('A2:S2').combinar('A3:S3').combinar('A4:S4');

  const g = (v, fondo) => ({ v, s: grupo(fondo) });
  h1.fila(6, [
    g('DATOS DEL MOVIMIENTO', GRIS), ...vacias(6).map(() => ({ s: grupo(GRIS) })),
    g('ENTRADAS', VERDE), { s: grupo(VERDE) }, { s: grupo(VERDE) },
    g('SALIDAS', ROJO), { s: grupo(ROJO) }, { s: grupo(ROJO) },
    g('SALDO POR LOTE (EXISTENCIAS FIFO)', CELESTE), { s: grupo(CELESTE) }, { s: grupo(CELESTE) },
    g('SALDO TOTAL', CELESTE), { s: grupo(CELESTE) },
    g('VENTA', DORADO)
  ], 18);
  h1.combinar('A6:G6').combinar('H6:J6').combinar('K6:M6').combinar('N6:P6').combinar('Q6:R6');

  const FH = 7;
  h1.fila(FH, ['N.º', 'Fecha y hora', 'Código', 'Producto', 'Movimiento', 'Referencia', 'Usuario',
    'Cantidad', 'Costo unitario (S/)', 'Total (S/)',
    'Cantidad', 'Costo unitario (S/)', 'Total (S/)',
    'Cantidad', 'Costo unitario (S/)', 'Total (S/)',
    'Stock total', 'Valor total (S/)',
    'Valor de venta (S/)'].map(v => ({ v, s: sTh })), 32);

  // ---- Reconstrucción de los lotes FIFO tras cada movimiento --------------
  // Se simula el FIFO con los mismos movimientos del Kardex. El resultado se valida contra el stock y el
  // saldo valorizado que guarda el sistema; si no coinciden (por ejemplo, porque se filtró por fechas o
  // se aplicó el límite de exportación y falta el historial anterior), ese producto muestra el saldo en una
  // sola línea con su costo promedio, para no mostrar nunca datos inventados.
  const movs = datos.movimientos || [];
  const EPS = 0.011;
  const cerca = (a, b) => Math.abs(Number(a) - Number(b)) <= EPS;
  const detalle = new Map(); // id del movimiento -> { salidas: [...], saldo: [...] | null }
  const porProducto = new Map();
  movs.forEach((m) => {
    const clave = m.productoId !== undefined ? m.productoId : m.producto;
    if (!porProducto.has(clave)) porProducto.set(clave, []);
    porProducto.get(clave).push(m);
  });
  porProducto.forEach((lista) => {
    const capas = [];            // capas en orden de llegada
    const consumos = new Map();  // referencia de la venta -> capas que consumió
    let fiable = lista.length > 0 && cerca(lista[0].stockAnterior === undefined ? 0 : lista[0].stockAnterior, 0);
    lista.forEach((m) => {
      const cant = Number(m.cantidad);
      let salidas = [];
      if (fiable) {
        if (m.sentido === 'ENTRADA') {
          const restauradas = m.tipo === 'ANULACION_VENTA' ? consumos.get(m.referencia) : null;
          if (restauradas) {
            restauradas.forEach((c) => { c.capa.cant = redondear(c.capa.cant + c.cant); });
            consumos.delete(m.referencia);
          } else {
            capas.push({ cant, costo: Number(m.costoUnitario) });
          }
        } else {
          let falta = cant;
          const usadas = [];
          for (const c of capas) {
            if (falta <= 0.0001) break;
            const toma = Math.min(c.cant, falta);
            if (toma > 0) { usadas.push({ capa: c, cant: redondear(toma), costo: c.costo }); c.cant = redondear(c.cant - toma); falta -= toma; }
          }
          if (falta > EPS) fiable = false;
          salidas = usadas.map((u) => ({ cant: u.cant, costo: u.costo, total: redondear(u.cant * u.costo) }));
          if (m.tipo === 'SALIDA_VENTA') consumos.set(m.referencia, usadas);
          if (fiable && !cerca(salidas.reduce((t, s) => t + s.total, 0), Number(m.costoTotal))) fiable = false;
        }
        const vivas = capas.filter((c) => c.cant > 0.0001);
        const stock = redondear(vivas.reduce((t, c) => t + c.cant, 0));
        const valor = redondear(vivas.reduce((t, c) => t + c.cant * c.costo, 0));
        if (!cerca(stock, m.stockPosterior) || !cerca(valor, m.saldoValorizado)) fiable = false;
        if (fiable) {
          detalle.set(m.id, { salidas, saldo: vivas.map((c) => ({ cant: c.cant, costo: c.costo, total: redondear(c.cant * c.costo) })) });
          return;
        }
      }
      detalle.set(m.id, null); // sin reconstrucción fiable
    });
  });

  const primera = FH + 1;
  let r = primera;
  let sumaEnt = 0, sumaEntCant = 0, sumaSal = 0, sumaSalCant = 0, sumaVenta = 0, completo = true;
  movs.forEach((m, i) => {
    const entrada = m.sentido === 'ENTRADA';
    const esVenta = m.tipo === 'SALIDA_VENTA' || m.tipo === 'ANULACION_VENTA';
    const valorVenta = esVenta && m.valorVenta !== null && m.valorVenta !== undefined ? Number(m.valorVenta) * (m.tipo === 'ANULACION_VENTA' ? -1 : 1) : null;
    const d = detalle.get(m.id);
    if (!d) completo = false;
    const stockPost = Number(m.stockPosterior);
    const valorPost = Number(m.saldoValorizado);

    // líneas de la salida y del saldo (una por lote, o una sola si no se pudo reconstruir)
    const lineasSalida = entrada ? [] : d ? d.salidas : [{ cant: Number(m.cantidad), costo: Number(m.costoUnitario), total: Number(m.costoTotal) }];
    const lineasSaldo = d && d.saldo.length ? d.saldo
      : [{ cant: stockPost, costo: stockPost > 0 ? redondear(valorPost / stockPost) : 0, total: valorPost }];
    const filas = Math.max(1, lineasSalida.length, lineasSaldo.length);

    if (entrada) { sumaEnt += Number(m.costoTotal); sumaEntCant += Number(m.cantidad); }
    else { sumaSal += Number(m.costoTotal); sumaSalCant += Number(m.cantidad); }
    if (valorVenta !== null) sumaVenta += valorVenta;

    for (let k = 0; k < filas; k++) {
      const primeraFila = k === 0;
      const so = lineasSalida[k];
      const sa = lineasSaldo[k];
      // las filas de continuación repiten los datos del movimiento en gris (así el filtro de Excel no las pierde)
      const tx = primeraFila ? sTxt : sCont;
      const tc = primeraFila ? sTxtC : sContC;
      h1.fila(r, [
        { v: i + 1, s: primeraFila ? sEntero : sContC },
        { v: new Date(m.fechaHora), s: primeraFila ? sFecha : sContF },
        { v: m.codigoInterno || '', s: tc },
        { v: m.producto, s: tx },
        { v: TEXTO_TIPO[m.tipo] || m.tipo, s: tx },
        { v: m.referencia || '', s: tc },
        { v: m.usuario || '', s: tx },
        { v: entrada && primeraFila ? Number(m.cantidad) : null, s: sEntN },
        { v: entrada && primeraFila ? Number(m.costoUnitario) : null, s: sEntS },
        { v: entrada && primeraFila ? Number(m.costoTotal) : null, s: sEntS },
        { v: so ? so.cant : null, s: sSalN },
        { v: so ? so.costo : null, s: sSalS },
        { v: so ? so.total : null, s: sSalS },
        { v: sa ? sa.cant : null, s: sSaldoN },
        { v: sa ? sa.costo : null, s: sSaldoS },
        { v: sa ? sa.total : null, s: sSaldoS },
        { v: primeraFila ? stockPost : null, s: sSaldoT },
        { v: primeraFila ? valorPost : null, s: sSaldoTS },
        { v: primeraFila ? valorVenta : null, s: sVenta }
      ], 17);
      r++;
    }
  });
  if (!movs.length) {
    h1.fila(r, [{ v: 'No hay movimientos con los filtros elegidos.', s: sVacio }, ...vacias(COLS - 1).map(() => ({ s: sVacio }))], 20);
    h1.combinar(`A${r}:S${r}`);
    r++;
  }
  const ultima = r - 1;
  const rng = (c) => `${c}${primera}:${c}${ultima}`;

  // fila de totales (SUBTOTAL respeta los filtros que se apliquen en Excel)
  const filaTot = ultima + 1;
  const tot = (col, valor, est) => (movs.length ? { f: `SUBTOTAL(109,${rng(col)})`, v: redondear(valor), s: est } : { v: 0, s: est });
  const ultMov = movs[movs.length - 1];
  h1.fila(filaTot, [
    { v: datos.productoUnico ? 'TOTALES (producto elegido)' : 'TOTALES (todos los productos)', s: sTotTxt },
    ...vacias(6).map(() => ({ s: sTotTxt })),
    tot('H', sumaEntCant, sTotNum), { s: sTotTxt }, tot('J', sumaEnt, sTotSol),
    tot('K', sumaSalCant, sTotNum), { s: sTotTxt }, tot('M', sumaSal, sTotSol),
    { s: sTotTxt }, { s: sTotTxt }, { s: sTotTxt },
    datos.productoUnico && movs.length ? { v: Number(ultMov.stockPosterior), s: sTotNum } : { v: 'según producto', s: sTotC },
    datos.productoUnico && movs.length ? { v: Number(ultMov.saldoValorizado), s: sTotSol } : { s: sTotTxt },
    tot('S', sumaVenta, sTotSol)
  ], 20);
  h1.combinar(`A${filaTot}:G${filaTot}`);

  h1.fila(filaTot + 2, [{ v: 'Cómo leerlo: cada VENTA sale primero de la compra más antigua (FIFO); si cruza dos lotes, la salida se muestra en una línea por lote. El SALDO POR LOTE detalla qué lotes (y a qué costo) quedan en existencia tras cada movimiento; el SALDO TOTAL es su suma. El VALOR DE VENTA es cantidad × precio de venta (las ventas anuladas restan).'
    + (completo ? '' : ' En los productos cuyo historial no está completo en este reporte (por filtros de fecha o límite de exportación) el saldo se muestra en una sola línea con su costo promedio.'), s: sNota }], 40);
  h1.combinar(`A${filaTot + 2}:S${filaTot + 2}`);

  h1.columnas([5, 17, 11, 34, 17, 12, 20, 9, 12, 13, 9, 12, 13, 9, 12, 13, 10, 14, 15]);
  h1.congelar(FH, 4).repetir(FH - 1, FH);
  if (movs.length) h1.filtro(`A${FH}:S${ultima}`);

  // =========================================================================
  // HOJA 2: LOTES FIFO VIGENTES (A..J)
  // =========================================================================
  const h2 = L.hoja('Lotes FIFO vigentes', { color: VERDE });
  h2.fila(1, [{ v: 'LOTES FIFO VIGENTES — de qué compras está hecho el stock actual', s: sTitulo }, ...vacias(9)], 26);
  h2.fila(2, [{ v: `Cada fila es una entrada de mercadería con su costo. La venta siempre consume primero el lote con "Orden de salida" 1.  ·  ${generado}`, s: sNota }], 14);
  h2.combinar('A1:J1').combinar('A2:J2');
  h2.fila(4, ['Producto', 'Código', 'Lote N.º', 'Origen', 'Fecha de ingreso', 'Cantidad inicial', 'Cantidad restante', 'Costo unitario (S/)', 'Valor (S/)', 'Orden de salida']
    .map(v => ({ v, s: sTh })), 30);
  const lotes = datos.lotes || [];
  let r2 = 5;
  lotes.forEach((l) => {
    const orden = Number(l.ordenSalida);
    h2.fila(r2, [
      { v: l.producto, s: sTxt },
      { v: l.codigoInterno || '', s: sTxtC },
      { v: Number(l.id), s: sEntero },
      { v: TEXTO_ORIGEN[l.origen] || l.origen, s: sTxt },
      { v: new Date(l.fechaIngreso), s: sFecha },
      { v: Number(l.cantidadInicial), s: sNum },
      { v: Number(l.cantidadRestante), s: sNum },
      { v: Number(l.costoUnitario), s: sSol },
      { f: `ROUND(G${r2}*H${r2},2)`, v: redondear(Number(l.cantidadRestante) * Number(l.costoUnitario)), s: sSol },
      { v: orden === 1 ? '1.º en salir' : `${orden}.º`, s: orden === 1 ? sPrimero : sTxtC }
    ], 17);
    r2++;
  });
  if (!lotes.length) {
    h2.fila(r2, [{ v: 'No hay lotes con existencias.', s: sVacio }, ...vacias(9).map(() => ({ s: sVacio }))], 20);
    h2.combinar(`A${r2}:J${r2}`);
    r2++;
  }
  const ult2 = r2 - 1;
  const tot2 = (col, valor, est) => (lotes.length ? { f: `SUBTOTAL(109,${col}5:${col}${ult2})`, v: valor, s: est } : { v: 0, s: est });
  h2.fila(r2, [
    { v: 'VALOR TOTAL DEL INVENTARIO (FIFO)', s: sTotTxt }, ...vacias(5).map(() => ({ s: sTotTxt })),
    tot2('G', redondear(lotes.reduce((t, l) => t + Number(l.cantidadRestante), 0)), sTotNum), { s: sTotTxt },
    tot2('I', redondear(lotes.reduce((t, l) => t + Number(l.cantidadRestante) * Number(l.costoUnitario), 0)), sTotSol), { s: sTotTxt }
  ], 20);
  h2.combinar(`A${r2}:F${r2}`);
  h2.columnas([38, 11, 9, 22, 17, 12, 12, 14, 14, 14]);
  h2.congelar(4, 1).repetir(4, 4);
  if (lotes.length) h2.filtro(`A4:J${ult2}`);

  // =========================================================================
  // HOJA 3: RESUMEN POR PRODUCTO (A..H)
  // =========================================================================
  const h3 = L.hoja('Resumen por producto', { color: DORADO });
  h3.fila(1, [{ v: 'RESUMEN POR PRODUCTO — stock y valor del inventario (FIFO)', s: sTitulo }, ...vacias(7)], 26);
  h3.fila(2, [{ v: generado, s: sNota }], 14);
  h3.combinar('A1:H1').combinar('A2:H2');
  h3.fila(4, ['Producto', 'Código', 'Unidad', 'Stock actual', 'Lotes vigentes', 'Costo unit. promedio (S/)', 'Valor del inventario (S/)', 'Último costo de compra (S/)']
    .map(v => ({ v, s: sTh })), 30);
  const resumen = datos.resumen || [];
  let r3 = 5;
  resumen.forEach((p) => {
    const stock = Number(p.stock);
    const valor = redondear(p.valor);
    h3.fila(r3, [
      { v: p.producto, s: sTxt },
      { v: p.codigoInterno || '', s: sTxtC },
      { v: p.unidad || '', s: sTxtC },
      { v: stock, s: sNum },
      { v: Number(p.lotes), s: sEntero },
      { f: `IF(D${r3}>0,ROUND(G${r3}/D${r3},2),0)`, v: stock > 0 ? redondear(valor / stock) : 0, s: sSol },
      { v: valor, s: sSol },
      { v: Number(p.ultimoCosto || 0), s: sSol }
    ], 17);
    r3++;
  });
  if (!resumen.length) {
    h3.fila(r3, [{ v: 'No hay productos.', s: sVacio }, ...vacias(7).map(() => ({ s: sVacio }))], 20);
    h3.combinar(`A${r3}:H${r3}`);
    r3++;
  }
  const ult3 = r3 - 1;
  h3.fila(r3, [
    { v: 'TOTAL', s: sTotTxt }, ...vacias(5).map(() => ({ s: sTotTxt })),
    resumen.length ? { f: `SUBTOTAL(109,G5:G${ult3})`, v: redondear(resumen.reduce((t, p) => t + Number(p.valor), 0)), s: sTotSol } : { v: 0, s: sTotSol },
    { s: sTotTxt }
  ], 20);
  h3.combinar(`A${r3}:F${r3}`);
  h3.columnas([42, 11, 9, 13, 11, 16, 18, 18]);
  h3.congelar(4, 1).repetir(4, 4);
  if (resumen.length) h3.filtro(`A4:H${ult3}`);

  return L.generar({ titulo: 'Kardex valorizado FIFO', autor: datos.usuario || 'ToolStore' });
}

module.exports = { construirExcelKardex };