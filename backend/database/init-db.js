// Uso:
//   npm run db:init     -> crea las tablas y datos semilla (se niega si la BD ya tiene datos)
//   npm run db:reset    -> BORRA todo y vuelve a crear la BD desde schema.sql
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const pool = require('../src/db');

async function inicializarBaseDatos() {
  const forzar = process.argv.includes('--force');
  const schemaPath = path.join(__dirname, 'schema.sql');

  try {
    // schema.sql empieza con DROP TABLE: protegemos los datos existentes
    const { rows } = await pool.query("SELECT to_regclass('public.usuarios') IS NOT NULL AS existe");
    if (rows[0].existe && !forzar) {
      console.error('La base de datos ya tiene tablas. Ejecutar este script BORRARÍA todos los datos.');
      console.error('Si estás seguro, usa:  npm run db:reset');
      process.exitCode = 1;
      return;
    }

    console.log(`Leyendo script SQL desde: ${schemaPath}`);
    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Ejecutando script de inicialización en PostgreSQL...');
    // Un solo pool.query con varias sentencias se ejecuta como una transacción: o entra todo o nada.
    await pool.query(sql);
    console.log(`Base de datos "${process.env.DB_NAME || 'almacen_ferretero'}" inicializada con datos semilla.`);
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

inicializarBaseDatos();
