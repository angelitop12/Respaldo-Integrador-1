// Arma el Excel del Kardex valorizado (método FIFO). Es simple y ordenado, con 2 hojas:
//   1. Kardex  - una fila por movimiento: entrada, salida, saldo, costo unitario, total bruto y saldo valorizado
//   2. Lotes FIFO - de qué compras está hecho el stock actual y cuál sale primero
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
const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function textoFechaLima(fecha) {
  return new Date(fecha).toLocaleString('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

// datos: { movimientos (orden cronológico), lotes, filtros: { producto, tipo, sentido, desde, hasta, q }, productoUnico, usuario, empresa }
function construirExcelKardex(datos) {
  const L = new Libro();
  const SOLES = '"S/ "#,##0.00';
  const NUM = '#,##0.00';
  const vacias = (n) => Array(n).fill(null);

  // ---- estilos (pocos y sencillos) ----------------------------------------
  const sTitulo = L.estilo({ negrita: true, tam: 16, color: AZUL });
  const sSub = L.estilo({ tam: 10, color: '404040' });
  const sNota = L.estilo({ cursiva: true, tam: 9, color: '595959' });
  const sTh = L.estilo({ negrita: true, tam: 10, color: 'FFFFFF', fondo: AZUL, h: 'center', ajustar: true, borde: 'fino' });
  const base = { tam: 10, borde: 'fino' };
  const sTxt = L.estilo({ ...base });
  const sTxtC = L.estilo({ ...base, h: 'center' });
  const sFecha = L.estilo({ ...base, h: 'center', formato: 'dd/mm/yyyy hh:mm' });
  const sEnt = L.estilo({ ...base, formato: NUM, color: '1B7F3B' });   // entradas en verde
  const sSal = L.estilo({ ...base, formato: NUM, color: 'C0392B' });   // salidas en rojo
  const sNum = L.estilo({ ...base, formato: NUM });
  const sSol = L.estilo({ ...base, formato: SOLES });
  const sSolNeg = L.estilo({ ...base, formato: SOLES, negrita: true });
  const sEntero = L.estilo({ ...base, formato: '0', h: 'center' });
  const sVacio = L.estilo({ cursiva: true, color: '595959', h: 'center', borde: 'fino' });
  const sEtiqueta = L.estilo({ negrita: true, tam: 10, h: 'right' });
  const sResultado = L.estilo({ negrita: true, tam: 11, formato: SOLES, fondo: 'FFF2CC', borde: 'fino' });
  const sResultadoNum = L.estilo({ negrita: true, tam: 11, formato: NUM, fondo: 'FFF2CC', borde: 'fino' });

  const f = datos.filtros || {};
  const generado = `Generado el ${textoFechaLima(new Date())} por ${datos.usuario || 'sistema'}`;
  const partesFiltro = [
    `Producto: ${f.producto || 'todos'}`,
    ...(f.tipo ? [`Movimiento: ${TEXTO_TIPO[f.tipo] || f.tipo}`] : f.sentido ? [`Solo ${f.sentido === 'ENTRADA' ? 'entradas' : 'salidas'}`] : []),
    ...(f.desde ? [`Desde: ${f.desde}`] : []),
    ...(f.hasta ? [`Hasta: ${f.hasta}`] : []),
    ...(f.q ? [`Búsqueda: "${f.q}"`] : [])
  ].join('  ·  ');

  // =========================================================================
  // HOJA 1: KARDEX
  // =========================================================================
  const h1 = L.hoja('Kardex', { color: AZUL });
  const COLS = 10; // A..J
  h1.fila(1, [{ v: `KARDEX VALORIZADO — ${datos.empresa || 'Ferretería ToolStore'}`, s: sTitulo }, ...vacias(COLS - 1)], 26);
  h1.fila(2, [{ v: `Método FIFO (PEPS)  ·  Soles (S/)  ·  ${partesFiltro}`, s: sSub }], 16);
  h1.fila(3, [{ v: generado, s: sNota }], 14);
  h1.combinar('A1:J1').combinar('A2:J2').combinar('A3:J3');

  const FH = 5; // fila de encabezados
  h1.fila(FH, ['Fecha', 'Producto', 'Movimiento', 'Referencia', 'Entrada', 'Salida', 'Saldo (unidades)', 'Costo unitario', 'Total bruto', 'Saldo valorizado']
    .map(v => ({ v, s: sTh })), 30);

  const movs = datos.movimientos || [];
  let r = FH + 1;
  const primera = r;
  movs.forEach((m) => {
    const entrada = m.sentido === 'ENTRADA';
    h1.fila(r, [
      { v: new Date(m.fechaHora), s: sFecha },
      { v: m.producto, s: sTxt },
      { v: TEXTO_TIPO[m.tipo] || m.tipo, s: sTxt },
      { v: m.referencia || '', s: sTxtC },
      { v: entrada ? Number(m.cantidad) : null, s: sEnt },
      { v: !entrada ? Number(m.cantidad) : null, s: sSal },
      { v: Number(m.stockPosterior), s: sNum },
      { v: Number(m.costoUnitario), s: sSol },
      { v: Number(m.costoTotal), s: sSol },
      { v: Number(m.saldoValorizado), s: sSolNeg }
    ], 17);
    r++;
  });
  if (!movs.length) {
    h1.fila(r, [{ v: 'No hay movimientos con los filtros elegidos.', s: sVacio }, ...vacias(COLS - 1).map(() => ({ s: sVacio }))], 20);
    h1.combinar(`A${r}:J${r}`);
    r++;
  }
  const ultima = r - 1;

  // Resumen debajo de la tabla (sencillo: lo que se compró, lo que se vendió y cómo queda el stock)
  const suma = (campo, sentido) => redondear(movs.filter(m => m.sentido === sentido).reduce((t, m) => t + Number(m[campo] || 0), 0));
  const rango = (col) => `${col}${primera}:${col}${ultima}`;
  const filaRes = (n, texto, celda) => { h1.fila(n, [...vacias(7), { v: texto, s: sEtiqueta }, null, celda]); h1.combinar(`H${n}:I${n}`); };
  r += 1;
  filaRes(r, 'Total bruto de entradas', movs.length
    ? { f: `SUMIF(${rango('E')},">0",${rango('I')})`, v: suma('costoTotal', 'ENTRADA'), s: sResultado } : { v: 0, s: sResultado });
  filaRes(r + 1, 'Total bruto de salidas (costo)', movs.length
    ? { f: `SUMIF(${rango('F')},">0",${rango('I')})`, v: suma('costoTotal', 'SALIDA'), s: sResultado } : { v: 0, s: sResultado });
  let fin = r + 1;
  if (datos.productoUnico && movs.length) {
    const ult = movs[movs.length - 1];
    filaRes(r + 2, 'Stock que queda (unidades)', { v: Number(ult.stockPosterior), s: sResultadoNum });
    filaRes(r + 3, 'Saldo valorizado final', { v: Number(ult.saldoValorizado), s: sResultado });
    fin = r + 3;
  }
  h1.fila(fin + 2, [{ v: 'Total bruto = cantidad × costo unitario, sin IGV. El costo sale del método FIFO: cada venta descuenta primero la compra más antigua.', s: sNota }]);
  h1.combinar(`A${fin + 2}:J${fin + 2}`);

  h1.columnas([17, 38, 18, 13, 11, 11, 14, 14, 14, 17]);
  h1.congelar(FH, 0).repetir(FH, FH);
  if (movs.length) h1.filtro(`A${FH}:J${ultima}`);

  // =========================================================================
  // HOJA 2: LOTES FIFO
  // =========================================================================
  const h2 = L.hoja('Lotes FIFO', { color: '2E7D32' });
  h2.fila(1, [{ v: 'LOTES FIFO — de qué compras está hecho el stock actual', s: sTitulo }, ...vacias(8)], 26);
  h2.fila(2, [{ v: 'El lote con orden 1 es el primero que se vende.  ·  ' + generado, s: sNota }], 14);
  h2.combinar('A1:I1').combinar('A2:I2');
  h2.fila(4, ['Producto', 'Lote', 'Origen', 'Fecha de ingreso', 'Cantidad inicial', 'Cantidad que queda', 'Costo unitario', 'Valor', 'Orden de salida']
    .map(v => ({ v, s: sTh })), 30);
  const lotes = datos.lotes || [];
  let r2 = 5;
  lotes.forEach((l) => {
    h2.fila(r2, [
      { v: l.producto, s: sTxt },
      { v: Number(l.id), s: sEntero },
      { v: TEXTO_ORIGEN[l.origen] || l.origen, s: sTxt },
      { v: new Date(l.fechaIngreso), s: sFecha },
      { v: Number(l.cantidadInicial), s: sNum },
      { v: Number(l.cantidadRestante), s: sNum },
      { v: Number(l.costoUnitario), s: sSol },
      { f: `ROUND(F${r2}*G${r2},2)`, v: Number(l.valor), s: sSol },
      { v: Number(l.ordenSalida), s: sEntero }
    ], 17);
    r2++;
  });
  if (!lotes.length) {
    h2.fila(r2, [{ v: 'No hay lotes con existencias.', s: sVacio }, ...vacias(8).map(() => ({ s: sVacio }))], 20);
    h2.combinar(`A${r2}:I${r2}`);
    r2++;
  }
  const ult2 = r2 - 1;
  h2.fila(r2 + 1, [...vacias(6), { v: 'Valor total del inventario', s: sEtiqueta }, lotes.length
    ? { f: `SUM(H5:H${ult2})`, v: redondear(lotes.reduce((t, l) => t + Number(l.valor), 0)), s: sResultado } : { v: 0, s: sResultado }]);
  h2.columnas([38, 8, 20, 17, 13, 14, 14, 14, 13]);
  h2.congelar(4, 0).repetir(4, 4);
  if (lotes.length) h2.filtro(`A4:I${ult2}`);

  return L.generar({ titulo: 'Kardex valorizado FIFO', autor: datos.usuario || 'ToolStore' });
}

module.exports = { construirExcelKardex };
