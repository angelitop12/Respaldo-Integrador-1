// =====================================================================
//  DATOS DE EJEMPLO
//  Sirven para que la app se vea llena mientras no hay backend.
//  Para empezar con todo vacío, cambia el valor de abajo a  false.
// =====================================================================
import { Cliente, Compra, Producto, Proveedor, Reporte, Venta } from './models';

export const CARGAR_DATOS_DEMO = true;

const MS_DIA = 24 * 60 * 60 * 1000;
const inicioDeHoy = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime();

export const formatoFecha = (ts: number) => new Date(ts).toLocaleDateString('es-PE');
export const formatoHora = (ts: number) =>
  new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

// Momento "hace X días / horas / minutos". Si pedimos algo de "hoy", nunca cae antes de las 00:00.
function hace(dias: number, horas = 0, minutos = 0): number {
  const ts = Date.now() - dias * MS_DIA - horas * 3600000 - minutos * 60000;
  return dias === 0 ? Math.max(ts, inicioDeHoy()) : ts;
}

export const PRODUCTOS_DEMO: Producto[] = [
 
];

export const CLIENTES_DEMO: Cliente[] = [
 
];

export const PROVEEDORES_DEMO: Proveedor[] = [
  
];

// [días atrás, horas, minutos, cliente, método de pago, total]; de la más antigua a la más reciente.
const VENTAS_BASE: [number, number, number, string, string, number][] = [
  
];

// La lista muestra la venta más reciente primero.
export const VENTAS_DEMO: Venta[] = VENTAS_BASE.map(([d, h, m, cliente, metodoPago, total], i) => {
  const ts = hace(d, h, m);
  return { id: '#' + String(100001 + i).padStart(6, '0'), fecha: formatoFecha(ts), hora: formatoHora(ts), ts, cliente, vendedor: 'Administrador', metodoPago, total };
}).reverse();

type CompraBase = [number, string, string, number, number, number, 'Pendiente' | 'Recibido'];
const COMPRAS_BASE: CompraBase[] = [
  
];

export const COMPRAS_DEMO: Compra[] = COMPRAS_BASE.map(([id, proveedor, descripcion, cantidad, costoTotal, dias, estado]) => {
  const ts = hace(dias, 3);
  return { id, proveedor, descripcion, cantidad, costoTotal, fecha: formatoFecha(ts), ts, estado };
});

export const REPORTES_DEMO: Reporte[] = [
 
];
