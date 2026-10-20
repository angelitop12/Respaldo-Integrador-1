require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

async function inicializarBaseDatos() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  console.log(`Leyendo script SQL desde: ${schemaPath}`);
  
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Ejecutando script de inicialización en PostgreSQL...');
    await pool.query(sql);
    console.log(' Base de datos "almacen_ferretero" inicializada y poblada con éxito con datos semilla.');
  } catch (error) {
    console.error(' Error al inicializar la base de datos:', error);
  } finally {
    await pool.end();
  }
}

inicializarBaseDatos();

