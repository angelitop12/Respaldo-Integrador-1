// ==========================================================================
// Seguridad: sesión con token firmado (JWT HS256) y permisos por rol.
// Usa solo el módulo "crypto" de Node.js: no necesita instalar paquetes nuevos.
// ==========================================================================
const crypto = require('crypto');

const ROLES = { ADMIN: 'ADMINISTRADOR', VENDEDOR: 'VENDEDOR', ALMACENERO: 'ALMACENERO' };

// La clave secreta firma los tokens. Debe estar en .env (JWT_SECRET) y no compartirse nunca.
// Si falta, se genera una al azar: funciona, pero las sesiones se pierden cada vez que se reinicia el servidor.
let SECRETO = (process.env.JWT_SECRET || '').trim();
if (SECRETO.length < 16) {
  SECRETO = crypto.randomBytes(32).toString('hex');
  console.warn('AVISO: falta JWT_SECRET en .env (o tiene menos de 16 caracteres). Se usa una clave temporal:');
  console.warn('       las sesiones se cerrarán al reiniciar el servidor. Agrega JWT_SECRET al .env.');
}

const HORAS = Number(process.env.JWT_EXPIRA_HORAS) > 0 ? Number(process.env.JWT_EXPIRA_HORAS) : 8;
const DURACION_SEG = Math.round(HORAS * 3600);

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const firma = (datos) => crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url');

function firmarToken(usuario) {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: usuario.id,
    usuario: usuario.usuario,
    rol: usuario.rol,
    iat: ahora,
    exp: ahora + DURACION_SEG
  })}`;
  return { token: `${cuerpo}.${firma(cuerpo)}`, expiraEn: DURACION_SEG };
}

// Devuelve los datos del token, o null si está alterado, mal formado o vencido
function verificarToken(token) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecera, cuerpo, recibida] = partes;

  const esperada = firma(`${cabecera}.${cuerpo}`);
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    if (JSON.parse(Buffer.from(cabecera, 'base64url').toString()).alg !== 'HS256') return null;
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (!datos.exp || datos.exp < Math.floor(Date.now() / 1000)) return null;
    return datos;
  } catch {
    return null;
  }
}

// Rutas que se pueden usar SIN iniciar sesión
const PUBLICAS = new Set(['GET /estado', 'POST /auth/login', 'POST /auth/registro', 'POST /auth/register', 'POST /auth/olvide-clave', 'POST /auth/restablecer-clave']);

// Se monta con app.use('/api', autenticar): todo lo demás exige "Authorization: Bearer <token>"
function autenticar(req, res, next) {
  // Ruta completa sin "/api" ni parámetros (?x=1); se usa originalUrl porque no cambia según dónde se monte el middleware
  const ruta = (req.originalUrl || req.url || '').split('?')[0].replace(/^\/api/, '').replace(/\/+$/, '');
  if (req.method === 'OPTIONS' || PUBLICAS.has(`${req.method} ${ruta}`)) return next();

  const cabecera = req.headers.authorization || '';
  const datos = cabecera.startsWith('Bearer ') ? verificarToken(cabecera.slice(7)) : null;
  if (!datos) {
    // "codigo" permite al frontend distinguir esto de otros 401 (p. ej. contraseña actual incorrecta) y cerrar la sesión
    return res.status(401).json({ error: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.', codigo: 'SESION_INVALIDA' });
  }
  req.usuario = { id: Number(datos.sub), usuario: datos.usuario, rol: datos.rol };
  next();
}

// permitir('ALMACENERO') -> el administrador y los roles indicados. Cualquier otro recibe 403.
const permitir = (...roles) => (req, res, next) => {
  const rol = req.usuario && req.usuario.rol;
  if (rol === ROLES.ADMIN || roles.includes(rol)) return next();
  res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
};

module.exports = { ROLES, firmarToken, verificarToken, autenticar, permitir };
