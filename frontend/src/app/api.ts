// Dirección del backend.
// - Con "npm start" (la página en el puerto 4200) el backend está en localhost:3000.
// - Publicado en internet, la página y el backend comparten dirección, así que basta "/api".
const enDesarrollo = typeof location !== 'undefined' && location.port === '4200';
export const API = enDesarrollo ? 'http://localhost:3000/api' : '/api';