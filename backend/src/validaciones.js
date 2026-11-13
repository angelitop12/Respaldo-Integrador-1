// Validaciones de datos del sistema: formato de cada campo y filtro de contenido indebido.
// Se usa en el backend (que es la validación que NO se puede saltar) y las mismas reglas están en el frontend
// (frontend/src/app/utils/validaciones.ts) para avisar al usuario antes de enviar el formulario.

// ---------------------------------------------------------------------------
// FILTRO DE CONTENIDO INDEBIDO
// ---------------------------------------------------------------------------
// Palabras completas (con su plural). Se comparan sin tildes, sin mayúsculas, con números/símbolos típicos
// cambiados por letras (p0rn0, put@) y sin letras repetidas (pornoooo).
const PALABRAS = [
  // armas y violencia
  'arma', 'armas', 'arma de fuego', 'armas de fuego', 'arma blanca', 'revolver', 'fusil', 'rifle', 'escopeta',
  'metralleta', 'ametralladora', 'carabina', 'municion', 'municiones', 'balas', 'granada', 'bayoneta',
  'dinamita', 'polvora', 'bomba molotov', 'cocktail molotov', 'ak47', 'ak 47', 'ak-47', 'sicario', 'secuestro',
  'pistola de fuego', 'pistola 9mm', 'pistola calibre', 'pistola automatica', 'pistola nueve milimetros',
  // drogas
  'cocaina', 'marihuana', 'heroina', 'extasis', 'lsd', 'pasta basica', 'hachis', 'opio', 'anfetamina',
  'cannabis', 'cripy', 'drogas', 'droga',
  // contenido para adultos (+18)
  'sexo', 'sexual', 'sexy', 'porno', 'pene', 'vagina', 'culo', 'tetas', 'teta', 'verga', 'chocha',
  'prostituta', 'prostitutas', 'escort', 'condon', 'condones', 'desnudo', 'desnuda', 'desnudos', 'lenceria',
  'masturbacion', 'orgia', 'fetiche', 'swinger', 'onlyfans','Elsoxologo',
  // insultos y ofensas
  'puta', 'puto', 'putas', 'putos', 'mierda', 'mrd', 'ctm', 'conchatumadre', 'concha tu madre', 'concha de tu madre',
  'cojudo', 'cojuda', 'huevon', 'huevona', 'weon', 'weona', 'pendejo', 'pendeja', 'cabron', 'cabrona', 'maricon',
  'marica', 'imbecil', 'idiota', 'estupido', 'estupida', 'subnormal', 'retrasado', 'retrasada', 'cholo de mierda',
  'negro de mierda', 'terruco', 'hijo de puta', 'hdp', 'malparido', 'gilipollas', 'follar','cabro','gay'
];
// Raíces: se bloquea toda palabra que EMPIECE así (pornografía, pornográfico, marihuanero...)
const RAICES = [
  'pornograf', 'porno', 'erotic', 'prostitu', 'cocain', 'marihuan', 'heroin', 'metanfetamin', 'narcotraf',
  'sexshop', 'masturb', 'orgasm', 'genital', 'pedofil', 'terroris', 'asesin', 'violacion', 'violador', 'sexual','pistola','hijo'
];
// Frases de edad / adultos escritas con símbolos
const PATRON_ADULTOS = /(\bx{3,}\b|\+\s*18|18\s*\+|\bsolo\s+(para\s+)?adultos\b|\bpara\s+adultos\b|\bmayores?\s+de\s+18\b|\bcontenido\s+adulto\b)/i;

const quitarTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };

// minúsculas, sin tildes, números/símbolos -> letras, "p o r n o" -> "porno", y letras repetidas -> una sola
function normalizar(valor) {
  let t = quitarTildes(valor).toLowerCase();
  t = t.replace(/[0134578@$!]/g, (c) => LEET[c]);
  t = t.replace(/\b(?:[a-z][\s.\-_*]+){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]+/g, ''));
  return t.replace(/(.)\1+/g, '$1');
}
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const alternativas = PALABRAS.map((p) => escapar(normalizar(p)).replace(/ /g, '\\s+')).join('|');
const REGEX_PALABRAS = new RegExp(`(^|[^a-z])(?:${alternativas})s?(?![a-z])`);
const REGEX_RAICES = new RegExp(`(^|[^a-z])(?:${RAICES.map((r) => escapar(normalizar(r))).join('|')})`);

// true si el texto contiene algo que no debe guardarse (armas, +18, drogas, insultos)
function contenidoIndebido(valor) {
  const crudo = String(valor || '');
  if (PATRON_ADULTOS.test(quitarTildes(crudo))) return true;
  const t = normalizar(crudo);
  return REGEX_PALABRAS.test(t) || REGEX_RAICES.test(t);
}

// ---------------------------------------------------------------------------
// FORMATO DE CADA TIPO DE DATO
// ---------------------------------------------------------------------------
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const NOMBRE_PERSONA = /^\p{L}[\p{L} .'’-]*$/u;
// Nombres de productos, marcas, categorías, empresas, zonas...: letras, números y signos habituales (1/2", 5%, A&B, #6, (9m))
const NOMBRE_GENERAL = /^[\p{L}\p{N}][\p{L}\p{N} .,'’"()/&%#+°ºª:×-]*$/u;
const TEXTO_LIBRE = /^[\p{L}\p{N}][\p{L}\p{N} \t\r\n.,;:'’"()/&%#+°ºª¿?¡!×_-]*$/u;
const USUARIO = /^[A-Za-z0-9._-]{4,30}$/;
const CODIGO = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

// Teclazos del tipo "asdfgh" o "qwerty": 6 o más consonantes seguidas dentro de una palabra
const TECLAZO = /[bcdfghjklmnpqrstvwxz]{6,}/i;
const REPETIDO = /(.)\1{4,}/; // aaaaa, 11111

function crear(ErrorHttp) {
  const falla = (mensaje) => { throw new ErrorHttp(400, mensaje); };
  const MENSAJE_INDEBIDO = (etiqueta) => `${etiqueta} contiene palabras no permitidas (armas, contenido para adultos, drogas u ofensas)`;

  // Revisa un texto y devuelve el texto limpio (sin espacios de más). Lanza error 400 si no es válido.
  function revisar(valor, etiqueta, { patron, min = 1, max = 200, ejemplo = '', obligatorio = true, filtro = true } = {}) {
    if (valor === undefined || valor === null) valor = '';
    if (typeof valor !== 'string') falla(`${etiqueta} no es válido`);
    const t = valor.replace(/\s+/g, ' ').trim();
    if (!t) {
      if (obligatorio) falla(`${etiqueta} es obligatorio`);
      return '';
    }
    if (t.length < min) falla(`${etiqueta} tiene muy pocos caracteres (mínimo ${min})`);
    if (t.length > max) falla(`${etiqueta} no puede superar ${max} caracteres`);
    if (/[<>{}`\\]|javascript:/i.test(t)) falla(`${etiqueta} contiene caracteres no permitidos`);
    if (patron && !patron.test(t)) falla(`${etiqueta} tiene un formato no válido${ejemplo ? ` (ejemplo: ${ejemplo})` : ''}`);
    if (REPETIDO.test(t)) falla(`${etiqueta} no es válido: tiene demasiados caracteres repetidos`);
    if (!/\p{L}/u.test(t) && patron !== CODIGO) falla(`${etiqueta} debe incluir letras`);
    if (filtro) {
      if (TECLAZO.test(quitarTildes(t))) falla(`${etiqueta} no parece un texto real`);
      if (contenidoIndebido(t)) falla(MENSAJE_INDEBIDO(etiqueta));
    }
    return t;
  }

  return {
    contenidoIndebido,
    // Nombre de una persona: solo letras, espacios, punto, apóstrofo y guion
    nombrePersona: (v, etiqueta = 'El nombre', op = {}) =>
      revisar(v, etiqueta, { patron: NOMBRE_PERSONA, min: 3, max: 100, ejemplo: 'Juan Pérez Soto', ...op }),
    // Producto, marca, categoría, empresa, zona, cliente...
    nombre: (v, etiqueta = 'El nombre', op = {}) =>
      revisar(v, etiqueta, { patron: NOMBRE_GENERAL, min: 2, max: 200, ...op }),
    // Descripciones, direcciones, observaciones, motivos
    texto: (v, etiqueta = 'El texto', op = {}) =>
      revisar(v, etiqueta, { patron: TEXTO_LIBRE, min: 2, max: 300, ...op }),
    // Código corto (pasillo, estante, código de proveedor, unidad)
    codigo: (v, etiqueta = 'El código', op = {}) =>
      revisar(v, etiqueta, { patron: CODIGO, min: 1, max: 30, filtro: false, ...op }),
    usuario: (v, etiqueta = 'El usuario') =>
      revisar(v, etiqueta, { patron: USUARIO, min: 4, max: 30, ejemplo: 'juan.perez', filtro: false }),
    // Contraseña nueva: 6 a 72 caracteres, con al menos una letra y un número, sin espacios
    clave(v, etiqueta = 'La contraseña') {
      const t = typeof v === 'string' ? v : '';
      if (!t) falla(`${etiqueta} es obligatoria`);
      if (t.length < 6) falla(`${etiqueta} debe tener al menos 6 caracteres`);
      if (t.length > 72) falla(`${etiqueta} no puede superar 72 caracteres`);
      if (/\s/.test(t)) falla(`${etiqueta} no puede tener espacios`);
      if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) falla(`${etiqueta} debe tener al menos una letra y un número`);
      return t;
    },
    correo(v, etiqueta = 'El correo', { obligatorio = true } = {}) {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t) { if (obligatorio) falla(`${etiqueta} es obligatorio`); return ''; }
      if (t.length > 150 || !CORREO.test(t) || t.includes('..')) falla(`${etiqueta} no es válido (ejemplo: nombre@correo.com)`);
      if (contenidoIndebido(t.split('@')[0])) falla(MENSAJE_INDEBIDO(etiqueta));
      return t.toLowerCase();
    },
    // Teléfono peruano: celular de 9 dígitos que empieza con 9, o fijo de 6 a 8 dígitos (con o sin código de ciudad). Admite +51.
    telefono(v, etiqueta = 'El teléfono', { obligatorio = false } = {}) {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t) { if (obligatorio) falla(`${etiqueta} es obligatorio`); return ''; }
      if (!/^[\d+()\s-]+$/.test(t)) falla(`${etiqueta} solo puede tener números (ejemplo: 987654321)`);
      let d = t.replace(/\D/g, '');
      if (d.startsWith('51') && d.length === 11) d = d.slice(2);
      const celular = /^9\d{8}$/.test(d);
      const fijo = /^0?\d{1,2}\d{6,7}$/.test(d) && d.length >= 6 && d.length <= 9 && !d.startsWith('9');
      if (!celular && !fijo) falla(`${etiqueta} no es válido: un celular tiene 9 dígitos y empieza con 9 (ejemplo: 987654321)`);
      return t.replace(/\s+/g, ' ');
    },
    // Número con rango. Devuelve el número (o `porDefecto` si no llegó nada).
    numero(v, etiqueta, { min = 0, max = 1000000, entero = false, decimales = 2, porDefecto } = {}) {
      if (v === undefined || v === null || v === '') {
        if (porDefecto !== undefined) return porDefecto;
        falla(`${etiqueta} es obligatorio`);
      }
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
      if (!Number.isFinite(n)) falla(`${etiqueta} debe ser un número`);
      if (n < min || n > max) falla(`${etiqueta} debe estar entre ${min} y ${max.toLocaleString('en-US')}`);
      if (entero && !Number.isInteger(n)) falla(`${etiqueta} debe ser un número entero`);
      if (!entero && Math.abs(n * 10 ** decimales - Math.round(n * 10 ** decimales)) > 1e-6) {
        falla(`${etiqueta} admite como máximo ${decimales} decimales`);
      }
      return n;
    }
  };
}

module.exports = { crear, contenidoIndebido, normalizar };