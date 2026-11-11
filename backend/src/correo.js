// ==========================================================================
// Envío de correos por SMTP (para el código de "Olvidé mi contraseña").
// No necesita instalar paquetes: usa solo los módulos "net/tls" de Node.js.
// Se activa con SMTP_USER y SMTP_PASS en el .env (ver .env.example). Si faltan,
// el sistema no envía correos y el código se muestra en la terminal del backend.
// ==========================================================================
const tls = require('tls');

function configuracion() {
  const usuario = (process.env.SMTP_USER || '').trim();
  return {
    host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    puerto: Number(process.env.SMTP_PORT) || 465, // 465 = conexión segura (TLS) desde el inicio
    usuario,
    // Gmail muestra la contraseña de aplicación con espacios ("abcd efgh ijkl mnop"): se quitan
    clave: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    desde: (process.env.SMTP_FROM || usuario).trim(),
    // Solo para pruebas con un servidor falso: SMTP_TLS_ESTRICTO=0. Con el correo real siempre debe ir estricto.
    estricto: !['0', 'false', 'no'].includes((process.env.SMTP_TLS_ESTRICTO || '').trim().toLowerCase())
  };
}

const correoConfigurado = () => {
  const c = configuracion();
  return Boolean(c.usuario && c.clave);
};

const b64 = (texto) => Buffer.from(texto, 'utf8').toString('base64');
const parrafos76 = (texto) => b64(texto).replace(/(.{76})/g, '$1\r\n');
const direccionValida = (d) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d);

// Envía un correo de texto simple. Devuelve una promesa; si algo falla, se rechaza con el motivo.
function enviarCorreo({ para, asunto, texto }) {
  const c = configuracion();
  return new Promise((resolve, reject) => {
    if (!c.usuario || !c.clave) return reject(new Error('El correo no está configurado (faltan SMTP_USER y SMTP_PASS)'));
    if (!direccionValida(para) || !direccionValida(c.desde)) return reject(new Error('Dirección de correo no válida'));
    if (/[\r\n]/.test(asunto)) return reject(new Error('Asunto no válido'));

    let buffer = '';
    let espera = null;
    let terminado = false;

    const socket = tls.connect({ host: c.host, port: c.puerto, servername: c.host, rejectUnauthorized: c.estricto });
    socket.setEncoding('utf8');

    const terminar = (error) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      if (espera) { espera.rej(error || new Error('Conexión cerrada')); espera = null; }
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const reloj = setTimeout(() => terminar(new Error('El servidor de correo tardó demasiado en responder')), 20000);

    // Una respuesta SMTP son una o varias líneas "250-..." y termina con una línea "250 ..."
    const revisar = () => {
      if (!espera) return;
      const m = /(?:^|\r\n)(\d{3}) [^\r\n]*\r\n/.exec(buffer);
      if (!m) return;
      const fin = m.index + m[0].length;
      const respuesta = { codigo: Number(m[1]), texto: buffer.slice(0, fin).trim() };
      buffer = buffer.slice(fin);
      const { res } = espera;
      espera = null;
      res(respuesta);
    };
    socket.on('data', (trozo) => { buffer += trozo; revisar(); });
    socket.on('error', (e) => terminar(e));
    socket.on('close', () => terminar());

    const leer = () => new Promise((res, rej) => { espera = { res, rej }; revisar(); });
    const paso = async (linea, aceptados) => {
      if (linea !== null) socket.write(linea + '\r\n');
      const r = await leer();
      if (!aceptados.includes(r.codigo)) throw new Error(`El servidor de correo respondió: ${r.texto}`);
    };

    const mensaje = [
      `From: "ToolStore" <${c.desde}>`,
      `To: <${para}>`,
      `Subject: =?UTF-8?B?${b64(asunto)}?=`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      parrafos76(texto)
    ].join('\r\n');

    (async () => {
      await paso(null, [220]);
      await paso('EHLO toolstore.local', [250]);
      await paso('AUTH LOGIN', [334]);
      await paso(b64(c.usuario), [334]);
      await paso(b64(c.clave), [235]);
      await paso(`MAIL FROM:<${c.desde}>`, [250]);
      await paso(`RCPT TO:<${para}>`, [250, 251]);
      await paso('DATA', [354]);
      await paso(`${mensaje}\r\n.`, [250]);
      socket.write('QUIT\r\n');
      terminar();
    })().catch((e) => terminar(e));
  });
}

module.exports = { correoConfigurado, enviarCorreo };
