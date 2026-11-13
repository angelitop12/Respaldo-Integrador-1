// Validaciones de los formularios (mismas reglas que valida el servidor en backend/src/validaciones.js).
// Cada función devuelve el mensaje de error, o '' si el dato está bien. El servidor vuelve a validar todo,
// así que esto solo sirve para avisar al usuario al instante.

const PALABRAS: string[] = [
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
  'masturbacion', 'orgia', 'fetiche', 'swinger', 'onlyfans',
  // insultos y ofensas
  'puta', 'puto', 'putas', 'putos', 'mierda', 'mrd', 'ctm', 'conchatumadre', 'concha tu madre', 'concha de tu madre',
  'cojudo', 'cojuda', 'huevon', 'huevona', 'weon', 'weona', 'pendejo', 'pendeja', 'cabron', 'cabrona', 'maricon',
  'marica', 'imbecil', 'idiota', 'estupido', 'estupida', 'subnormal', 'retrasado', 'retrasada', 'cholo de mierda',
  'negro de mierda', 'terruco', 'hijo de puta', 'hdp', 'malparido', 'gilipollas', 'follar','cabro'
];
const RAICES: string[] = [
  'pornograf', 'porno', 'erotic', 'prostitu', 'cocain', 'marihuan', 'heroin', 'metanfetamin', 'narcotraf',
  'sexshop', 'masturb', 'orgasm', 'genital', 'pedofil', 'terroris', 'asesin', 'violacion', 'violador', 'sexual','pistola'
];
const PATRON_ADULTOS = /(\bx{3,}\b|\+\s*18|18\s*\+|\bsolo\s+(para\s+)?adultos\b|\bpara\s+adultos\b|\bmayores?\s+de\s+18\b|\bcontenido\s+adulto\b)/i;

const quitarTildes = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };

function normalizar(valor: string): string {
  let t = quitarTildes(valor).toLowerCase();
  t = t.replace(/[0134578@$!]/g, (c) => LEET[c]);
  t = t.replace(/\b(?:[a-z][\s.\-_*]+){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]+/g, ''));
  return t.replace(/(.)\1+/g, '$1');
}
const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternativas = PALABRAS.map((p) => escapar(normalizar(p)).replace(/ /g, '\\s+')).join('|');
const REGEX_PALABRAS = new RegExp(`(^|[^a-z])(?:${alternativas})s?(?![a-z])`);
const REGEX_RAICES = new RegExp(`(^|[^a-z])(?:${RAICES.map((r) => escapar(normalizar(r))).join('|')})`);

/** true si el texto tiene armas, contenido +18, drogas u ofensas */
export function contenidoIndebido(valor: string): boolean {
  const crudo = String(valor || '');
  if (PATRON_ADULTOS.test(quitarTildes(crudo))) return true;
  const t = normalizar(crudo);
  return REGEX_PALABRAS.test(t) || REGEX_RAICES.test(t);
}

const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const NOMBRE_PERSONA = /^\p{L}[\p{L} .'’-]*$/u;
const NOMBRE_GENERAL = /^[\p{L}\p{N}][\p{L}\p{N} .,'’"()/&%#+°ºª:×-]*$/u;
const TEXTO_LIBRE = /^[\p{L}\p{N}][\p{L}\p{N} \t\r\n.,;:'’"()/&%#+°ºª¿?¡!×_-]*$/u;
const USUARIO = /^[A-Za-z0-9._-]{4,30}$/;
const CODIGO = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const TECLAZO = /[bcdfghjklmnpqrstvwxz]{6,}/i;
const REPETIDO = /(.)\1{4,}/;

interface OpcionesTexto { min?: number; max?: number; obligatorio?: boolean; ejemplo?: string; filtro?: boolean; }

function revisar(valor: unknown, etiqueta: string, patron: RegExp | null, op: OpcionesTexto): string {
  const { min = 1, max = 200, obligatorio = true, ejemplo = '', filtro = true } = op;
  const t = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return obligatorio ? `${etiqueta} es obligatorio` : '';
  if (t.length < min) return `${etiqueta} tiene muy pocos caracteres (mínimo ${min})`;
  if (t.length > max) return `${etiqueta} no puede superar ${max} caracteres`;
  if (/[<>{}\`\\]|javascript:/i.test(t)) return `${etiqueta} contiene caracteres no permitidos`;
  if (patron && !patron.test(t)) return `${etiqueta} tiene un formato no válido${ejemplo ? ` (ejemplo: ${ejemplo})` : ''}`;
  if (REPETIDO.test(t)) return `${etiqueta} no es válido: tiene demasiados caracteres repetidos`;
  if (!/\p{L}/u.test(t) && patron !== CODIGO) return `${etiqueta} debe incluir letras`;
  if (filtro) {
    if (TECLAZO.test(quitarTildes(t))) return `${etiqueta} no parece un texto real`;
    if (contenidoIndebido(t)) return `${etiqueta} contiene palabras no permitidas (armas, contenido para adultos, drogas u ofensas)`;
  }
  return '';
}

/** Nombre de persona: solo letras, espacios, punto, apóstrofo y guion */
export const errNombrePersona = (v: unknown, etiqueta = 'El nombre', op: OpcionesTexto = {}) =>
  revisar(v, etiqueta, NOMBRE_PERSONA, { min: 3, max: 100, ejemplo: 'Juan Pérez Soto', ...op });
/** Producto, marca, categoría, empresa, zona, cliente... */
export const errNombre = (v: unknown, etiqueta = 'El nombre', op: OpcionesTexto = {}) =>
  revisar(v, etiqueta, NOMBRE_GENERAL, { min: 2, max: 200, ...op });
/** Descripciones, direcciones, observaciones, motivos */
export const errTexto = (v: unknown, etiqueta = 'El texto', op: OpcionesTexto = {}) =>
  revisar(v, etiqueta, TEXTO_LIBRE, { min: 2, max: 300, ...op });
/** Código corto (pasillo, estante, código de proveedor, unidad) */
export const errCodigo = (v: unknown, etiqueta = 'El código', op: OpcionesTexto = {}) =>
  revisar(v, etiqueta, CODIGO, { min: 1, max: 30, filtro: false, ...op });
export const errUsuario = (v: unknown, etiqueta = 'El usuario') =>
  revisar(v, etiqueta, USUARIO, { min: 4, max: 30, ejemplo: 'juan.perez', filtro: false });

export function errCorreo(v: unknown, etiqueta = 'El correo', obligatorio = true): string {
  const t = String(v ?? '').trim();
  if (!t) return obligatorio ? `${etiqueta} es obligatorio` : '';
  if (t.length > 150 || !CORREO.test(t) || t.includes('..')) return `${etiqueta} no es válido (ejemplo: nombre@correo.com)`;
  if (contenidoIndebido(t.split('@')[0])) return `${etiqueta} contiene palabras no permitidas`;
  return '';
}

/** Teléfono peruano: celular de 9 dígitos que empieza con 9, o fijo de 6 a 8 dígitos. Admite +51. */
export function errTelefono(v: unknown, etiqueta = 'El teléfono', obligatorio = false): string {
  const t = String(v ?? '').trim();
  if (!t) return obligatorio ? `${etiqueta} es obligatorio` : '';
  if (!/^[\d+()\s-]+$/.test(t)) return `${etiqueta} solo puede tener números (ejemplo: 987654321)`;
  let d = t.replace(/\D/g, '');
  if (d.startsWith('51') && d.length === 11) d = d.slice(2);
  const celular = /^9\d{8}$/.test(d);
  const fijo = /^0?\d{1,2}\d{6,7}$/.test(d) && d.length >= 6 && d.length <= 9 && !d.startsWith('9');
  return celular || fijo ? '' : `${etiqueta} no es válido: un celular tiene 9 dígitos y empieza con 9 (ejemplo: 987654321)`;
}

interface OpcionesNumero { min?: number; max?: number; entero?: boolean; decimales?: number; obligatorio?: boolean; }
export function errNumero(v: unknown, etiqueta: string, op: OpcionesNumero = {}): string {
  const { min = 0, max = 1000000, entero = false, decimales = 2, obligatorio = true } = op;
  if (v === null || v === undefined || v === '') return obligatorio ? `${etiqueta} es obligatorio` : '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return `${etiqueta} debe ser un número`;
  if (n < min || n > max) return `${etiqueta} debe estar entre ${min} y ${max.toLocaleString('en-US')}`;
  if (entero && !Number.isInteger(n)) return `${etiqueta} debe ser un número entero`;
  if (!entero && Math.abs(n * 10 ** decimales - Math.round(n * 10 ** decimales)) > 1e-6) return `${etiqueta} admite como máximo ${decimales} decimales`;
  return '';
}

/** Contraseña nueva: 6 a 72 caracteres, con al menos una letra y un número, sin espacios */
export function errClave(v: unknown, etiqueta = 'La contraseña'): string {
  const t = typeof v === 'string' ? v : '';
  if (!t) return `${etiqueta} es obligatoria`;
  if (t.length < 6) return `${etiqueta} debe tener al menos 6 caracteres`;
  if (t.length > 72) return `${etiqueta} no puede superar 72 caracteres`;
  if (/\s/.test(t)) return `${etiqueta} no puede tener espacios`;
  if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) return `${etiqueta} debe tener al menos una letra y un número`;
  return '';
}

/** Devuelve el primer mensaje de error no vacío (o '' si todo está bien) */
export const primerError = (...errores: string[]): string => errores.find((e) => !!e) || '';