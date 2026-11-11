const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { Pool } = require('pg');

// Sin contraseña por defecto en el código: se lee siempre desde el archivo .env
// - En tu computadora: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
// - En internet (Supabase, Neon, Render, etc.): una sola dirección DATABASE_URL que te da el proveedor.
const url = (process.env.DATABASE_URL || '').trim();
const configuracion = url
  ? {
      connectionString: url,
      // Los proveedores en la nube exigen conexión cifrada. Si la dirección ya trae "sslmode=", se respeta.
      ssl: /sslmode=/i.test(url) ? undefined : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'almacen_ferretero',
    };
const pool = new Pool(configuracion);

pool.on('error', (err) => {
  console.error('Error imprevisto en la conexión a PostgreSQL:', err.message);
});

module.exports = pool;