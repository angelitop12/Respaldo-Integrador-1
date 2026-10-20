const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'almacen_ferretero',
});

pool.on('connect', () => {
  console.log('Conexión exitosa a la base de datos PostgreSQL.');
});

pool.on('error', (err) => {
  console.error('Error imprevisto en la conexión a PostgreSQL:', err);
});

module.exports = pool;

