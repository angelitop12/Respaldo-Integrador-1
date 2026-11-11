// Generador de archivos Excel (.xlsx) SIN dependencias externas.
// Un .xlsx es un .zip con archivos XML; aquí se arma ese zip a mano (zlib viene con Node).
// Soporta: varias hojas, estilos (negrita, colores, bordes, formatos de número y fecha), celdas combinadas,
// fórmulas, filtros, panel congelado, anchos de columna e impresión horizontal ajustada a la hoja.
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// ZIP mínimo (método "deflate")
// ---------------------------------------------------------------------------
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function crearZip(archivos) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  // Fecha fija (1/1/2024) para que el resultado sea siempre igual
  const dosHora = 0;
  const dosFecha = ((2024 - 1980) << 9) | (1 << 5) | 1;

  for (const { nombre, contenido } of archivos) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const comprimido = zlib.deflateRawSync(datos);
    const crc = crc32(datos);

    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0);
    cab.writeUInt16LE(20, 4);
    cab.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    cab.writeUInt16LE(8, 8);
    cab.writeUInt16LE(dosHora, 10);
    cab.writeUInt16LE(dosFecha, 12);
    cab.writeUInt32LE(crc, 14);
    cab.writeUInt32LE(comprimido.length, 18);
    cab.writeUInt32LE(datos.length, 22);
    cab.writeUInt16LE(nombreBuf.length, 26);
    cab.writeUInt16LE(0, 28);
    locales.push(cab, nombreBuf, comprimido);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(dosHora, 12);
    cen.writeUInt16LE(dosFecha, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comprimido.length, 20);
    cen.writeUInt32LE(datos.length, 24);
    cen.writeUInt16LE(nombreBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    centrales.push(cen, nombreBuf);

    offset += cab.length + nombreBuf.length + comprimido.length;
  }

  const tamCentral = centrales.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(tamCentral, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, ...centrales, fin]);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const esc = (v) =>
  String(v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function letraColumna(indice) { // 0 → A, 25 → Z, 26 → AA
  let n = indice + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Fecha → número de serie de Excel, ya en hora de Lima (UTC-5, Perú no usa horario de verano)
function fechaExcel(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getTime() - 5 * 3600 * 1000) / 86400000 + 25569;
}

// ---------------------------------------------------------------------------
// Libro
// ---------------------------------------------------------------------------
class Libro {
  constructor() {
    this.fuentes = ['<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>'];
    this.rellenos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.bordes = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.formatos = new Map(); // código → id
    this.estilos = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cacheEstilos = new Map();
    this.hojas = [];
  }

  _indice(lista, xml) {
    let i = lista.indexOf(xml);
    if (i < 0) { lista.push(xml); i = lista.length - 1; }
    return i;
  }

  // spec: { negrita, cursiva, tam, color, fondo, borde:'fino'|'arriba'|'doble-arriba', formato, h:'left'|'center'|'right', v, ajustar, sangria }
  estilo(spec = {}) {
    const clave = JSON.stringify(spec);
    if (this.cacheEstilos.has(clave)) return this.cacheEstilos.get(clave);

    const fuente = '<font>' + (spec.negrita ? '<b/>' : '') + (spec.cursiva ? '<i/>' : '') +
      `<sz val="${spec.tam || 10}"/>` + `<color rgb="FF${spec.color || '000000'}"/>` + '<name val="Calibri"/><family val="2"/></font>';
    const fontId = this._indice(this.fuentes, fuente);

    let fillId = 0;
    if (spec.fondo) {
      fillId = this._indice(this.rellenos, `<fill><patternFill patternType="solid"><fgColor rgb="FF${spec.fondo}"/><bgColor indexed="64"/></patternFill></fill>`);
    }

    let borderId = 0;
    const gris = '<color rgb="FFBFBFBF"/>';
    if (spec.borde === 'fino') {
      borderId = this._indice(this.bordes, `<border><left style="thin">${gris}</left><right style="thin">${gris}</right><top style="thin">${gris}</top><bottom style="thin">${gris}</bottom><diagonal/></border>`);
    } else if (spec.borde === 'total') {
      const neg = '<color rgb="FF1F3864"/>';
      borderId = this._indice(this.bordes, `<border><left style="thin">${gris}</left><right style="thin">${gris}</right><top style="medium">${neg}</top><bottom style="medium">${neg}</bottom><diagonal/></border>`);
    }

    let numFmtId = 0;
    if (spec.formato) {
      const predef = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4 };
      if (predef[spec.formato]) numFmtId = predef[spec.formato];
      else {
        if (!this.formatos.has(spec.formato)) this.formatos.set(spec.formato, 164 + this.formatos.size);
        numFmtId = this.formatos.get(spec.formato);
      }
    }

    const alinear = `<alignment horizontal="${spec.h || 'general'}" vertical="${spec.v || 'center'}"` +
      (spec.ajustar ? ' wrapText="1"' : '') + (spec.sangria ? ` indent="${spec.sangria}"` : '') + '/>';
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      (numFmtId ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fillId ? ' applyFill="1"' : '') +
      (borderId ? ' applyBorder="1"' : '') + ` applyAlignment="1">${alinear}</xf>`;
    this.estilos.push(xf);
    const id = this.estilos.length - 1;
    this.cacheEstilos.set(clave, id);
    return id;
  }

  hoja(nombre, opciones = {}) {
    const h = new Hoja(this, nombre, opciones);
    this.hojas.push(h);
    return h;
  }

  _xmlEstilos() {
    const numFmts = [...this.formatos.entries()]
      .map(([codigo, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(codigo)}"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts ? `<numFmts count="${this.formatos.size}">${numFmts}</numFmts>` : '') +
      `<fonts count="${this.fuentes.length}">${this.fuentes.join('')}</fonts>` +
      `<fills count="${this.rellenos.length}">${this.rellenos.join('')}</fills>` +
      `<borders count="${this.bordes.length}">${this.bordes.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.estilos.length}">${this.estilos.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  // Devuelve un Buffer con el contenido del .xlsx
  generar(meta = {}) {
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const archivos = [];

    archivos.push({
      nombre: '[Content_Types].xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        this.hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>'
    });

    archivos.push({
      nombre: '_rels/.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
        '</Relationships>'
    });

    const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    archivos.push({
      nombre: 'docProps/core.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(meta.titulo || 'Reporte')}</dc:title><dc:creator>${esc(meta.autor || 'ToolStore')}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created></cp:coreProperties>`
    });
    archivos.push({
      nombre: 'docProps/app.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ToolStore</Application></Properties>'
    });

    // Nombres definidos: filtros automáticos y filas que se repiten al imprimir
    const nombres = [];
    this.hojas.forEach((h, i) => {
      const q = `'${h.nombre.replace(/'/g, "''")}'`;
      if (h.rangoFiltro) {
        const [a, b] = h.rangoFiltro.split(':');
        const abs = (r) => r.replace(/([A-Z]+)(\d+)/, '$$$1$$$2');
        nombres.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${q}!${abs(a)}:${abs(b)}</definedName>`);
      }
      if (h.repetirFilas) {
        const [a, b] = h.repetirFilas;
        nombres.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${q}!$${a}:$${b}</definedName>`);
      }
    });

    archivos.push({
      nombre: 'xl/workbook.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>` +
        this.hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets>' + (nombres.length ? `<definedNames>${nombres.join('')}</definedNames>` : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
    });

    archivos.push({
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        this.hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${this.hojas.length + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
        '</Relationships>'
    });

    archivos.push({ nombre: 'xl/styles.xml', contenido: this._xmlEstilos() });
    this.hojas.forEach((h, i) => archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: h._xml(i === 0) }));

    return crearZip(archivos);
  }
}

// ---------------------------------------------------------------------------
// Hoja
// ---------------------------------------------------------------------------
class Hoja {
  constructor(libro, nombre, opciones) {
    this.libro = libro;
    this.nombre = String(nombre).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    this.filas = new Map(); // número de fila (1…) → { celdas, alto }
    this.anchos = [];
    this.combinadas = [];
    this.congelado = null; // { fila, columna } = cuántas filas/columnas quedan fijas
    this.rangoFiltro = null;
    this.repetirFilas = null;
    this.color = opciones.color || null;
    this.sinCuadricula = opciones.sinCuadricula !== false;
  }

  // celdas: arreglo; cada elemento puede ser null, un valor, o { v, s, f }
  fila(numero, celdas, alto) {
    this.filas.set(numero, { celdas, alto });
    return this;
  }

  combinar(rango) { this.combinadas.push(rango); return this; }
  columnas(anchos) { this.anchos = anchos; return this; }
  congelar(filas, columnas = 0) { this.congelado = { filas, columnas }; return this; }
  filtro(rango) { this.rangoFiltro = rango; return this; }
  repetir(desde, hasta) { this.repetirFilas = [desde, hasta]; return this; }

  _celda(ref, c) {
    if (c === null || c === undefined) return '';
    const obj = typeof c === 'object' && !(c instanceof Date) ? c : { v: c };
    const s = obj.s ? ` s="${obj.s}"` : '';
    const v = obj.v;
    if (obj.f) {
      const cache = typeof v === 'number' && Number.isFinite(v) ? `<v>${v}</v>` : '';
      return `<c r="${ref}"${s}><f>${esc(obj.f)}</f>${cache}</c>`;
    }
    if (v === null || v === undefined || v === '') return `<c r="${ref}"${s}/>`;
    if (v instanceof Date) {
      const n = fechaExcel(v);
      return n === null ? `<c r="${ref}"${s}/>` : `<c r="${ref}"${s}><v>${n}</v></c>`;
    }
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }

  _xml(activa) {
    const numeros = [...this.filas.keys()].sort((a, b) => a - b);
    const ultimaFila = numeros.length ? numeros[numeros.length - 1] : 1;
    const ultimaCol = Math.max(1, ...[...this.filas.values()].map(f => f.celdas.length)) - 1;

    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    xml += `<sheetPr>${this.color ? `<tabColor rgb="FF${this.color}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>`;
    xml += `<dimension ref="A1:${letraColumna(ultimaCol)}${ultimaFila}"/>`;

    xml += `<sheetViews><sheetView workbookViewId="0"${activa ? ' tabSelected="1"' : ''}${this.sinCuadricula ? ' showGridLines="0"' : ''}>`;
    if (this.congelado) {
      const { filas, columnas } = this.congelado;
      const celdaSup = `${letraColumna(columnas)}${filas + 1}`;
      const panel = filas && columnas ? 'bottomRight' : filas ? 'bottomLeft' : 'topRight';
      xml += `<pane${columnas ? ` xSplit="${columnas}"` : ''}${filas ? ` ySplit="${filas}"` : ''} topLeftCell="${celdaSup}" activePane="${panel}" state="frozen"/>`;
      xml += `<selection pane="${panel}" activeCell="${celdaSup}" sqref="${celdaSup}"/>`;
    }
    xml += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';

    if (this.anchos.length) {
      xml += '<cols>' + this.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    }

    xml += '<sheetData>';
    for (const n of numeros) {
      const { celdas, alto } = this.filas.get(n);
      xml += `<row r="${n}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>`;
      celdas.forEach((c, i) => { xml += this._celda(`${letraColumna(i)}${n}`, c); });
      xml += '</row>';
    }
    xml += '</sheetData>';

    if (this.rangoFiltro) xml += `<autoFilter ref="${this.rangoFiltro}"/>`;
    if (this.combinadas.length) {
      xml += `<mergeCells count="${this.combinadas.length}">${this.combinadas.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`;
    }
    xml += '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    xml += '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
    xml += '<headerFooter><oddFooter>&amp;LToolStore&amp;CPágina &amp;P de &amp;N&amp;R&amp;D</oddFooter></headerFooter>';
    xml += '</worksheet>';
    return xml;
  }
}

module.exports = { Libro, letraColumna, fechaExcel, crearZip };
